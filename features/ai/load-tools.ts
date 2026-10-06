import { asSchema, type ToolSet, tool } from "ai";
import { formatDistanceToNowStrict } from "date-fns";
import { CALL_EXEC_TIMEOUT_MS, IS_DEV, PROMPT_LINE } from "@/config";
import { seesToolImages, type TextModel } from "@/features/ai/model";
import type { TextModelRef } from "@/features/ai/model.schema";
import { clockNow } from "@/features/ai/prompts/prompt-helper";
import {
  createThreadRecallTool,
  threadAnswerSpec,
  threadCancelSpec,
  threadSeenSpec,
  threadShowSpec,
  threadStartSpec,
  threadStatusSpec,
  threadTellSpec,
} from "@/features/ai/tools/bot.tool";
import { callTools } from "@/features/ai/tools/call.tool";
import { createDeckTools } from "@/features/ai/tools/deck.tool";
import { createLookTool } from "@/features/ai/tools/look.tool";
import { createMailTools } from "@/features/ai/tools/mail.tool";
import { createMcpTools } from "@/features/ai/tools/mcp.tool";
import { createMemoryTools } from "@/features/ai/tools/memory.tool";
import { createRoutineTools } from "@/features/ai/tools/routine.tool";
import {
  createCallSearchTool,
  createSearchTool,
} from "@/features/ai/tools/search.tool";
import { createSelfTools } from "@/features/ai/tools/self.tool";
import { createSignInTools } from "@/features/ai/tools/signin.tool";
import { createSkillTools } from "@/features/ai/tools/skills.tool";
import { TOOL_NAMES } from "@/features/ai/tools/tool-name";
import { createWorkspaceTools } from "@/features/ai/tools/workspace.tool";
// Type only: the runner imports this file (see createThreadTools)
import type { answerThread } from "@/features/bot/bot.runner";
import { threadActivity } from "@/features/bot/bot.schema";
import { loadSkills } from "@/features/skills/skills.discover";
import {
  botShellEnv,
  jobShellEnv,
  openWorkspace,
} from "@/features/workspace/workspace";
import { toDate } from "@/lib/date-like";
import { logger } from "@/lib/logger";
import { isPublicError } from "@/lib/public-error";
import { estimateTokens } from "@/lib/tokens";
import { clip } from "@/lib/utils";

/**
 * Which tools each runtime is handed; what it is told about them is the prompt's job.
 * Every tool runs on the server, including calls made during a voice session, except the page's
 * own: `end_call` and `emote` have no execute (the page hangs up, draws the word). The
 * split is by time, not capability: anything that
 * presupposes waiting (MCP, studio, browser) belongs to the bot. Only the call and an edit on
 * the memory screen write to memory: revising, carrying and naming need the user there. A bot reads it.
 * Skills are the one thing that crosses back, and only when asked for: the call reads one itself
 * when Settings › Thursday says so (`readSkills`).
 */

type ToolTarget = "thursday" | "bot" | "memory-edit" | "call-memory";

/** Which runtime is running, and what that run knows about itself. */
type ToolRun =
  | {
      target: "thursday";
      /** The current call; written on the thread row `delegate` opens. */
      callId?: string | null;
      /**
       * Settings › Thursday › Search the web, when the call opens: false leaves out the
       * Exa search. The page sends it with every tool call, so the route that runs a tool
       * builds the set the manifest listed.
       */
      webSearch?: boolean;
      /**
       * Settings › Thursday › Read skills herself, when the call opens: a skill is a page
       * of instructions arriving mid-sentence, so it is off unless switched on. Switched
       * off the prompt does not list them as hers either (thursday.prompt), so the two
       * always say the same thing.
       */
      readSkills?: boolean;
      /**
       * A call in writing (thursday/thursday.text): there is no line to drop and nothing hands
       * a turn back to the page mid-answer, so it holds none of the page's own tools.
       */
      written?: boolean;
      /**
       * What a call in writing runs on (thursday.text runsOnOf): any provider with a key, so
       * whether a picture in a tool result reaches it is asked of the model (seesToolImages).
       */
      model?: TextModelRef | null;
      /**
       * Written from a phone (reach): no screen of theirs is in front of them, so the tool
       * that puts what a thread made on it is left out. What they ask to see goes with her
       * answer instead, as the files it names.
       */
      phone?: boolean;
    }
  | {
      target: "bot";
      /** This run's bot name, the key of the bot table. */
      bot: string;
      /** The thread this run is in; every other one the bot has a desk in is what `thread_recall` can open. */
      thread?: string | null;
      /** The browser session this run's shell drives (workspace.ts jobShellEnv): this participant's own in the job. */
      session?: string | null;
      /** The model this run already resolved (bot.run resolveModel); its own native search is what `web_search` uses when no Exa key is set (tools/search.tool). */
      model?: TextModel | null;
    }
  /** An edit from the memory screen (memory/memory.edit): every memory tool, run as the model calls them. */
  | { target: "memory-edit" }
  /**
   * The pass after a spoken call (memory/call-memory): what writes and merges, in the call's
   * hand and under its id, as if its backend had kept it.
   */
  | { target: "call-memory"; callId: string };

