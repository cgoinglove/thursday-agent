import { RECENT_CALL } from "@/config";
import { listJobBots } from "@/features/bot/bot.query";
import { type JobBot, rosterLine } from "@/features/bot/bot.schema";
import { listNoteIndex, readNotes } from "@/features/memory/memory.query";
import {
  MEMORY_ALWAYS_LISTED,
  type MemoryIndexEntry,
  type MemoryNoteView,
} from "@/features/memory/memory.schema";
import {
  type CallGroup,
  listRecentTurns,
} from "@/features/thursday/thursday.query";
import type { Where } from "@/features/thursday/thursday.schema";
import { personaLines } from "./persona";
import {
  clockNow,
  logPromptSize,
  noteLines,
  recentCallLines,
  styleLines,
  thursdayIdentity,
  tidying,
} from "./prompt-helper";

/**
 * Everything the Live voice hears: who Thursday is and who she is to talk to (persona), the
 * guide's starter backchannel and interruption policies, its delegation policy (what the
 * backend can do, when to hand over and when not), the bots by name, what she knows about the
 * user, and what was said on the last calls. How the work is done, the threads and tidying
 * memory are the backend's (thursday.prompt): the voice talks work through, hands it over once
 * it is agreed, and answers from what comes back. Assembled on every call, never cached.
 */
export async function loadLivePrompt(options: {
  /** Settings › Thursday › Style, in their own words: over the picked character, never replacing it. */
  stylePrompt?: string | null;
  /** The page placed this call because background work waits on the user (call-back). */
  calledBack?: boolean;
  /** Settings › Thursday › Style: which character she is on this call (persona). */
  persona?: string;
  /** Where they are and the weather there, when the page said (thursday/where). */
  where?: Where | null;
  /**
   * The page asks to show them where they are and the sky over it as the call opens, which it
   * does once a day (here-globe). Granted on a call that opens on nothing else and has the
   * weather to greet them with; `here` in what comes back says whether it was.
   */
  here?: boolean;
  /**
   * The call runs on the GPT subscription's voice (thursday.plan), where what comes back to her
   * arrives on one of two channels rather than as the key's kinds of update.
   */
  plan?: boolean;
}): Promise<{ text: string; opening: string; here: boolean }> {
  const [open, index, calls, roster] = await Promise.all([
    // Written out in the prompt, which is not the user asking for them: no read counted
    readNotes(MEMORY_ALWAYS_LISTED, { touch: false }),
    listNoteIndex(),
    listRecentTurns(RECENT_CALL.rows),
    listJobBots(),
  ]);

  const first = !open.notes.find((note) => note.path === "profile")?.facts
    .length;
  const earlier = earlierCalls(calls);

  const text = [
    thursdayIdentity(new Date(), options.where),
    personaLines(options.persona),
    always(),
    yourBots(roster),
    options.plan ? channels() : "",
    known(open.notes, index),
    first ? firstCall(!earlier) : "",
    earlier,
    styleLines(options.stylePrompt),
  ]
    .filter(Boolean)
    .join("\n\n");
  logPromptSize("live", text);

  const introduces = !options.calledBack && first && !earlier;
  // The globe is drawn while she greets, so the greeting is the weather it shows: a second
  // message about the screen would come in beside the opening, and the opening is the one
  // thing everything else on the line waits for (use-thursday)
  const here = Boolean(
    options.here &&
      !options.calledBack &&
      !introduces &&
      options.where?.weather,
  );
  return {
    text,
    // A prompt line alone does not make Live speak first; only an opening does.
    // A call-back's opening holds no bot text: the update itself follows as commentary.
    // Introducing herself is for a user never spoken to: with a profile still empty but
    // earlier calls read to her, that opening left her silent until the user spoke. It keeps
    // the shape of every other opening: asked to say what she is for "in a line or two", she
    // waited for the caller on most first calls
    opening: options.calledBack
      ? "You placed this call because background work has something for the user; it comes in next. Speak first: greet them in one line and say that is why you called."
      : introduces
        ? `The call has just started. It is ${clockNow()} for them. Speak first: greet the user in one line, say you are Thursday, and ask what to call them.`
        : here
          ? // The weather is already in her prompt (whereLine): this says only that it is the
            // greeting. Nothing about the screen: the globe can still fail to come up once the
            // line is open (a page hidden by then), and she spoke of a globe nobody saw
            `The call has just started. It is ${clockNow()} for them. Speak first: greet the user in one line, with the weather there — never work.`
          : // The hour is a fact of the moment, so it rides on the opening and not in the prompt.
            // One thing about them, never work: the threads are what opened every call before
            `The call has just started. It is ${clockNow()} for them. Speak first: greet the user naturally, in one line. You may pick up one thing from what you know about them — never a list, never work.`,
    here,
  };
}

