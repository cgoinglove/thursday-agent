import { setTimeout as wait } from "node:timers/promises";
import type { ModelMessage } from "ai";
import { appEvents, presence } from "@/app/api/events/app-event.server";
import {
  BOT_REFLECT,
  BOT_RUN,
  BROWSER_IDLE,
  FINISHED_NOTICE,
  WORKSPACE_KEEP,
} from "@/config";
import { isProviderRefusal, modelErrorToString } from "@/features/ai/model";
import type { TextModelProviderId } from "@/features/ai/model.schema";
import {
  buildJoinOpening,
  buildThreadOpening,
  REFLECT_NOTE,
} from "@/features/ai/prompts/bot.prompt";
import { isAnyCallLive } from "@/features/thursday/thursday.query";
import { leadFirst, pathsIn } from "@/features/workspace/file-kind";
import {
  botBrowserSession,
  closeHiddenBrowser,
  closeIdleBrowser,
  closeJobShell,
  filesOnDisk,
  jobScratch,
  type ListedBrowser,
  listJobBrowsers,
  listScratchFolders,
  pruneJobFiles,
  removeJobBrowsers,
  removeJobScratch,
  removeUnchangedFolders,
  threadOfBrowser,
} from "@/features/workspace/workspace";
import { desktopNotify } from "@/lib/desktop-notify";
import { logger } from "@/lib/logger";
import { isPublicError, publicError } from "@/lib/public-error";
import { createKeyedLock } from "@/lib/queue";
import { PromiseChain, plainText } from "@/lib/utils";
import { findJobBot, readBotMemoryOn } from "./bot.query";
import { resumeTranscript, runBot, type ThreadEvent } from "./bot.run";
import {
  isAppStop,
  THREAD_CONTINUE,
  type ThreadRoutine,
  type ThreadSpeaker,
  type ThreadStatus,
} from "./bot.schema";
import {
  appendRoomMessage,
  cancelRoom,
  claimRoomWork,
  consumeRoomInbox,
  finishRoomWork,
  joinRoom,
  listParticipantTranscript,
  listRoomReceipts,
  listRoomWork,
  lowerRoomContextBudget,
  noteRoomBreak,
  pauseRoom,
  type RoomWork,
  resumeRoom,
  roomBoard,
  roomContextBudget,
  sendRoomMessage,
  settleRoom,
  tellRoom,
} from "./room.query";
import { isCoordinatorSeat, ROOM_THURSDAY, ROOM_USER } from "./room.schema";
import {
  addThreadUsage,
  deleteMessages,
  deleteThread,
  findThread,
  insertThread,
  listRunningThreadIds,
  listThreadFolders,
  updateThread,
  upsertMessage,
} from "./thread.query";

type Run = { threadId: string; stop: AbortController; done: Promise<void> };
type Pinned = {
  __roomRuns?: Map<string, Run>;
  __roomCompactAsked?: Set<string>;
  __roomThreadLock?: ReturnType<typeof createKeyedLock>;
  __roomReflecting?: Map<string, AbortController>;
};
const running = ((globalThis as Pinned).__roomRuns ??= new Map<string, Run>());
/** A done job's look back, by thread (reflect): stopped by anything that moves the job again. */
const reflecting = ((globalThis as Pinned).__roomReflecting ??= new Map<
  string,
  AbortController
>());
const threadLock = ((globalThis as Pinned).__roomThreadLock ??=
  createKeyedLock());

/**
 * Desks the user asked to summarize themselves: each compacts at its next step, once,
 * whatever its size (bot.run compactNow). Asked of a run, not stored — a lowered budget
 * would compact every step after it, and a request is over once it is met. One that is
 * idle meets it as its next turn starts; a restart forgets it, and the automatic one still
 * comes at the budget.
 */
const compactAsked = ((globalThis as Pinned).__roomCompactAsked ??=
  new Set<string>());