/**
 * Starting threads and following them, one tool for each (tools/bot.tool). bot.runner is
 * imported dynamically to break a cycle (runner -> bot.run -> this file). `thread_start`
 * records which call opened the thread, so a later call's prompt finds it under the line
 * that opened it (Earlier calls). What a tool answers says what the next step is called:
 * the model follows a receipt better than a rule it read once.
 */
function createThreadTools(callId: string | null | undefined): ToolSet {
  /** The thread a call names, or the line that lets the model name one that exists. */
  const pick = async (ref: string) => {
    const { resolveThread } = await import("@/features/bot/thread.query");
    const one = ref.trim() ? await resolveThread(ref.trim()) : null;
    return one ?? (await noSuchThread(ref));
  };
  const say = async (
    id: string,
    words: string,
    bot?: string,
  ): Promise<Awaited<ReturnType<typeof answerThread>> | string> => {
    const runner = await import("@/features/bot/bot.runner");
    try {
      return await runner.answerThread(id, words, "thursday", bot);
    } catch (cause) {
      // Which bot, or that the question is gone, is the model's to fix: one line it can act on
      if (isPublicError(cause)) return cause.message;
      throw cause;
    }
  };

  return {
    [TOOL_NAMES.thread_start]: tool({
      description: threadStartSpec.description,
      inputSchema: threadStartSpec.parameters,
      execute: async ({ bot, request, label }) => {
        // Checked here, not by the run: by then the model has already said someone has it.
        // Resolved the same way the run resolves it (findJobBot)
        const { findJobBot, listJobBots } = await import(
          "@/features/bot/bot.query"
        );
        const found = await findJobBot(bot);
        // A switched-off bot resolves (a thread it already has still resumes) but is
        // not one to pick, so it fails here rather than in listJobBots.
        if (!found || found.disabled) {
          const names = (await listJobBots()).map((one) => one.name);
          return `There is no bot called "${bot}". The bots are: ${names.join(", ")}. Nothing was started — call again with one of those.`;
        }

        // The row carries the bot's own spelling, not the transcript's
        const { startThread } = await import("@/features/bot/bot.runner");
        const id = await startThread({
          bot: found.name,
          request,
          label,
          callId,
          from: "thursday",
        });
        return {
          threadId: id,
          // Named apart as well, for the page to tell her voice who has it (open-work startedOf)
          bot: found.name,
          label,
          // The label is the handle: without it in front of her, a follow-up
          // becomes a second thread instead of a word to the one running
          note: `${found.name} has "${label}". Its updates reach the conversation on their own. Anything further about this work — a correction, the next step once it finishes — is \`${TOOL_NAMES.thread_tell}\` with "${label}"; a question it asks is answered with \`${TOOL_NAMES.thread_answer}\`.`,
        };
      },
    }),

    [TOOL_NAMES.thread_tell]: tool({
      description: threadTellSpec.description,
      inputSchema: threadTellSpec.parameters,
      execute: async ({ thread, words }) => {
        const one = await pick(thread);
        if (typeof one === "string") return one;
        if (!words.trim()) return "Say what to pass on.";
        const told = await say(one.id, words.trim());
        if (typeof told === "string") return told;
        if (told?.answered)
          return {
            label: one.label,
            answered: told.answered,
            note: `${told.answered.bot} was waiting on a question, and took this as its answer.`,
          };
        return {
          label: one.label,
          bot: told?.to ?? one.bot,
          status: "running",
          note:
            one.status === "running"
              ? "The bot reads it before its next step."
              : "The bot picks the thread back up from there.",
        };
      },
    }),

    [TOOL_NAMES.thread_answer]: tool({
      description: threadAnswerSpec.description,
      inputSchema: threadAnswerSpec.parameters,
      execute: async ({ thread, bot, answer }) => {
        const one = await pick(thread);
        if (typeof one === "string") return one;
        if (!answer.trim()) return "Say what the answer is.";
        const { findThreadRoom } = await import("@/features/bot/thread.query");
        const questions = (await findThreadRoom(one.id))?.questions ?? [];
        const asked = questions.find(
          (question) => question.bot.toLowerCase() === bot.trim().toLowerCase(),
        );
        if (!asked)
          return questions.length
            ? `${bot} is not asking anything in "${one.label}". Waiting there: ${questions.map((question) => question.bot).join(", ")}. Call again with that bot.`
            : `No question is waiting in "${one.label}". To say something else to it, use \`${TOOL_NAMES.thread_tell}\`.`;
        const told = await say(one.id, answer.trim(), asked.bot);
        if (typeof told === "string") return told;
        return {
          label: one.label,
          answered: told?.answered ?? { bot: asked.bot, question: asked.text },
          note: `${asked.bot} has the answer to its question and goes on from it.`,
        };
      },
    }),

    [TOOL_NAMES.thread_status]: tool({
      description: threadStatusSpec.description,
      inputSchema: threadStatusSpec.parameters,
      execute: async ({ thread }) => {
        const { listThreadOverview, findThreadRoom } = await import(
          "@/features/bot/thread.query"
        );
        // The clock, because the one in the instructions is from when the call
        // opened and a call can run for hours; `since` is measured against this.
        const now = { now: clockNow() };
        const since = (at: Parameters<typeof toDate>[0]) =>
          formatDistanceToNowStrict(toDate(at), { addSuffix: true });
        const all = !thread.trim() || thread.trim().toLowerCase() === "all";
        // A named thread comes back whole; the list clips outcomes, and the model pads a clipped answer
        if (!all) {
          const one = await pick(thread);
          if (typeof one === "string") return one;
          const room = await findThreadRoom(one.id);
          return {
            ...now,
            label: one.label,
            id: one.id,
            bot: one.bot,
            participants: room?.participants ?? [],
            questions: room?.questions ?? [],
            status: one.status,
            since: since(one.updatedAt),
            outcome: one.outcome,
            ...(one.status === "waiting" && one.pending?.options.length
              ? { options: one.pending.options }
              : {}),
          };
        }
        const threads = await listThreadOverview();
        if (!threads.length) return "No thread has been started yet.";
        // No messages — only as much as is worth reading out: what it is
        // asking, the one line of what it is doing, or how it ended
        return {
          ...now,
          threads: threads.map((thread) => ({
            id: thread.id,
            label: thread.label,
            bot: thread.bot,
            status: thread.status,
            participants: thread.room.participants,
            questions: thread.room.questions.map((question) => ({
              ...question,
              text: clip(question.text, PROMPT_LINE.threadStatus),
            })),
            since: since(thread.updatedAt),
            ...(thread.ask
              ? { asking: thread.ask.question, options: thread.ask.options }
              : {}),
            ...(thread.status === "running"
              ? { now: threadActivity(thread.lines) }
              : {}),
            ...(thread.outcome && thread.status !== "waiting"
              ? { outcome: clip(thread.outcome, PROMPT_LINE.threadStatus) }
              : {}),
          })),
        };
      },
    }),

    [TOOL_NAMES.thread_cancel]: tool({
      description: threadCancelSpec.description,
      inputSchema: threadCancelSpec.parameters,
      execute: async ({ thread }) => {
        if (thread.trim().toLowerCase() === "all") {
          const { cancelRunningThreads } = await import(
            "@/features/bot/bot.runner"
          );
          const stopped = await cancelRunningThreads();
          return stopped.length
            ? { stopped: stopped.map((one) => one.label), status: "cancelled" }
            : "No thread is at work.";
        }
        const one = await pick(thread);
        if (typeof one === "string") return one;
        const { cancelThread } = await import("@/features/bot/bot.runner");
        await cancelThread(one.id);
        return { label: one.label, status: "cancelled" };
      },
    }),

    [TOOL_NAMES.thread_show]: tool({
      description: threadShowSpec.description,
      inputSchema: threadShowSpec.parameters,
      execute: async ({ thread }) => {
        const one = await pick(thread);
        if (typeof one === "string") return one;
        const { appEvents } = await import("@/app/api/events/app-event.server");
        // What it made is what they asked to see: the file itself, in the app's
        // viewer. A thread that left no file opens as itself
        const { filesOnDisk } = await import("@/features/workspace/workspace");
        const { leadFirst, pathsIn, viewKindOf } = await import(
          "@/features/workspace/file-kind"
        );
        // Only what the viewer draws: a file nothing here draws is passed over, and a
        // thread with nothing drawable opens as itself, where its files are listed
        const files = (
          await filesOnDisk(pathsIn(one.outcome ?? ""), null)
        ).filter((file) => viewKindOf(file) !== "none");
        if (!files.length) {
          // Opened in the room, where reading it is what marks it seen
          appEvents.emit({ type: "showThread", threadId: one.id });
          return { label: one.label, showing: "the thread" };
        }
        const paths = leadFirst(files);
        appEvents.emit({ type: "showFile", paths });
        // The result is in front of them: the same as having opened it themselves
        const { markSeen } = await import("@/features/bot/thread.query");
        await markSeen([one.id]);
        return { label: one.label, showing: paths[0] };
      },
    }),

    [TOOL_NAMES.thread_seen]: tool({
      description: threadSeenSpec.description,
      inputSchema: threadSeenSpec.parameters,
      execute: async ({ thread }) => {
        const one = await pick(thread);
        if (typeof one === "string") return one;
        const { markSeen } = await import("@/features/bot/thread.query");
        await markSeen([one.id]);
        return { label: one.label, seen: true };
      },
    }),
  };
}

