import { CALL_EXEC_TIMEOUT_MS, RECENT_CALL } from "@/config";
import { guideLine } from "@/features/ai/guide";
import { TOOL_NAMES } from "@/features/ai/tools/tool-name";
import { listJobBots, readBotMemoryOn } from "@/features/bot/bot.query";
import { type JobBot, rosterLine } from "@/features/bot/bot.schema";
import { type CallJob, listCallJobs } from "@/features/bot/thread.query";
import { listNoteIndex, readNotes } from "@/features/memory/memory.query";
import {
  MEMORY_ALWAYS_LISTED,
  MEMORY_PATHS,
  type MemoryIndexEntry,
  type MemoryNoteView,
} from "@/features/memory/memory.schema";
import {
  loadSkills,
  type SkillMetadata,
} from "@/features/skills/skills.discover";
import {
  type CallGroup,
  listRecentTurns,
} from "@/features/thursday/thursday.query";
import type { Where } from "@/features/thursday/thursday.schema";
import { openWorkspace } from "@/features/workspace/workspace";
import { listConnectedToolNames } from "../tools/connected";
import { personaLines } from "./persona";
import {
  logPromptSize,
  noteLines,
  reachNames,
  recentCallLines,
  skillLines,
  styleLines,
  thursdayIdentity,
  tidying,
} from "./prompt-helper";

/**
 * Everything the call's Responses backend hears: who Thursday is — and, on a call in writing,
 * who she is to talk to (persona), since then it is the one talking — then the work the voice
 * hands over — memory with ids, background work with the roster, this computer — what to
 * return, and the last calls with their jobs, which only the backend reads. On a spoken call
 * nothing here is about how to talk. The loader is the table of contents,
 * and empty chapters are dropped. Shares no sentence with bot.prompt. Assembled on every call,
 * never cached.
 */
export async function loadThursdayPrompt(options: {
  /** Settings › Thursday › Backend instructions, added last. */
  backendPrompt?: string | null;
  /**
   * The call is in writing (thursday/thursday.text): nobody voices what comes back, so the
   * last chapter is an answer to read rather than a result to say, and there is no line to
   * drop (load-tools).
   */
  written?: boolean;
  /** Written from a phone: the call holds no `thread_show` (load-tools). */
  phone?: boolean;
  /**
   * The call this prompt is for, when its row already holds words (a call in writing, a
   * phone). Its own turns are the conversation: read again under `## Earlier calls`, every
   * turn after the first had the talk it was in handed back as the past, pushing the real
   * earlier calls out of the 600 tokens they have.
   */
  callId?: string | null;
  /** The picked character, read only on a call in writing, where this is who talks. */
  persona?: string;
  /** Settings › Thursday › Style in their own words, read on the same terms as `persona`. */
  stylePrompt?: string | null;
  /** Whether the call was handed `load_skill` (Settings › Thursday, load-tools). */
  readSkills?: boolean;
  /** Where they are and the weather there, when the page said (thursday/where). */
  where?: Where | null;
}): Promise<string> {
  const { backendPrompt, written = false, phone = false, readSkills } = options;
  const sandbox = await openWorkspace();
  const [skills, index, open, connected, roster, calls, botMemory] =
    await Promise.all([
      loadSkills(sandbox),
      listNoteIndex(),
      // Written out in the prompt, which is not the user asking for them: no read counted
      readNotes(MEMORY_ALWAYS_LISTED, { touch: false }),
      listConnectedToolNames(),
      listJobBots(),
      listRecentTurns(RECENT_CALL.rows, options.callId),
      readBotMemoryOn(),
    ]);
  // The jobs those calls opened, folded into the transcript below
  const jobs = await listCallJobs(calls.map((call) => call.callId));

  // Order matters: earlier calls go last so the current call follows them in time order
  const text = [
    thursdayIdentity(new Date(), options.where),
    // On a spoken call the voice is the one talking, and how she talks is its prompt's
    // (live.prompt). In writing there is no voice, so the character and their own words
    // come here instead — the same two, read by whichever of the two is speaking
    written ? personaLines(options.persona) : "",
    written ? styleLines(options.stylePrompt) : "",
    memoryChapter(index, open.notes),
    // A skill is named once, on the side that can read it: this computer's chapter
    // when the setting hands the call the tool, the bots' reach when it does not
    backgroundWork(
      roster,
      reachNames(readSkills ? [] : skills, connected),
      botMemory,
      phone,
    ),
    thisComputer(sandbox.cwd, readSkills ? skills : []),
    written ? writtenAnswer() : result(),
    earlierCalls(calls, jobs),
    // Last, so it is the closest thing to the request
    additional(backendPrompt),
  ]
    .filter(Boolean)
    .join("\n\n");

  logPromptSize("thursday", text);
  return text;
}