const deskOf = (threadId: string, bot: string) => `${threadId}\n${bot}`;

export function askCompact(threadId: string, bot: string) {
  compactAsked.add(deskOf(threadId, bot));
}

export async function startThread(input: {
  bot: string;
  request: string;
  label: string;
  callId?: string | null;
  from: ThreadSpeaker;
  /** Set when a routine opens it rather than a person (features/routine routine.clock). */
  routine?: ThreadRoutine | null;
}) {
  const found = await findJobBot(input.bot);
  if (!found || found.disabled) publicError("Choose an enabled bot.");
  const { from, routine, ...row } = { ...input, bot: found.name };
  const opening = buildThreadOpening({
    bot: row.bot,
    request: row.request,
    from,
    routine,
  });
  const thread = await insertThread({
    ...row,
    routineId: routine?.id ?? null,
    // A routine's run was handed over by nobody there
    startedBy: routine ? null : from,
    opening,
  });
  await pump(thread.id);
  return thread.id;
}

/** A recipient selects a desk; replying to a question also names the exact exchange. */
export async function answerThread(
  id: string,
  answer: string,
  from: ThreadSpeaker = "user",
  recipient?: string,
  replyTo?: string,
): Promise<Awaited<ReturnType<typeof tellRoom>> | null> {
  let told: Awaited<ReturnType<typeof tellRoom>> | null = null;
  await threadLock(id, async () => {
    const thread = await findThread(id);
    if (!thread) publicError("No such thread.");
    if (recipient) {
      const participants = await listRoomWork(id);
      const found = participants.find(
        (row) => row.bot.toLowerCase() === recipient!.trim().toLowerCase(),
      );
      if (!found || found.bot === ROOM_THURSDAY)
        publicError("Choose a participant in this thread.");
      recipient = found.bot;
    }
    // Continue picks up a stop the app made; to a bot's question it is an answer like any other
    if (answer.trim() === THREAD_CONTINUE && isAppStop(thread.pending)) {
      await resumeRoom(id);
      const all = await listRoomWork(id);
      if (!all.some((row) => row.state === "queued"))
        told = await tellRoom(
          id,
          "Continue from the saved conversation.",
          from === "user" ? ROOM_USER : ROOM_THURSDAY,
          recipient,
          undefined,
          false,
        );
    } else {
      told = await tellRoom(
        id,
        answer,
        from === "user" ? ROOM_USER : ROOM_THURSDAY,
        recipient,
        replyTo,
      );
    }
  });
  await pump(id);
  return told;
}

/** Claiming is short and serialized; model execution never holds the room lock. */
async function pump(id: string) {
  await threadLock(id, async () => {
    // settleRoom can queue one turn, the coordinator's wrap-up (`wrapped` holds back another
    // until a message is sent in the room); the second pass launches it rather than leaving it queued
    for (let pass = 0; pass < 2; pass++) {
      let work: RoomWork | null;
      while ((work = await claimRoomWork(id))) launch(work);
      await settleRoom(id);
    }
  });
}

function launch(work: RoomWork) {
  // A word that picks a done job back up comes before its look back
  reflecting.get(work.threadId)?.abort();
  const stop = new AbortController();
  let finish!: () => void;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  running.set(work.id, { threadId: work.threadId, stop, done });
  void drive(work, stop.signal)
    .catch((cause) =>
      logger.error(`thread ${work.threadId}: participant`, cause),
    )
    .finally(() => {
      running.delete(work.id);
      finish();
      void pump(work.threadId).catch((cause) =>
        logger.error(`thread ${work.threadId}: scheduling`, cause),
      );
    });
}