/**
 * The rules for every turn, together right under the persona, where the model weighs most.
 * Ending the call is on the delegation list and nowhere else: a rule of its own, even one
 * naming `end_call` and stamped IMPORTANT, did not make the voice hand a hang-up over.
 */
const always = () => `## Always

${speaking()}

${delegation()}`;

/**
 * The guide's starter lines on listening and interruptions, as it writes them: how much
 * anyone wants to be backchannelled at is how they want to be spoken to, which is theirs to
 * say and lives in their memory. The language is the one being spoken, never the browser's:
 * a first call opened in the browser's language kept a caller in the wrong one.
 */
function speaking(): string {
  return `Backchannel policy: Use moderate backchannels. Acknowledge naturally without competing with the main response.

Interruption policy: Stop speaking when the user interrupts. Listen to what they say.

Speak the language the user is speaking, whatever language came before; when they switch, switch with them.`;
}

/**
 * The guide's three labels, as it asks: Live decides for itself whether to hand a turn over,
 * and reads that from what the list says the backend can do. Without the list it said "yes"
 * to a hang-up, a stop or a routine and handed nothing over. The list names what can be done,
 * never how: tools and threads stay the backend's, and the bots are named (yourBots) only so
 * she can ask which one. What they say about themselves is not
 * a line of its own: a spoken call is read for it once it ends (features/memory/call-memory),
 * and a line asking her to hand it over was followed rarely (0/12 names) and, pressed, cost a
 * hold phrase and a 6-9 s wait each time (5e257b67, reverted in 094fc026). Asked to keep something, she
 * hands it over as anything else on the list. Stopping her voice is not stopping a job (the
 * guide's interruptions): the one is hers, the other the backend's. A goodbye is on the
 * hand-over side by name: read as a greeting under "do not", a goodnight was answered by her
 * and the line stayed open. Work for a bot is talked through and agreed before it goes over:
 * with every request on the list handed over as heard, the backend started the bot unasked —
 * on the maintainer's calls (09-30 to 10-03) five of nine threads were ones she chose to
 * start, and four of those the user stopped or asked her to do herself — and told only to
 * propose first, the backend still started it (gpt-6-luna, 5 of 6 in a backend-only eval, 10-04).
 */
function delegation(): string {
  return `Delegation policy:
Backend tools:
- Ending the call: hangs up the line — only the backend can, so a goodbye, or a hang-up they ask for, is handed over rather than answered.
- Background work: hands a job to one of your bots — anything longer than a quick search or one command — passes words on, stops or changes a job, answers a bot's question, says how the work stands, puts what a job made on their screen.
- Routines: jobs that start by themselves later.
- Memory: keeps what the user tells you about themselves, and looks it up.
- This computer and the web: runs a command, searches.

Delegate to the backend when:
- They say goodbye or good night, in whatever words, or want the call to end.
- They agree to give work to a bot, or name the bot to give it to.
- They ask for anything else on that list, or change or stop work already asked for.

Do not delegate to the backend when:
- They say hello, make small talk, or only want you to stop talking.
- You can answer from the conversation or a result still current.
- You need a brief clarification to understand the request.
- They want work a bot would do and have not agreed to give it to one: talk it through first, ask what it needs, then ask whether to give it to the bot that fits.

Delegate before giving an answer that depends on backend work. Do not guess the result while waiting.`;
}