/** An unresolved reference answers with the recent threads; a bare "no such thread" is read as an error and relayed as one. */
async function noSuchThread(ref: string): Promise<string> {
  const { listThreadOverview } = await import("@/features/bot/thread.query");
  const recent = await listThreadOverview();
  if (!recent.length) return "No thread has been started yet.";
  const names = recent
    .map((thread) => `"${thread.label}" (${thread.bot}, ${thread.status})`)
    .join(", ");
  return `There is no thread called "${ref}". The latest are: ${names}. Call again with one of those labels.`;
}

/**
 * What the set costs the model, beside the prompt's own line (prompts/prompt-helper
 * logPromptSize). Descriptions and schemas are both counted because both are sent
 * on every step. No budget here: the set is decided by the code, except for the MCP
 * tools a bot is pinned to — those show up by name.
 */
async function logToolSize(target: ToolTarget, tools: ToolSet): Promise<void> {
  const rows: { name: string; tokens: number }[] = [];
  for (const [name, held] of Object.entries(tools)) {
    const schema = await asSchema(held.inputSchema).jsonSchema;
    // A description may be a function of the call's context; only a fixed one is counted
    const said = typeof held.description === "string" ? held.description : "";
    rows.push({
      name,
      tokens: estimateTokens(said) + estimateTokens(JSON.stringify(schema)),
    });
  }
  rows.sort((a, b) => b.tokens - a.tokens);
  const total = rows.reduce((sum, row) => sum + row.tokens, 0);
  logger.debug(
    `${target} tools ${total} tokens over ${rows.length} — ${rows
      .map((row) => `${row.name} ${row.tokens}`)
      .join(", ")}`,
  );
}