async function drive(work: RoomWork, signal: AbortSignal) {
  let turn = await attempt(work, signal);
  // A break gets one more try from the stored transcript; a refusal, the content
  // filter and the step limit wait for a person, and so does a second break
  if (turn?.failure?.retry && !signal.aborted) {
    await noteRoomBreak(work, turn.failure.message);
    // Only an abort rejects the wait, and the check below reads it
    await wait(BOT_RUN.retryMs, undefined, { signal }).catch(() => {});
    if (!signal.aborted) turn = await attempt(work, signal, false);
  }
  if (!turn || signal.aborted) return;
  const failure = turn.failure?.message;
  const final = turn.ending;
  if (failure || !final || final.stopped) {
    // Release this run before the room lock drains it; cancellation holds the same lock.
    const why =
      failure ??
      "The turn was interrupted. Continue from the saved conversation.";
    void threadLock(work.threadId, async () => {
      const current = (await listRoomWork(work.threadId)).find(
        (row) => row.id === work.id,
      );
      if (
        current?.state !== "running" ||
        current.generation !== work.generation
      )
        return;
      const drained = stopRuns(work.threadId);
      await pauseRoom(work.threadId, why, turn.failure?.refused);
      await drained;
    }).catch((cause) =>
      logger.error(`thread ${work.threadId}: pausing`, cause),
    );
    return;
  }
  await finishRoomWork(work, final.text);
  const thread = await findThread(work.threadId);
  if (thread?.status === "done") {
    // An answer is written for the screen; what says it elsewhere says it as words
    const words = plainText(thread.outcome ?? "").slice(
      0,
      FINISHED_NOTICE.words,
    );
    // With a page open the page tells it (artifact-view): a notification it shows brings
    // Thursday forward when pressed, where the OS one opens the script runner behind it
    if (!presence.watching && !(await isAnyCallLive()))
      desktopNotify(thread.label, words);
    const files = await filesOnDisk(pathsIn(thread.outcome ?? ""), null);
    appEvents.emit({
      type: "finished",
      threadId: thread.id,
      label: thread.label,
      bot: thread.bot,
      words,
      // A page to read leads the notice; the rest follow in the order they were written.
      paths: leadFirst(files),
    });
    // Its hidden browsers are done with (workspace closeIdleBrowser). Under the lock and
    // only while it is still done: a word that picked the job back up keeps them
    void threadLock(thread.id, async () => {
      if ((await findThread(thread.id))?.status === "done")
        await closeIdleBrowser(thread.id);
    }).catch((cause) =>
      logger.warn(`thread ${thread.id}: closing its browsers`, cause),
    );
    void reflect(thread.id, thread.bot).catch((cause) =>
      logger.warn(`thread ${thread.id}: looking back`, cause),
    );
  }
}

/**
 * Once a job is done, each bot that worked in it looks back and keeps what it learned about
 * working, in its own memory or a skill of its own (config BOT_REFLECT). One more turn of
 * the conversation it already has, with the same instructions and tools, so the provider
 * reads it back from its cache; nothing of it is written to the thread, which already has
 * its answer, and only its tokens are added to the job's. A bot that made few tool calls
 * learned little a later job would find out again. Off with the bots' memory.
 */