/**
 * What goes back is said aloud, so it is what a tool or a note confirmed and nothing more — or
 * the one question the voice puts to the user before work is handed over (backgroundWork).
 */
function result(): string {
  return `## Return the result

Return the relevant facts, whether the task is complete, and what comes next — for work you handed over, who has it and whether it carries an earlier thread on or starts a new one — or the one question the user has to answer first. Use confirmed values from tool results and the notes above, and never invent a successful action. What you return is said aloud: keep it short and plain, and carry what they do not know yet — never a confirmation this conversation has already given them. When all the turn did was keep what they told you about themselves, return only that it was kept: the voice is already answering them.`;
}

/**
 * The same chapter for a call in writing: no voice stands between her and the user, so what
 * she writes is the answer itself. It asks for the same facts and the same honesty as `result`.
 */
function writtenAnswer(): string {
  return `## Answer in writing

This call is in writing: there is no voice, and what you write is what the user reads, so answer them directly, in their language. Say the relevant facts, whether the task is complete, and what comes next — for work you handed over, who has it and whether it carries an earlier thread on or starts a new one — or the one question they have to answer first. Use confirmed values from tool results and the notes above, and never invent a successful action. Keep it short and plain. News from a bot comes in the middle of whatever you were talking about: say whose work it is and which job before what it says.`;
}

/** Settings › Thursday › Backend instructions; no heading when empty. */
const additional = (backendPrompt?: string | null) =>
  backendPrompt?.trim()
    ? `## Additional instructions

Written by the user. Follow them together with everything above.

${backendPrompt.trim()}`
    : "";

/**
 * Profile and preferences written out whole, the listing, and what goes in. What is worth
 * keeping is named by kind, what tells most about them first; which facts is the model's call;
 * how a fact is written — dated, replacing — is the tool's schema
 * to say, and so is which tool starts a note. Merging is said here too: left to the `replaces`
 * description alone, facts on one subject piled up beside each other. Merging loses
 * nothing; deleting does, so `memory_forget` stays for what the user names.
 *
 * `after` is the pass that reads a spoken call once it is over (memory/call-memory): the
 * same memory and the same rules for writing it, without what only the call holds — the
 * user to settle an overgrown memory with, `memory_forget`, a thread to tell — or when to
 * keep, which the pass says itself (prompts/call-memory.prompt). Nor how a fact from a call is
 * marked: told it, the pass wrote the mark into the facts themselves (10-02).
 */
export function memoryChapter(
  index: MemoryIndexEntry[],
  /** The always-listed notes, whole (MEMORY_ALWAYS_LISTED). */
  open: MemoryNoteView[],
  after = false,
): string {
  // Ages ride on the listing only when there is too much to hold: they are what to drop by
  const { crowded, heavy } = tidying(index);
  const heaviest = [...heavy]
    .sort((a, b) => b.factCount - a.factCount)
    .slice(0, 3)
    .map((note) => note.path);
  // Past MEMORY_LIMITS, settling it with the user; the voice opens nothing about it
  const tidy =
    !after && (crowded || heavy.length)
      ? `\n\nSaved memory has grown past what it holds well${heaviest.length ? ` (${heaviest.join(", ")})` : ""}: say so once in what you return, go through what looks out of date with the user, and forget only what they name.`
      : "";
  // A note written out here is left off the listing
  const written = new Set(open.map((note) => note.path));

  const head = `## Memory

What you have kept from talking with this user — the only thing that survives a call, and what lets you know them.`;

  const openNotes = `Who they are, and how they want things done and said — follow what is under preferences. The #id is what \`replaces\`${after ? " takes" : ` and \`${TOOL_NAMES.memory_forget}\` take`}:

${open.map(openNoteLines).join("\n\n")}`;

  const keep = after
    ? ""
    : `Keep what the user tells you as it comes up, with \`${TOOL_NAMES.memory_remember}\`, without waiting to be asked: what they actually said, never a guess, nothing they asked you not to keep, and from a bot's report only what it confirmed about them. What they say that bears on work already handed over is said to that thread as well (\`${TOOL_NAMES.thread_tell}\`). `;

  const listing = `Every other note — path — what it is about (facts):

${noteLines(
  index.filter((note) => !written.has(note.path)),
  crowded,
)}${tidy}

Open a note before ${after ? "writing into it; a topic not listed is one you know nothing about." : "answering out of it; a topic not listed is one you know nothing about. A fact marked \`said\` came from a call."}

${keep}What tells you most about them comes first: what they loved or could not stand and why — how they want you to talk goes under preferences — then what they are going through or working toward, good news, stories from their past and the people in their life, and last plain facts and tastes. A subject that is not on the listing gets a note of its own with \`${TOOL_NAMES.memory_create}\`, under one of the paths below.

**Keep memory clean as you write.** A fact that repeats, narrows or changes one already in the note replaces it, merged into one line, rather than sitting beside it. A later call finds a note only by its path and its line: give something new its own path below, and when a line no longer says what its note is about, \`${TOOL_NAMES.memory_describe}\` puts it right.

${MEMORY_PATHS.map((entry) => `- ${entry.path} — ${entry.of}`).join("\n")}`;

  return [head, openNotes, listing].join("\n\n");
}

/** One always-listed note, whole, with the ids its facts are replaced and forgotten by. */
function openNoteLines(note: MemoryNoteView): string {
  const lines = note.facts.map((fact) => `- ${fact.text} #${fact.id}`);
  return `${note.path} — ${note.description}
${lines.length ? lines.join("\n") : "- (nothing yet)"}`;
}

/** Last calls verbatim, marked as past so the model does not answer as if just asked. Absent on the first call. */
function earlierCalls(calls: CallGroup[], jobs: CallJob[]): string {
  if (!calls.some((call) => call.turns.length > 0)) return "";

  return `## Earlier calls

What was said on the last calls, verbatim, newest last. It is the past: pick it up when the user does, and never answer it as a new request.

A \`${TOOL_NAMES.thread_start}\` line carries the thread's handle and how it ended; the handle is for the thread tools, never said aloud. What they ask for now is often one of these carried further.

${recentCallLines(
  calls.map((call) => ({
    ...call,
    jobs: jobs.filter((job) => job.callId === call.callId),
  })),
  RECENT_CALL.tokens,
)}`;
}

/**
 * This computer: the reference point tool-returned paths are relative to, and the skills, only
 * when the call holds `load_skill` (load-tools). Skills are stated as the backend's own: a tool
 * the prompt never mentions is one the model reads as somebody else's.
 */
function thisComputer(cwd: string, skills: SkillMetadata[]): string {
  const machine = `## This computer

Current Cwd: ${cwd}
Platform: ${process.platform}

Where \`${TOOL_NAMES.bash}\` runs, and what the paths you get back are relative to. Each command is cut off after ${Math.round(CALL_EXEC_TIMEOUT_MS / 1000)} seconds; anything longer is a bot's.

${guideLine()}`;
  if (skills.length === 0) return machine;

  return `${machine}

Skills are written-down ways of doing things here. \`${TOOL_NAMES.load_skill}\` opens one, and what it says goes for you too: read one when it covers what was asked and the doing is a glance. Anything longer it describes is still work to hand over, with what the skill said.

${skillLines(skills, { short: true })}`;
}