/**
 * The bots by name and line, as the backend reads them, so the work she talks through has
 * someone to go to: without the names she could only hand a request over, and the backend
 * chose the bot. How a job is started, carried on or read stays the backend's.
 */
function yourBots(roster: JobBot[]): string {
  if (roster.length === 0) return "";
  return `## Your bots

Who background work goes to:
${roster.map((bot) => `- ${bot.name} — ${rosterLine(bot)}`).join("\n")}`;
}

/**
 * On the GPT subscription's voice, what the app puts in comes on one of two channels
 * (live.plan `PlanChannel`): what she is to say, and background she is not to read out. The
 * lines follow what OpenClaw tells the same voice (extensions/openai
 * realtime-quicksilver-instructions.ts `OPENAI_QUICKSILVER_CHANNEL_INSTRUCTIONS`).
 */
function channels(): string {
  return `## What comes back to you

Context on the speakable channel is yours to say: the result of what you handed over, or an update for them. Say it naturally, in your own words. Context on the commentary channel is silent background: use it when it matters, and never read it out. Never mention the channel or the hand-over.`;
}

/**
 * Profile and preferences written out whole, as the backend reads them, then every other note
 * as a listing line: what Thursday knows is the same on both sides. Whole, because a rule she
 * is to follow is only followed when it is in front of her: the ten newest lines with the
 * rest counted hid the oldest rules first, which are the ones about how to speak to them. Ids
 * and the contents of listed notes stay the backend's.
 */
function known(open: MemoryNoteView[], index: MemoryIndexEntry[]): string {
  const written = new Set(open.map((note) => note.path));
  const notes = open
    .filter((note) => note.facts.length)
    .map(
      (note) =>
        `${note.path}:\n${note.facts.map((fact) => `- ${fact.text}`).join("\n")}`,
    );
  const others = index.filter((note) => !written.has(note.path));
  if (!notes.length && !others.length) return "";

  const parts = [
    ...notes,
    // Ages ride on the listing only when there is too much to hold: they are what to drop by
    others.length
      ? `Everything else you have kept — path — what it is about (facts):\n\n${noteLines(others, tidying(index).crowded)}\n\nWhat is in these notes, the backend recalls.`
      : "",
  ].filter(Boolean);

  return `## What you know about them

${parts.join("\n\n")}

Preferences are how they want things done and said, some of it for a particular situation: follow them. A topic not listed is one you know nothing about yet.`;
}

/** `asked`: the opening asks what to call them, and a second ask in the same breath read as not listening. */
function firstCall(asked: boolean): string {
  return `## First call

Nothing is known about this user yet. Across the call, one thing at a time and never as a list of questions, find out ${asked ? "" : "what to call them, their name, "}what they do, where they live, and whatever else they offer. If they came with something they want done, that comes first.`;
}

/**
 * What was said on the last calls, as the backend reads it (recentCallLines) but for the tool
 * lines: the voice holds no tool, and a line of arguments would read as something she said.
 * It sits in the prompt, as reading, and never in the conversation: put there as turns, the
 * hang-up a call ended on was answered as if just said, and the next call hung up at once.
 * Each call carries when it was. Absent on the first call.
 */
function earlierCalls(calls: CallGroup[]): string {
  const spoken = calls
    .map((call) => ({
      ...call,
      turns: call.turns.filter((turn) => turn.role !== "tool"),
    }))
    .filter((call) => call.turns.length > 0);
  if (!spoken.length) return "";

  return `## Earlier calls

What was said on the last calls, newest last, each under when it was. They are over, and this call is a new one: read them as background, pick one up when the user does, and never answer anything in them as if it were being said now.

${recentCallLines(spoken, RECENT_CALL.tokens)}`;
}