async function reflect(threadId: string, owner: string) {
  if (!(await readBotMemoryOn())) return;
  reflecting.get(threadId)?.abort();
  const stop = new AbortController();
  reflecting.set(threadId, stop);
  try {
    // The latest desk of each bot: its caller decides the seat, and with it the tools
    const desks = new Map<string, RoomWork>();
    for (const row of await listRoomWork(threadId))
      if (row.bot !== ROOM_THURSDAY) desks.set(row.bot, row);
    for (const desk of desks.values()) {
      if (stop.signal.aborted) return;
      if ((await findThread(threadId))?.status !== "done") return;
      const history = await listParticipantTranscript(threadId, desk.bot);
      if (toolCallsIn(history) < BOT_REFLECT.minTools) continue;
      await runBot(
        {
          bot: desk.bot,
          messages: [
            ...resumeTranscript(
              history,
              await listRoomReceipts(threadId, desk.bot, history),
            ),
            { role: "user", content: REFLECT_NOTE },
          ],
        },
        {
          signal: stop.signal,
          threadId,
          parent: desk.id,
          caller: desk.bot === owner ? ROOM_THURSDAY : desk.caller,
          owner,
          contextBudget: await roomContextBudget(threadId, desk.bot),
          session: botBrowserSession(threadId, desk.bot),
          steps: BOT_REFLECT.steps,
          send: async () =>
            publicError("The job is done: nothing is sent from here."),
          emit: async (event) => {
            if (event.type === "step")
              await addThreadUsage(threadId, event.usage);
            // What it made of the job is said nowhere else: the thread has its answer
            if (event.type === "turn-end")
              logger.info(
                `${desk.bot} looked back on ${threadId}: ${plainText(event.text).slice(0, 300)}`,
              );
            if (event.type === "error")
              logger.warn(`${desk.bot} looking back: ${event.message}`);
          },
        },
      );
    }
  } finally {
    if (reflecting.get(threadId) === stop) reflecting.delete(threadId);
  }
}

/** Tool calls a participant made in its transcript. */
const toolCallsIn = (history: ModelMessage[]) =>
  history.reduce(
    (sum, row) =>
      sum +
      (row.role === "assistant" && Array.isArray(row.content)
        ? row.content.filter((part) => part.type === "tool-call").length
        : 0),
    0,
  );

/**
 * One run of a participant's turn from its stored transcript: how it ended, or why it broke. Null
 * when the thread is gone. A retry after a break is not a new turn, and the board it read stands.
 */
async function attempt(work: RoomWork, signal: AbortSignal, fresh = true) {
  const writer = new TranscriptWriter(work, signal);
  let ending: { text: string; stopped: boolean } | null = null;
  let failure: {
    message: string;
    retry: boolean;
    refused?: TextModelProviderId;
  } | null = null;
  try {
    const thread = await findThread(work.threadId);
    if (!thread) return null;
    const prior = await listParticipantTranscript(work.threadId, work.bot);
    // A bot brought in reads the job it was handed, not the thread's first request
    if (!prior.length)
      await joinRoom(work, (job) =>
        buildJoinOpening({
          bot: work.bot,
          coordinator: thread.bot,
          job,
          request: thread.request,
        }),
      );
    await consumeRoomInbox(work);
    // The coordinator starts each turn knowing what it handed out is still out
    if (fresh && isCoordinatorSeat(work.bot, thread.bot, work.caller)) {
      const board = await roomBoard(work);
      if (board)
        await appendRoomMessage(work.threadId, {
          bot: work.bot,
          parent: work.id,
          role: "user",
          content: board,
          hidden: true,
        });
    }
    const history = await listParticipantTranscript(work.threadId, work.bot);
    await runBot(
      {
        bot: work.bot,
        messages: resumeTranscript(
          history,
          await listRoomReceipts(work.threadId, work.bot, history),
        ),
      },
      {
        signal,
        threadId: work.threadId,
        parent: work.id,
        caller: work.caller,
        owner: thread.bot,
        contextBudget: await roomContextBudget(work.threadId, work.bot),
        compactNow: () => compactAsked.delete(deskOf(work.threadId, work.bot)),
        session: botBrowserSession(work.threadId, work.bot),
        notes: () => consumeRoomInbox(work),
        send: async (input) => {
          signal.throwIfAborted();
          let to = input.to.trim();
          if (to.toLowerCase() === ROOM_THURSDAY.toLowerCase())
            to = ROOM_THURSDAY;
          else {
            const bot = await findJobBot(to);
            if (!bot || bot.disabled)
              publicError(`No enabled bot named "${to}".`);
            to = bot.name;
          }
          const receipt = await sendRoomMessage(work, { ...input, to });
          void pump(work.threadId).catch((cause) =>
            logger.error("room message scheduling", cause),
          );
          return receipt;
        },
        emit: async (event) => {
          if (signal.aborted && event.type !== "tool-result") return;
          await writer.on(event);
          if (event.type === "step")
            await addThreadUsage(
              work.threadId,
              event.usage,
              work.bot === thread.bot
                ? { tokens: event.usage.input, budget: event.budget }
                : null,
            );
          if (event.type === "compact")
            await addThreadUsage(work.threadId, event.usage);
          if (event.type === "turn-end") ending = event;
          if (event.type === "error") {
            failure = {
              message: event.message,
              retry: event.retry,
              refused: event.refused,
            };
            if (event.budget) await lowerRoomContextBudget(work, event.budget);
          }
        },
      },
    );
  } catch (cause) {
    if (!signal.aborted) {
      logger.error(`thread ${work.threadId}: ${work.bot} broke`, cause);
      failure = {
        message: modelErrorToString(cause),
        // A public error is the app refusing the turn (no key, no model), not a break
        retry: !isPublicError(cause) && !isProviderRefusal(cause),
      };
    }
  }
  return {
    ending: ending as { text: string; stopped: boolean } | null,
    failure: failure as {
      message: string;
      retry: boolean;
      refused?: TextModelProviderId;
    } | null,
  };
}