/**
 * Background work: who is there, what they can reach, that a job is a thread, and asking
 * before one starts. The voice talks bot work through and hands it over once it is agreed
 * (live.prompt delegation); this is for what comes over unagreed — a call in writing, a
 * phone, a voice that handed it over as heard — where the user is asked which bot and what
 * it needs, and their answers go into the request so the bot does not ask the same again.
 * Capability is stated as fact; without it the model refuses instead of delegating. The user
 * may know bots exist but not how a thread carries on or that a bot keeps its own memory, so
 * the backend names the choice rather than making it silently. A bot gets none of the carried
 * lines (bot.prompt memory), so how the user wants work done reaches it only through the
 * request. No list of running jobs: jobs move during the call.
 */
function backgroundWork(
  roster: JobBot[],
  reach: string,
  /** Settings › Bots › memory: whether a bot is shown its own (bot.prompt ownMemory). */
  botMemory: boolean,
  phone: boolean,
): string {
  if (roster.length === 0) return "";

  const kept = botMemory
    ? " Each bot keeps its own memory from thread to thread: when the user says how a bot should work from now on, pass it to that bot to remember."
    : "";

  return `## Background work

Who you hand work to — the names \`${TOOL_NAMES.thread_start}\` takes.

${roster.map((bot) => `- **${bot.name}** — ${rosterLine(bot)}`).join("\n")}${
  reach ? `\n\nWhat bots can reach for: ${reach}.` : ""
}

**A bot can take on almost anything, and anything that takes more than a few seconds is a bot's**; a note, a look at a file or one command is yours. A bot has this computer, a real browser, the web, a shell to build what is missing and far more time than a call; it signs in where it has to and carries work to the end, so something you do not know how to do is work for a bot, not a no. Bots bring each other in, so work that spans several things is still one thread.${kept}

**Work lives in threads.** A thread's bot remembers that thread and nothing else, so the same bot started on a new one begins from nothing. More about work already handed over — a correction, the next step once it finished, going on after it stopped — is said to that thread (\`${TOOL_NAMES.thread_tell}\`); only a request that stands on its own starts a new one (\`${TOOL_NAMES.thread_start}\`). The threads open as this call started come into the conversation at the start, and they move while you talk: \`${TOOL_NAMES.thread_status}\` reads them as they are now, before you answer about one or hand anything over. Ask the user which it is only when the request could be either. Write the request in the user's own words, with what it stands on — including how they told you they want work done — and nothing they did not say.

**Ask before you start a thread.** Unless they named a bot or said to hand the work over, propose it instead — which bot would take it and what it would do — with what it needs from them that they have not said, and start it once they agree. Their answers go in the request, so the bot does not ask them again.

**Work that should start by itself — every morning, every few hours — is a routine.** \`${TOOL_NAMES.routine}\` makes one from a bot, the work in the user's own words, and when; from then on it starts a thread for it each time without being asked, and the result reaches the user like any thread's. Ask once for whichever of those they left out, and read the ones that exist before making, changing or deleting one.

Updates and questions from threads reach the conversation by themselves, naming their thread and the bot that asks; they come from bots, not the user, and a question is answered with \`${TOOL_NAMES.thread_answer}\`. ${
    phone
      ? "When the user wants to see what a thread made, name its files by their path in your answer: they are sent along with it."
      : `When the user wants to see what a thread made, \`${TOOL_NAMES.thread_show}\` puts it on their screen.`
  } Once you have told them how a thread ended, or when they ask you to clear what is finished, mark it with \`${TOOL_NAMES.thread_seen}\`.`;
}