export async function loadTools(run: ToolRun): Promise<ToolSet> {
  const tools = await buildTools(run);
  // Measured only where the line would be printed: the schemas have to be built
  // to be counted, and unlike a prompt this set does not grow with use.
  if (IS_DEV) await logToolSize(run.target, tools);
  return tools;
}

async function buildTools(run: ToolRun): Promise<ToolSet> {
  if (run.target === "memory-edit") {
    // Memory's own read and writes, in the user's hand: they asked for it on
    // screen. Opening a note to change it is not a recall (memory.tool countReads)
    return createMemoryTools("user", null, { countReads: false });
  }

  if (run.target === "call-memory") {
    // No forget, and no ask to settle an overgrown note: nobody is there to name what goes,
    // and a change replaces. Opening a note to write into it is not the user asking for it
    // (memory.tool countReads)
    const hand = createMemoryTools("call", run.callId, {
      countReads: false,
      tidies: false,
    });
    return {
      [TOOL_NAMES.memory_recall]: hand[TOOL_NAMES.memory_recall],
      [TOOL_NAMES.memory_remember]: hand[TOOL_NAMES.memory_remember],
      [TOOL_NAMES.memory_create]: hand[TOOL_NAMES.memory_create],
      [TOOL_NAMES.memory_describe]: hand[TOOL_NAMES.memory_describe],
    };
  }

  // The call's hand; a fact it writes is tied to the call it was said in. A bot
  // is handed only the read from it (below).
  const memory = createMemoryTools(
    "call",
    run.target === "thursday" ? (run.callId ?? null) : null,
  );

  const sandbox = await openWorkspace();

  if (run.target === "thursday") {
    const skills = run.readSkills
      ? createSkillTools({ sandbox, skills: await loadSkills(sandbox) })
      : {};
    // A picture handed over in writing is one she can see where her model carries an image
    // in a tool result; a spoken call answers the backend through the page, in text
    const sees = Boolean(run.written && run.model && seesToolImages(run.model));

    return {
      ...memory,
      ...skills,
      // The shell alone, for no longer than her answer can wait on it (config
      // CALL_EXEC_TIMEOUT_MS). A whole file is a job, not a glance (workspace.tool)
      ...createWorkspaceTools(sandbox, {
        write: false,
        timeoutMs: CALL_EXEC_TIMEOUT_MS,
      }),
      // Exa when its key is set; without one the backend's own hosted search is sent
      // in its place (thursday.action), so the call never holds both
      ...(run.webSearch === false ? {} : await createCallSearchTool(sandbox)),
      // Handing work over, following it, and hanging up belong to the voice session only
      ...Object.fromEntries(
        Object.entries(createThreadTools(run.callId)).filter(
          ([name]) => !(run.phone && name === TOOL_NAMES.thread_show),
        ),
      ),
      // What starts by itself is the user's to set up, so only the call holds it
      ...createRoutineTools(),
      // Absent for a model a picture would not reach, as for a bot
      ...(sees ? createLookTool() : {}),
      // The page's own tools, for a spoken call only: nothing hands a written turn back to it
      ...(run.written ? {} : callTools()),
    };
  }

  // A bot works inside a job it did not open: it can pull another bot in but cannot start a job.
  // The runner attaches messaging with the active continuation (bot.run).
  const skills = await loadSkills(sandbox, run.bot);
  // What its pages show of it: the face it wears now (workspace.ts botShellEnv)
  const shell = {
    ...jobShellEnv(run.session),
    ...botShellEnv(
      run.bot,
      (await (await import("@/features/bot/bot.query")).findJobBot(run.bot))
        ?.icon,
    ),
  };
  // Whether a picture inside a tool result reaches this model (ai/model seesToolImages)
  const sees = Boolean(run.model && seesToolImages(run.model.ref));
  return {
    // A bot only reads memory: every write is the call's, and there is no screen to show a note on
    [TOOL_NAMES.memory_recall]: createMemoryTools("call", null, {
      tidies: false,
    })[TOOL_NAMES.memory_recall],
    // Exa when its key is set, else this bot's own model when it can search;
    // absent when neither, and the browser is the way in (search.tool)
    ...(await createSearchTool(run.model, sandbox)),
    // The browser rides in the shell: its session is this participant's in this job,
    // set by the server rather than typed by the model (workspace.ts jobShellEnv),
    // and so is the bot's artifacts folder
    ...createWorkspaceTools(sandbox, {
      write: true,
      env: shell,
      // What the shell is like and what this machine has, on the first command
      // of the run only (workspace.tool SHELL_GUIDE). The call gets no guide:
      // one command is a glance, not a job to plan around
      guide: true,
      // Its own memory stays within its limits whichever of the two writes it
      // (bot.memory), and its finished work stays in its own folder
      bot: run.bot,
      thread: run.thread,
    }),
    // Pinned tools come with schemas; the rest sit behind `tool_search`, absent when nothing is left to find (mcp.tool)
    ...(await createMcpTools(run.bot, sandbox)),
    ...createSkillTools({ sandbox, skills, bot: run.bot }),
    // Its own line in the roster, unless the user keeps it as written (self.tool)
    ...(await createSelfTools(run.bot)),
    // A deck is typed slides the app draws; its pictures are taken in this job's browser
    // session, apart from any window of it on screen, and shown to a model that sees them
    ...createDeckTools(sandbox, run.bot, shell, sees),
    // Absent for a model a picture would not reach
    ...(sees ? createLookTool() : {}),
    // Sign-ins are the app's to keep and the user's to lend (tools/signin.tool); the state
    // goes into this participant's own browser, the one its shell drives
    ...createSignInTools(sandbox, run.bot, jobShellEnv(run.session)),
    // Absent unless the list in its prompt cut a line short (tools/bot.tool)
    ...(await createThreadRecallTool(run.bot, run.thread ?? null)),
    // Absent until the user gives her a mailbox (Settings › Phone › Email): last, so the
    // set before it stays as it was cached
    ...(await createMailTools()),
  };
}