/** Streaming updates share stable row slots; tools may be observed before the stream reports them. */
class TranscriptWriter {
  private lane = PromiseChain();
  private assistant: number | null = null;
  private tool: number | null = null;
  private parts: {
    assistant: Exclude<
      Extract<ModelMessage, { role: "assistant" }>["content"],
      string
    >;
    tool: Extract<ModelMessage, { role: "tool" }>["content"];
  } = { assistant: [], tool: [] };
  private calls = new Set<string>();
  private results = new Set<string>();
  constructor(
    private work: RoomWork,
    private signal: AbortSignal,
  ) {}
  private async write(
    seq: number | null,
    value: ModelMessage,
    compact = false,
  ) {
    const row = {
      bot: this.work.bot,
      parent: this.work.id,
      role: value.role,
      content: value.content,
      compact,
      note: compact,
    };
    if (seq === null) return appendRoomMessage(this.work.threadId, row);
    await upsertMessage(this.work.threadId, seq, row);
    return seq;
  }
  on(event: ThreadEvent) {
    return this.lane(async () => {
      if (this.signal.aborted && event.type !== "tool-result") return;
      if (event.type === "text") {
        this.parts.assistant.push({ type: "text", text: event.text });
        this.assistant = await this.write(this.assistant, {
          role: "assistant",
          content: this.parts.assistant,
        });
      } else if (event.type === "tool") {
        if (this.calls.has(event.id)) {
          const part = this.parts.assistant.find(
            (part) => part.type === "tool-call" && part.toolCallId === event.id,
          );
          if (part && part.type === "tool-call" && event.providerOptions) {
            part.providerOptions = event.providerOptions;
            this.assistant = await this.write(this.assistant, {
              role: "assistant",
              content: this.parts.assistant,
            });
          }
          return;
        }
        this.calls.add(event.id);
        this.parts.assistant.push({
          type: "tool-call",
          toolCallId: event.id,
          toolName: event.name,
          input: event.input,
          ...(event.providerExecuted ? { providerExecuted: true } : {}),
          ...(event.providerOptions
            ? { providerOptions: event.providerOptions }
            : {}),
        });
        this.assistant = await this.write(this.assistant, {
          role: "assistant",
          content: this.parts.assistant,
        });
      } else if (event.type === "tool-result") {
        if (this.results.has(event.id)) return;
        this.results.add(event.id);
        this.parts.tool.push({
          type: "tool-result",
          toolCallId: event.id,
          toolName: event.name,
          output: event.error
            ? { type: "error-text", value: String(event.output) }
            : typeof event.output === "string"
              ? { type: "text", value: event.output }
              : { type: "json", value: event.output as never },
        });
        this.tool = await this.write(this.tool, {
          role: "tool",
          content: this.parts.tool,
        });
      } else if (event.type === "step") {
        const slots = [this.assistant, this.tool];
        for (const [index, value] of event.messages.entries())
          await this.write(slots[index] ?? null, value);
        const stale = slots
          .slice(event.messages.length)
          .filter((seq): seq is number => seq !== null);
        if (stale.length) await deleteMessages(this.work.threadId, stale);
        this.assistant = this.tool = null;
        this.parts = { assistant: [], tool: [] };
      } else if (event.type === "compact") {
        await this.write(null, { role: "user", content: event.text }, true);
      }
    });
  }
}

async function stopRuns(id: string) {
  reflecting.get(id)?.abort();
  const live = [...running.values()].filter((run) => run.threadId === id);
  for (const run of live) run.stop.abort();
  await Promise.all(live.map((run) => run.done));
}

export async function cancelThread(id: string) {
  await threadLock(id, async () => {
    const thread = await findThread(id);
    if (!thread) publicError("No such thread.");
    if (thread.endedAt) publicError("That thread has already ended.");
    await cancelLocked(id);
  });
}

/**
 * Stops every thread at work now, each as its own Stop would: the room's Stop all, and
 * `thread_cancel` "all". A thread waiting on the user has nothing running and is left as it
 * is. Returns the threads it stopped.
 */
export async function cancelRunningThreads(): Promise<
  { id: string; label: string }[]
> {
  const stopped: { id: string; label: string }[] = [];
  await Promise.all(
    (await listRunningThreadIds()).map((id) =>
      threadLock(id, async () => {
        const thread = await findThread(id);
        if (thread?.status !== "running") return;
        await cancelLocked(id);
        stopped.push({ id, label: thread.label });
      }),
    ),
  );
  return stopped;
}

async function cancelLocked(id: string) {
  await cancelRoom(id);
  await updateThread(id, {
    status: "cancelled",
    outcome: null,
    pending: null,
    seen: true,
    endedAt: new Date(),
  });
  await stopRuns(id);
  await closeJobShell(id);
}
export async function removeThread(id: string) {
  return threadLock(id, () => removeLockedThread(id));
}
async function removeLockedThread(id: string, listed?: ListedBrowser[]) {
  const thread = await findThread(id);
  await cancelRoom(id);
  await stopRuns(id);
  await removeJobBrowsers(id, listed);
  const removed = await deleteThread(id);
  if (removed && thread) await removeJobScratch(id, thread.label);
  return removed;
}

/**
 * Removes jobs that are over, with everything they held. With `endedBefore` only
 * the ones that ended before then go, which is how the app clears by age
 * (instrumentation, config HISTORY_KEEP); without it, all of them, which is the
 * user pressing Clear finished. A job is taken under its lock and read again
 * inside it, so one picked back up in that moment is left alone.
 */
export async function removeFinishedThreads(
  endedBefore?: Date,
): Promise<number> {
  const cutoff = endedBefore?.getTime();
  // The same age a job's files are judged by (sweepJobFiles): a thread is only
  // stamped `endedAt` on done and cancelled, so `updatedAt` stands in for the rest.
  const over = (thread: { endedAt: Date | null; updatedAt: Date }) =>
    cutoff === undefined ||
    (thread.endedAt ?? thread.updatedAt).getTime() < cutoff;
  let removed = 0;
  // The workspace's browsers, read once for all of them rather than once a thread
  // (listJobBrowsers); undefined until a first thread needs it, and when it cannot be read
  let listed: ListedBrowser[] | undefined;
  let asked = false;
  for (const thread of await listThreadFolders()) {
    if (thread.status !== "done" && thread.status !== "cancelled") continue;
    if (!over(thread)) continue;
    await threadLock(thread.id, async () => {
      const current = await findThread(thread.id);
      if (current?.status !== "done" && current?.status !== "cancelled") return;
      if (!over(current)) return;
      if (!asked) {
        asked = true;
        listed = (await listJobBrowsers()) ?? undefined;
      }
      if (await removeLockedThread(thread.id, listed)) removed += 1;
    });
  }
  // What each thread's own close would have pruned, once
  if (listed) await pruneJobFiles();
  return removed;
}

/**
 * Hidden browsers of jobs no bot is on a step of, once the job has sat BROWSER_IDLE without
 * one: a question nobody answered, a stop waiting on Continue, a finish whose own close was
 * missed. At boot and on BROWSER_IDLE's own timer (instrumentation). The workspace's browsers
 * are listed once, and only the threads that have one are read again under their lock.
 */
export async function closeIdleBrowsers() {
  const threads = await listThreadFolders();
  const listed = await listJobBrowsers();
  if (!listed?.length) return;
  const before = Date.now() - BROWSER_IDLE.closeAfterMs;
  const idle = (thread: { status: ThreadStatus; updatedAt: Date }) =>
    thread.status !== "running" && thread.updatedAt.getTime() < before;
  const owners = new Set(listed.map((b) => threadOfBrowser(b.name)));
  for (const thread of threads) {
    if (!owners.has(thread.id) || !idle(thread)) continue;
    await threadLock(thread.id, async () => {
      const now = await findThread(thread.id);
      if (now && idle(now)) await closeIdleBrowser(thread.id, listed);
    });
  }
}

/**
 * Clears what jobs left behind by age (config WORKSPACE_KEEP), at boot and on a
 * timer (instrumentation): a job's folder once the job ended that long ago — a job
 * running or waiting keeps its own however old — a scratch folder no job owns once
 * it has not changed that long, and spilled output and browser snapshots that old
 * (pruneJobFiles). A job's folder goes under the job's lock, so a word that picks
 * the job back up in that moment never finds its material gone. Returns the
 * folders that went.
 */
export async function sweepJobFiles(): Promise<string[]> {
  const cutoff = Date.now() - WORKSPACE_KEEP.forMs;
  const stale = (thread: {
    status: ThreadStatus;
    endedAt: Date | null;
    updatedAt: Date;
  }) =>
    (thread.status === "done" || thread.status === "cancelled") &&
    (thread.endedAt ?? thread.updatedAt).getTime() < cutoff;

  // Folders on disk; each one a job owns is taken out as its job is read
  const unowned = new Set(await listScratchFolders());
  const removed: string[] = [];
  for (const thread of await listThreadFolders()) {
    const folder = jobScratch(thread.id, thread.label);
    if (!unowned.delete(folder) || !stale(thread)) continue;
    await threadLock(thread.id, async () => {
      const now = await findThread(thread.id);
      if (!now || !stale(now)) return;
      await closeHiddenBrowser(thread.id);
      await removeJobScratch(thread.id, thread.label);
      removed.push(folder);
    });
  }
  removed.push(...(await removeUnchangedFolders([...unowned])));
  await pruneJobFiles();
  if (removed.length) {
    logger.info(
      `cleared ${removed.length} old job folder(s): ${removed.join(", ")}`,
    );
  }
  return removed;
}

/** A server restart is a manual resume boundary: external effects may already have happened. */
export async function sweepThreads() {
  for (const id of await listRunningThreadIds()) {
    await threadLock(id, async () => {
      if ([...running.values()].some((run) => run.threadId === id)) return;
      if ((await findThread(id))?.status !== "running") return;
      await pauseRoom(
        id,
        "The server restarted. Resume from the saved conversation.",
      );
    });
  }
}
export async function pauseThreads(reason: string) {
  const ids = await listRunningThreadIds();
  await Promise.all(
    ids.map((id) =>
      threadLock(id, async () => {
        if ((await findThread(id))?.status !== "running") return;
        await stopRuns(id);
        await pauseRoom(id, reason);
      }),
    ),
  );
}
