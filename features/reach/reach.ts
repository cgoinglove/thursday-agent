import { randomInt } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { type ModelMessage, transcribe } from "ai";
import { appEvents, presence } from "@/app/api/events/app-event.server";
import { BROWSER_GONE_MS, REACH } from "@/config";
import {
  buildTranscriptionModel,
  modelErrorToString,
  resolveMediaRef,
} from "@/features/ai/model";
import { clockNow } from "@/features/ai/prompts/prompt-helper";
import { asWords } from "@/features/ai/words";
import { answerThread } from "@/features/bot/bot.runner";
import type { Thread } from "@/features/bot/bot.schema";
import { acceptRoomRelays } from "@/features/bot/room.query";
import {
  listCallJobs,
  listInboxThreads,
  markSeen,
} from "@/features/bot/thread.query";
import {
  configState,
  readConfig,
  removeConfig,
  writeConfig,
} from "@/features/config/config.query";
import {
  type OpenWork,
  openWork,
  questionKey,
} from "@/features/thursday/open-work";
import { endCall, isCallOpen } from "@/features/thursday/thursday.query";
import {
  answerInWriting,
  openTextCall,
  type TurnNote,
} from "@/features/thursday/thursday.text";
import { toolLine } from "@/features/thursday/tool-line";
import { isPicture, pathsIn, viewKindOf } from "@/features/workspace/file-kind";
import { filesOnDisk, insideWorkspace } from "@/features/workspace/workspace";
import { keepGivenFiles } from "@/features/workspace/workspace.query";
import { toDate } from "@/lib/date-like";
import { logger } from "@/lib/logger";
import { isPublicError, publicError } from "@/lib/public-error";
import {
  type Button,
  type Channel,
  ChannelRefusal,
  type Incoming,
  type IncomingFile,
  type OutgoingFile,
  type Pressed,
} from "./channel";
import { type ChatText, literal } from "./chat-text";
import { createDiscord } from "./discord";
import { createEmail } from "./email";
import { pdfOf, picturesOf } from "./pictures";
import {
  EMAIL_ADDRESS_KEY,
  EMAIL_IMAP_KEY,
  EMAIL_SMTP_KEY,
  REACH_CHANNELS,
  REACH_KEYS,
  REACH_LABEL,
  type ReachAsking,
  type ReachChannelName,
  type ReachMailbox,
  type ReachPerson,
  type ReachStatus,
  reachPersonKey,
} from "./reach.schema";
import { createSlack } from "./slack";
import { createTelegram } from "./telegram";

/**
 * Thursday from a phone. The server connects outward to a chat service the user set up —
 * their own bot on Telegram, Discord or Slack, or a mailbox of hers, nothing opened to the
 * outside — and answers
 * with the backend a call in writing runs (thursday.text): same prompt, memory, tools and
 * rows, so it is a call like any other, held here instead of by a page. One person may
 * write through each service, and the screen is where they are let in: someone who can
 * write to her can, through her, run things on this computer.
 *
 * A turn is what they wrote and what she answered; work she handed over comes back later,
 * by itself. It comes as the bot wrote it, with its files, and no turn of hers is spent
 * saying it again — she is left a fact, so what is written back lands where she can route
 * it, and a question's options go as buttons that answer the bot directly. What they write
 * while she is still working joins that turn rather than waiting for one of its own.
 *
 * Who she is and what she may do is the app's, kept where a call reads it
 * (thursday.query readLiveSettings), so the person here meets the same Thursday the
 * screen does. What stays in a browser is how that machine talks to her, which a chat
 * has no use for.
 */

/** How each service is made from its keys, in `REACH_KEYS` order. The one place that knows there are four. */
const MAKE: Record<ReachChannelName, (...keys: string[]) => Channel> = {
  telegram: (token) => createTelegram(token),
  discord: (token) => createDiscord(token),
  slack: (app, bot) => createSlack(app, bot),
  email: (address, password, imap, smtp) =>
    createEmail(address, password, imap, smtp),
};

/** The conversation with one person, for as long as it is kept going (REACH.idleMs, or work it started). */
type Line = {
  callId: string;
  standing: string | null;
  messages: ModelMessage[];
  lastAt: number;
  /** A spent plan moved a turn onto the OpenAI key, and the chat was told: once a conversation. */
  moved?: true;
};

/** One service being listened to. */
type Live = {
  name: ReachChannelName;
  channel: Channel;
  stop: AbortController;
  bot: string | null;
  /** Where to go to reach this bot, as the service named it (`channel.ts`). */
  link: string | null;
  problem: string | null;
  /** Why something that arrived is held and not read yet (reach.schema `holding`). */
  holding: string | null;
  /** The key whose token the service turned away: listening has stopped until a key changes. */
  refused: string | null;
  /** The bot's own id on the service, once it has connected: who is let in is let in to it. */
  id: string | null;
  /**
   * Started with the token that was already there, so a record kept before the app noted
   * which bot someone was let in to is taken as this bot's (settle).
   */
  adopt: boolean;
  /** Who is let in, checked against the bot that connected: what arrives waits on it. */
  settled: Promise<void>;
  asking: ReachAsking | null;
  /** What the one asking wrote while they wait, up to REACH.held: answered once they are let in. */
  held: Written[];
  line: Line | null;
  /** The calls its conversations were kept as: a thread started from one comes back here. */
  calls: Set<string>;
  /** One turn at a time: what arrives during it joins it (`notes`). */
  busy: boolean;
  /** Stops the turn that is running, when whoever it answers may no longer write (forgetReach). */
  turn?: AbortController | null;
  /**
   * What has yet to enter the conversation: their words while a turn runs, and facts put
   * in for them. A running turn takes them between its steps; the next takes the rest first.
   */
  notes: TurnNote[];
};

/** A button under a question: which bot's question it answers, and with what. */
type Choice = {
  threadId: string;
  bot: string;
  question: string;
  answer: string;
};

type State = {
  live: Map<ReachChannelName, Live>;
  /** Where they last wrote from: open work goes there, once, rather than to every service. */
  last: ReachChannelName | null;
  /**
   * Open work settled here, by item key (open-work): sent to a phone, or left to the screen
   * that was watching. A question left to the screen goes to the phone once no screen is
   * (offerLeftQuestions): a bot waits on its answer, and nobody is there to give it.
   */
  told: Map<string, { kind: OpenWork["kind"]; phone: boolean }>;
  choices: Map<string, Choice>;
  listening: (() => void) | null;
  /** Stops hearing that the last browser left (presence). */
  gone: (() => void) | null;
  /** A look at the inbox already on its way: a working bot changes threads many times a second. */
  looking: ReturnType<typeof setTimeout> | null;
  /** A look is running (`look`), and whether something changed that it may not have read. */
  inLook?: boolean;
  lookAgain?: boolean;
  /** Closes lines nobody is writing to any more (sweepIdleLines). */
  idle: ReturnType<typeof setInterval> | null;
};

// Pinned, as the event bus is: a dev reload evaluates this module again, and a second
// listener on one token is refused by the service
const pinned = globalThis as { __reach?: State };
const state: State = (pinned.__reach ??= {
  live: new Map(),
  last: null,
  told: new Map(),
  choices: new Map(),
  listening: null,
  gone: null,
  looking: null,
  idle: null,
});

const changed = () => appEvents.emit({ type: "reach" });

/** Who is let in through a service, and the bot they were let in to (null in a record kept before that was noted). */
type Kept = ReachPerson & { bot: string | null };

/** Who is let in through that service, once it is checked against the bot that connected (settle). */
async function readPerson(name: ReachChannelName): Promise<Kept | null> {
  await state.live.get(name)?.settled;
  return readKept(name);
}

async function readKept(name: ReachChannelName): Promise<Kept | null> {
  const kept = await readConfig(reachPersonKey(name));
  if (!kept) return null;
  try {
    const person = JSON.parse(kept) as Partial<Kept>;
    return typeof person.chat === "string" && typeof person.name === "string"
      ? {
          chat: person.chat,
          name: person.name,
          bot: typeof person.bot === "string" ? person.bot : null,
        }
      : null;
  } catch {
    return null;
  }
}

const writePerson = (name: ReachChannelName, person: Kept) =>
  writeConfig(reachPersonKey(name), JSON.stringify(person));

export async function readReachStatus(): Promise<ReachStatus> {
  return {
    channels: await Promise.all(
      [...state.live.values()].map(async (live) => ({
        name: live.name,
        bot: live.bot,
        link: live.link,
        allowed: await readPerson(live.name).then(
          (person) => person && { chat: person.chat, name: person.name },
        ),
        asking: live.asking,
        refused: live.refused,
        problem: live.problem,
        holding: live.holding,
        mailbox: live.name === "email" ? await readMailbox() : null,
      })),
    ),
  };
}

/** Email's mailbox as it was saved; none of it is secret (reach.schema). */
async function readMailbox(): Promise<ReachMailbox | null> {
  const [address, imap, smtp] = await Promise.all(
    [EMAIL_ADDRESS_KEY, EMAIL_IMAP_KEY, EMAIL_SMTP_KEY].map(readConfig),
  );
  return address && imap && smtp ? { address, imap, smtp } : null;
}

/** The calls held open here for someone on a phone: no tab holds them, so none leaving closes them (instrumentation). */
export const heldCalls = (): string[] =>
  [...state.live.values()].flatMap((live) =>
    live.line ? [live.line.callId] : [],
  );

/** The service a config key belongs to, for whoever writes keys (config.action). */
export const reachChannelOf = (key: string): ReachChannelName | null =>
  REACH_CHANNELS.find((name) => REACH_KEYS[name].includes(key)) ?? null;

/**
 * Listens to every service whose keys are set. Called at boot for all of them, and with a
 * service's name whenever one of its keys changes (config.action). A new token may be this
 * bot's, revoked and given again, or another bot's: whoever was let in stays for the one and
 * goes with the other, once the service says which bot it is (settle). A token taken out
 * takes them with it.
 */
export async function startReach(fresh?: ReachChannelName): Promise<void> {
  for (const name of fresh ? [fresh] : REACH_CHANNELS) {
    const was = state.live.get(name);
    was?.stop.abort();
    state.live.delete(name);
    if (fresh && was?.line) await endCall(was.line.callId).catch(() => {});

    // A token saved but no longer readable is not one taken out: the service stays off until it
    // is given again (Settings › Phone says why), and whoever was let in stays for it — Slack's
    // two come back one at a time, and the first alone must not let them go
    const states = await Promise.all(REACH_KEYS[name].map(configState));
    if (states.includes("unreadable")) continue;
    const keys = await Promise.all(REACH_KEYS[name].map(readConfig));
    if (!keys.every((key): key is string => Boolean(key))) {
      if (fresh) await removeConfig(reachPersonKey(name));
      continue;
    }
    // The bot the last token reached is who an older record was let in to
    const person = fresh && was?.id ? await readKept(name) : null;
    if (person && person.bot === null && was?.id)
      await writePerson(name, { ...person, bot: was.id });
    const live: Live = {
      name,
      channel: MAKE[name](...keys),
      stop: new AbortController(),
      bot: null,
      link: null,
      problem: null,
      holding: null,
      refused: null,
      id: null,
      adopt: !fresh,
      settled: Promise.resolve(),
      asking: null,
      held: [],
      line: null,
      calls: new Set(),
      busy: false,
      notes: [],
    };
    state.live.set(name, live);
    void listen(live);
  }

  if (state.live.size) {
    state.listening ??= appEvents.subscribe((event) => {
      if (event.type === "threads") lookSoon();
    });
    state.gone ??= presence.onGone(offerLeftQuestions);
    // What boot's own sweep stopped (instrumentation sweepThreads) was emitted before
    // this subscription existed, and nothing re-emits it
    lookSoon();
    state.idle ??= setInterval(() => {
      void sweepIdleLines().catch((cause) =>
        logger.error("reach: idle lines", cause),
      );
    }, REACH.idleMs).unref();
  }
  changed();
}

async function listen(live: Live) {
  const { signal } = live.stop;
  const trouble = (why: string | null) => {
    if (live.problem === why) return;
    live.problem = why;
    changed();
  };
  while (!signal.aborted) {
    try {
      await live.channel.listen(
        {
          ready: (bot, link, id) => {
            live.bot = bot;
            live.link = link;
            live.problem = null;
            // A new connection looks again, and says so again if it still holds one
            live.holding = null;
            live.id = id;
            live.settled = settle(live, id).catch((cause) =>
              logger.error(`reach ${live.name}: who is let in`, cause),
            );
            changed();
          },
          incoming: (incoming) =>
            void take(live, incoming).catch((cause) =>
              logger.error(`reach ${live.name}: what arrived`, cause),
            ),
          holding: (why) => {
            if (live.holding === why) return;
            live.holding = why;
            changed();
          },
          // A channel that names who may write hears no one else (take): it need not read them
          wanted: async (chat) =>
            !live.channel.named || (await readPerson(live.name))?.chat === chat,
        },
        signal,
      );
    } catch (cause) {
      if (signal.aborted) return;
      const why = cause instanceof Error ? cause.message : String(cause);
      // A token the service turns away is the user's to fix; asking again would not change it.
      // Which token is kept, so the screen opens the step that holds it
      if (cause instanceof ChannelRefusal) {
        logger.warn(`reach ${live.name}: ${why}`);
        const keys = REACH_KEYS[live.name];
        live.refused = keys[cause.token] ?? keys[0];
        live.problem = why;
        return changed();
      }
      // No network, the service down, a second listener on the token: said, and tried again
      trouble(why);
    }
    await new Promise((resolve) => setTimeout(resolve, REACH.retryMs));
  }
}

/**
 * Whoever was let in, against the bot that answered: let in to this very bot, they stay; to
 * another, they go, since its chats are other people's (a Telegram chat is the person's own
 * id, the same with every bot). A record from before bots were noted is this bot's when the
 * token is the one it was kept under.
 */
async function settle(live: Live, id: string) {
  const person = await readKept(live.name);
  if (!person || person.bot === id) return;
  if (person.bot === null && live.adopt)
    return writePerson(live.name, { ...person, bot: id });
  await removeConfig(reachPersonKey(live.name));
  changed();
}

/** A message as the service handed it over. */
type Written = Extract<Incoming, { kind: "message" }>;

async function take(live: Live, incoming: Incoming) {
  const person = await readPerson(live.name);
  // Not vouched for as theirs: never heard, and said only to the one who may write, in whose
  // name it came — to anyone else it would go to whoever they claimed to be
  if (incoming.kind === "message" && incoming.unproven !== undefined) {
    if (person?.chat === incoming.chat)
      await live.channel.say(incoming.chat, { plain: incoming.unproven });
    return;
  }
  if (incoming.kind === "press") {
    if (person?.chat !== incoming.chat) return;
    return choose(live, person, incoming.data, incoming.under);
  }
  if (person?.chat === incoming.chat) return written(live, person, incoming);
  // Who may write is named on the screen: nobody else is answered, or asked about
  if (live.channel.named) return;
  if (person)
    return live.channel.say(incoming.chat, {
      plain: "This Thursday already answers someone else.",
    });
  return ask(live, incoming);
}

/**
 * Someone not let in yet wrote: the screen asks about them, and what they write meanwhile
 * waits to be answered once they are let in (allowReach). A display name is anyone's to pick,
 * so the screen shows a code this phone alone was sent: the user lets in the phone in their
 * hand, not a name. Writing again changes neither the ask nor its code.
 */
async function ask(live: Live, incoming: Written) {
  // One at a time: overwriting would drop the first person without a word, and
  // put a name on the screen's Allow that is not the one who asked for it.
  if (live.asking && live.asking.chat !== incoming.chat)
    return live.channel.say(incoming.chat, {
      plain:
        "Someone else is already waiting to be let in here. If that is not you, press Not them on the computer, then write again.",
    });
  if (live.held.length < REACH.held) live.held.push(incoming);
  if (live.asking) return;
  live.asking = {
    chat: incoming.chat,
    name: incoming.name,
    handle: incoming.handle,
    said: incoming.words,
    code: randomInt(10 ** REACH.codeDigits)
      .toString()
      .padStart(REACH.codeDigits, "0"),
  };
  changed();
  await live.channel.say(incoming.chat, {
    plain: `Almost there. Thursday is asking on your computer whether to let you in. Press Allow there only if it shows ${live.asking.code}, and she answers what you wrote.`,
  });
}

/** What someone let in wrote, for her. */
async function written(live: Live, person: ReachPerson, incoming: Written) {
  const said = await wordsOf(live, incoming);
  if (said) hear(live, person, said);
}

/**
 * What a message brings her: its words with the paths of what it carried, and the pictures
 * among those, which go into her conversation as pictures (thursday.text answerInWriting).
 */
type Said = { words: string; pictures: string[] };

/**
 * The words a message brings her: what it says, and the paths of what it carried, kept in the
 * workspace as the write line keeps them. A file that did not come through is said at once,
 * and what was written with it still goes to her, with the fact, so she answers it without
 * reading a file that is not there. Null when nothing in it is for her.
 */
async function wordsOf(live: Live, incoming: Written): Promise<Said | null> {
  const { channel } = live;
  state.last = live.name;
  const { kept, lost } = await takeFiles(live, incoming.files);
  const spoken = incoming.voice ? await voiceWords(live, incoming.voice) : null;
  if (spoken && "why" in spoken)
    lost.push({ name: "Your voice message", why: spoken.why });
  if (lost.length)
    await channel
      .say(incoming.chat, {
        plain: lost
          .map(({ name, why }) => `${name} did not come through: ${why}.`)
          .join("\n"),
      })
      .catch((cause) =>
        logger.warn(`reach ${live.name}: could not say so`, cause),
      );
  const heard =
    spoken && "words" in spoken
      ? `[A voice message, as a transcription model heard it:] ${spoken.words}`
      : "";
  const words = [incoming.words, heard, ...kept].filter(Boolean).join("\n");
  if (!words) {
    if (incoming.unreadable && !lost.length)
      await channel.say(incoming.chat, {
        plain:
          "I can read words, voice messages, pictures and files here — not video yet. Write it instead.",
      });
    return null;
  }
  if (lost.length)
    live.notes.push({
      text: `[Sent from their phone with what follows, and lost on the way: ${lost.map(({ name, why }) => `${name} (${why})`).join("; ")}. They have been told.]`,
      said: false,
    });
  return { words, pictures: kept.filter(isPicture) };
}

type Lost = { name: string; why: string };

/**
 * A voice message as words, by the transcription model picked in Settings › Models, which bills
 * for it: with none picked it is not read (a feature that costs per use runs only on what the
 * user picked for it), and they are told where to pick one. Past what the service hands over or
 * REACH.fileBytes, or refused by the model, it is said why.
 */
async function voiceWords(
  live: Live,
  voice: IncomingFile,
): Promise<{ words: string } | { why: string }> {
  const found = await resolveMediaRef("transcription");
  if (!found)
    return {
      why: "voice messages are read once a transcription model is picked in Settings › Models",
    };
  const most = Math.min(live.channel.limits.take, REACH.fileBytes);
  if (voice.size && voice.size > most)
    return {
      why: `it is ${megabytes(voice.size)}, and the most taken from ${REACH_LABEL[live.name]} is ${megabytes(most)}`,
    };
  try {
    const audio = new Uint8Array(await (await voice.fetch()).arrayBuffer());
    const { text } = await transcribe({
      model: buildTranscriptionModel(found.ref, found.apiKey),
      audio,
    });
    return text.trim()
      ? { words: text.trim() }
      : { why: "the transcription model heard no words in it" };
  } catch (cause) {
    return { why: modelErrorToString(cause) };
  }
}

/**
 * What they sent, kept in the workspace, and what was not, each with why: past what the
 * service hands a bot or REACH.fileBytes, or lost on the way.
 */
async function takeFiles(
  live: Live,
  files: IncomingFile[],
): Promise<{ kept: string[]; lost: Lost[] }> {
  const most = Math.min(live.channel.limits.take, REACH.fileBytes);
  const lost: Lost[] = [];
  const wanted = files.filter((file) => {
    if (!file.size || file.size <= most) return true;
    lost.push({
      name: file.name,
      why: `it is ${megabytes(file.size)}, and the most taken from ${REACH_LABEL[live.name]} is ${megabytes(most)}`,
    });
    return false;
  });
  const fetched = await Promise.allSettled(wanted.map((file) => file.fetch()));
  const arrived: File[] = [];
  for (const [at, one] of fetched.entries())
    if (one.status === "fulfilled") arrived.push(one.value);
    else lost.push({ name: wanted[at].name, why: reasonOf(one.reason) });
  if (!arrived.length) return { kept: [], lost };
  try {
    return { kept: await keepGivenFiles(arrived), lost };
  } catch (cause) {
    const why = reasonOf(cause);
    return {
      kept: [],
      lost: [...lost, ...arrived.map((file) => ({ name: file.name, why }))],
    };
  }
}

const reasonOf = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

/** A size as a chat says it: whole megabytes, rounded up so a file just past a cap never reads as under it. */
const megabytes = (bytes: number) => `${Math.ceil(bytes / (1024 * 1024))} MB`;

/** Lets in whoever is asking through that service. The screen's Allow (reach.action). */
export async function allowReach(
  name: ReachChannelName,
  chat: string,
  code: string,
): Promise<void> {
  const live = state.live.get(name);
  // The ask the screen showed, code and all: a dialog left from an earlier ask lets nobody in
  const asking = isAsking(live, chat, code);
  if (!live || !asking) return;
  // With the bot they are let in to, so a token given again for it keeps them (settle)
  const person: Kept = { chat: asking.chat, name: asking.name, bot: live.id };
  await writePerson(name, person);
  live.asking = null;
  changed();
  const held = live.held.splice(0);
  await live.channel
    .say(chat, {
      plain: held.length
        ? "You are in. Thursday answers what you wrote."
        : "You are in. Write here and Thursday answers.",
    })
    .catch((cause) => logger.warn(`reach ${name}: could not say so`, cause));
  // What they wrote while they waited was all written before she could answer, so it is
  // answered as one turn, in the order it was written
  const saids: Said[] = [];
  for (const one of held) {
    const said = await wordsOf(live, one).catch((cause) => {
      logger.warn(`reach ${name}: what they wrote while waiting`, cause);
      return null;
    });
    if (said) saids.push(said);
  }
  if (saids.length)
    hear(live, person, {
      words: saids.map((said) => said.words).join("\n"),
      pictures: saids.flatMap((said) => said.pictures),
    });
}

/** Turns away whoever is asking, if they are still the one asked about; they may ask again. */
export function declineReach(
  name: ReachChannelName,
  chat: string,
  code: string,
): void {
  const live = state.live.get(name);
  if (!live || !isAsking(live, chat, code)) return;
  live.asking = null;
  // What they wrote is not for the next one to be let in
  live.held = [];
  changed();
}

const isAsking = (live: Live | undefined, chat: string, code: string) =>
  live?.asking?.chat === chat && live.asking.code === code ? live.asking : null;

/**
 * Names who may write through a service that takes no first message to let them in
 * (channel.ts `named`): the user's own address, for email. It is kept with the mailbox it was
 * named for, so another mailbox starts with nobody (settle). Whoever was named before goes,
 * with what waited for them.
 */
export async function nameReach(
  name: ReachChannelName,
  address: string,
): Promise<void> {
  const mailbox = (await readConfig(EMAIL_ADDRESS_KEY))?.toLowerCase();
  if (!mailbox) publicError("Save her mailbox first.");
  const chat = address.trim().toLowerCase();
  if (chat === mailbox)
    publicError(
      "That is her own address. Name the address you will write to her from.",
    );
  const live = state.live.get(name);
  if (live) {
    live.turn?.abort();
    live.notes = [];
    live.calls.clear();
    await hangUp(live);
  }
  await writePerson(name, { chat, name: address.trim(), bot: mailbox });
  changed();
}

/** Nobody may write through that service any more; the bot stays, so the next to write asks to be let in. */
export async function forgetReach(name: ReachChannelName): Promise<void> {
  await removeConfig(reachPersonKey(name));
  const live = state.live.get(name);
  if (live) {
    // A turn of theirs still running would go on using her tools, and answer a chat that
    // was just turned away
    live.turn?.abort();
    // What waited for them is not the next person's to read
    live.notes = [];
    live.calls.clear();
    await hangUp(live);
  }
  changed();
}

/**
 * Ends a line nobody has written to in REACH.idleMs. A phone conversation is kept
 * as a call, and a call left open is one `isAnyCallLive` keeps finding — so a
 * finished job is put on a screen rather than sent as a desktop notice
 * (bot.runner), on a machine whose browser is closed. Someone who writes a few
 * times and stops, which is most of them, leaves exactly that. `answer` makes the
 * same judgement when the next words arrive; this is for when they never do.
 */
async function sweepIdleLines(): Promise<void> {
  for (const live of state.live.values())
    if (live.line && !live.busy && (await idle(live.line))) await hangUp(live);
}

/**
 * Quiet for REACH.idleMs with nothing it started still running. She handed work over and
 * her turn ended, as a bot's does when it calls another; the conversation is what that
 * work comes back to, so it is kept until it has.
 */
async function idle(line: Line): Promise<boolean> {
  if (Date.now() - line.lastAt <= REACH.idleMs) return false;
  const started = await listCallJobs([line.callId]);
  return !started.some((job) => job.status === "running");
}

/** Ends the conversation as a call. */
async function hangUp(live: Live) {
  const line = live.line;
  live.line = null;
  if (line) await endCall(line.callId).catch(() => {});
}

/**
 * What they wrote. While a turn runs it joins that turn, read before her next step as a
 * bot reads what it is told mid-job (bot.run); a chat cannot stop anyone writing twice, and
 * a second turn for it would answer the first thing again. Otherwise it starts a turn, and
 * what came too late for that turn's last step gets the next.
 */
function hear(live: Live, person: ReachPerson, said: Said) {
  if (live.busy)
    return void live.notes.push({
      text: said.words,
      said: true,
      pictures: said.pictures,
    });
  live.busy = true;
  void (async () => {
    try {
      for (let next: Said | null = said; next !== null; ) {
        await answer(live, person, next);
        const late = live.notes.filter((note) => note.said);
        live.notes = live.notes.filter((note) => !note.said);
        next = late.length
          ? {
              words: late.map((note) => note.text).join("\n"),
              pictures: late.flatMap((note) => note.pictures ?? []),
            }
          : null;
      }
    } finally {
      live.busy = false;
    }
  })();
}

async function answer(
  live: Live,
  person: ReachPerson,
  { words, pictures }: Said,
) {
  const { channel } = live;
  // "typing…" lasts a few seconds on the service's side, so it is said again while she works
  void channel.typing(person.chat).catch(() => {});
  const typing = setInterval(
    () => void channel.typing(person.chat).catch(() => {}),
    4_000,
  );
  // Facts that waited go in ahead of the words; theirs that arrive from here on join the turn
  const facts = live.notes.filter((note) => !note.said);
  live.notes = live.notes.filter((note) => note.said);
  // Stopped with the service (startReach) and with whoever it answers (forgetReach, nameReach)
  const turn = new AbortController();
  live.turn = turn;
  const stopped = () => turn.signal.aborted || live.stop.signal.aborted;
  try {
    // Quiet for long enough, or closed under it (the server restarted): the next words
    // open a new call, which reads the last one back under Earlier calls
    const kept = live.line;
    if (!kept || !(await isCallOpen(kept.callId)) || (await idle(kept))) {
      await hangUp(live);
      live.line = {
        ...(await openTextCall()),
        messages: [],
        lastAt: 0,
      };
      live.calls.add(live.line.callId);
    }
    const line = live.line as Line;
    const result = await answerInWriting({
      callId: line.callId,
      standing: line.standing,
      messages: [
        ...line.messages,
        ...facts.map((note) => ({ role: "user" as const, content: note.text })),
        { role: "user", content: words },
      ],
      said: words,
      pictures,
      notes: () => live.notes.splice(0),
      signal: AbortSignal.any([turn.signal, live.stop.signal]),
    });
    // Ended as it was stopped: its answer is for nobody
    if (stopped()) return;
    line.messages = carried(result.messages);
    line.lastAt = Date.now();
    // Every turn asks the plan first and moves again until it resets: said once, ahead of her answer
    if (result.moved && !line.moved) {
      line.moved = true;
      await channel.say(person.chat, { plain: result.moved });
    }

    // What she did, in the call screen's words, only for a turn she ended without a word: a
    // chat has no activity line, so that is all it would show. Under an answer she wrote, the
    // app's own "— Checking · projects/presentation" read as part of her reply (D12). Her words
    // are markdown, drawn in the service's own marks; the line is words, whatever it holds
    const did = [...new Set(result.did)].join(" · ");
    const reply = {
      markdown: result.text?.trim() || (did ? `— ${literal(did)}` : "…"),
    };
    if (channel.attaches) await sayAttached(live, person, reply, result.text);
    else {
      await channel.say(person.chat, reply);
      await sendFiles(live, person, result.text);
    }
  } catch (cause) {
    // Stopped, not failed: nothing is said to a chat that was turned away, and what waited
    // for them is not put back for the next person
    if (stopped()) return;
    live.notes.unshift(...facts);
    // A conversation that never had a turn is no call to keep open: an open call is taken
    // to be listening (bot.runner), and nothing would ever close this one
    if (live.line && !live.line.lastAt) await hangUp(live);
    // What a provider refused is the user's to act on, so it reaches them as it was said
    const why = isPublicError(cause)
      ? cause.message
      : modelErrorToString(cause);
    logger.warn(`reach ${live.name}: ${why}`);
    await channel.say(person.chat, { plain: why }).catch(() => {});
  } finally {
    clearInterval(typing);
    if (live.turn === turn) live.turn = null;
  }
}

/**
 * What of the conversation goes with the next turn. Up to the last thing they wrote it is
 * words alone: what a tool answered and what she thought are most of what a turn weighs,
 * every turn sends all of it again, and a thread is looked up again when it matters. From
 * there on it is whole, so a follow-up still reads what she just found. A step that was
 * only a tool call is kept as what she did, in the call screen's words, so she does not
 * start the same work again. Past REACH.messages the oldest go down to REACH.trimTo, from
 * where they speak, so no tool call is parted from its result.
 */
function carried(messages: ModelMessage[]): ModelMessage[] {
  const last = Math.max(
    messages.findLastIndex((message) => message.role === "user"),
    0,
  );
  // What an earlier turn already made words of stays as it is. Made words of again, a reply
  // of two steps — each clipped, then joined as one message — was clipped once more as one,
  // which cut the answer it ended on, and changed a message two turns back under the
  // provider's cache. A reply still whole is one whose step is not yet a plain message
  const whole = messages.findIndex(
    (message, at) =>
      at < last &&
      (message.role === "tool" ||
        (message.role === "assistant" && typeof message.content !== "string")),
  );
  const reduced = whole < 0 ? last : whole;
  const kept = [
    ...messages.slice(0, reduced),
    ...asWords(
      messages.slice(reduced, last),
      (name, input) => toolLine(name, JSON.stringify(input ?? {})) ?? name,
      (text) =>
        text.length > REACH.oldChars
          ? `${text.slice(0, REACH.oldChars)}…`
          : text,
    ),
    ...messages.slice(last),
  ];
  if (kept.length <= REACH.messages) return kept;
  const from = kept.findIndex(
    (message, at) =>
      at >= kept.length - REACH.trimTo && message.role === "user",
  );
  return from > 0 ? kept.slice(from) : kept;
}

/**
 * The files her answer names go with it: a phone cannot open a path on this computer. A
 * page goes as pictures of it, since no chat opens one, and a page made to be read also as
 * a PDF of it, the whole page to keep or pass on (pictures), in one message where the
 * service takes them together. The newest REACH.files go; what does not — past that
 * count, past what the service or REACH.fileBytes takes, or refused on the way — is named in
 * the chat as still on this computer, and she is left the fact.
 */
async function sendFiles(live: Live, person: ReachPerson, text: string) {
  const { named, left } = await namedFiles(text);
  for (const path of named) {
    try {
      const out = await outgoingOf(live, path);
      if (!out) continue;
      if (out.files.length)
        await live.channel.sendFiles(person.chat, out.files);
      if (out.left) left.push(out.left);
    } catch (cause) {
      logger.warn(`reach ${live.name}: could not send ${path}`, cause);
      left.push({ name: path, why: reasonOf(cause) });
    }
  }
  if (!left.length) return;
  await live.channel
    .say(person.chat, { plain: notSent(left) })
    .catch((cause) =>
      logger.warn(`reach ${live.name}: could not say so`, cause),
    );
  leftBehind(live, left);
}

/**
 * Her words with the files they name attached, for a service whose one message carries both
 * (channel.ts `attaches`: a mail). Files go while together they fit what one message takes;
 * what does not is named under the words. When the service refuses the files, the words go
 * without them, and say why: an answer is never lost to what came with it. Throws only when
 * the words themselves did not go.
 */
async function sayAttached(
  live: Live,
  person: ReachPerson,
  words: ChatText,
  text: string,
  buttons?: Button[],
) {
  const { named, left } = await namedFiles(text);
  const most = Math.min(live.channel.limits.file, REACH.fileBytes);
  const files: OutgoingFile[] = [];
  const going: string[] = [];
  let bytes = 0;
  for (const path of named) {
    try {
      const out = await outgoingOf(live, path);
      if (!out) continue;
      const size = out.files.reduce((sum, file) => sum + file.bytes.length, 0);
      if (size && bytes + size > most) {
        left.push({
          name: path,
          why: `with the files before it, it passes the ${megabytes(most)} one ${REACH_LABEL[live.name]} message takes`,
        });
        continue;
      }
      if (size) going.push(path);
      files.push(...out.files);
      bytes += size;
      if (out.left) left.push(out.left);
    } catch (cause) {
      logger.warn(`reach ${live.name}: could not send ${path}`, cause);
      left.push({ name: path, why: reasonOf(cause) });
    }
  }
  const withLeft = (lost: Lost[]): ChatText =>
    !lost.length
      ? words
      : "plain" in words
        ? { plain: `${words.plain}\n\n${notSent(lost)}` }
        : { markdown: `${words.markdown}\n\n${literal(notSent(lost))}` };
  try {
    await live.channel.say(person.chat, withLeft(left), buttons, files);
  } catch (cause) {
    if (!files.length) throw cause;
    logger.warn(`reach ${live.name}: could not send with its files`, cause);
    left.push(...going.map((name) => ({ name, why: reasonOf(cause) })));
    await live.channel.say(person.chat, withLeft(left), buttons);
  }
  if (left.length) leftBehind(live, left);
}

/** The files her words name, the newest REACH.files of them, and the rest as left behind. */
async function namedFiles(
  text: string,
): Promise<{ named: string[]; left: Lost[] }> {
  const named = await filesOnDisk(pathsIn(text), null);
  return {
    named: named.slice(-REACH.files),
    left: named
      .slice(0, Math.max(named.length - REACH.files, 0))
      .map((path) => ({
        name: path,
        why: `only ${REACH.files} files go with one answer`,
      })),
  };
}

/**
 * What goes to the service for one file her words name, and why any of it stays on this
 * computer; null for a path that is not a file here.
 */
async function outgoingOf(
  live: Live,
  path: string,
): Promise<{ files: OutgoingFile[]; left: Lost | null } | null> {
  const full = await insideWorkspace(path);
  const info = full ? await stat(full).catch(() => null) : null;
  if (!full || !info) return null;
  const { limits } = live.channel;
  const most = Math.min(limits.file, REACH.fileBytes);
  const to = REACH_LABEL[live.name];
  // A page drawn for the phone goes as its pictures, never itself (D12): sent, the file
  // showed as code in the chat, and the pictures inside it never opened on a phone. Its
  // own size is then beside the point; its PDF's is what goes
  const pictures = await picturesOf(full);
  if (pictures.length) {
    const pdf = await pdfOf(full);
    const fits = pdf && pdf.bytes.length <= most;
    // A mail carries the pictures with the words, not above them
    const sent = live.channel.attaches
      ? "sent as pictures"
      : "sent as pictures above";
    return {
      files: fits ? [...pictures, pdf] : pictures,
      left: fits
        ? null
        : {
            name: path,
            why: pdf
              ? `${sent}; as a PDF it is ${megabytes(pdf.bytes.length)}, and the most that goes to ${to} is ${megabytes(most)}`
              : `${sent}; the page itself opens on the computer`,
          },
    };
  }
  if (info.size > most)
    return {
      files: [],
      left: {
        name: path,
        why: `it is ${megabytes(info.size)}, and the most that goes to ${to} is ${megabytes(most)}`,
      },
    };
  return {
    files: [
      {
        bytes: await readFile(full),
        name: path.split("/").pop() ?? "file",
        // One past what the service draws still goes, as a file
        picture: viewKindOf(path) === "image" && info.size <= limits.picture,
      },
    ],
    left: null,
  };
}

const notSent = (left: Lost[]) =>
  [
    "Not sent — still on this computer:",
    ...left.map(({ name, why }) => `• ${name}: ${why}`),
  ].join("\n");

/** She is left the fact of what stayed behind, as they were told it. */
function leftBehind(live: Live, left: Lost[]) {
  live.notes.push({
    text: `[Named in what went to their phone, and not sent: ${left.map(({ name, why }) => `${name} (${why})`).join("; ")}. They have been told.]`,
    said: false,
  });
}

/** The service open work goes to: where they last wrote from, else the first that has someone let in. */
async function whereTo(): Promise<{ live: Live; person: ReachPerson } | null> {
  const names = [
    ...(state.last ? [state.last] : []),
    ...REACH_CHANNELS.filter((name) => name !== state.last),
  ];
  for (const name of names) {
    const live = state.live.get(name);
    const person = live ? await readPerson(name) : null;
    if (live && person) return { live, person };
  }
  return null;
}

/** When this server came up. What changed before it had the server before it. */
const UP_SINCE = Date.now() - process.uptime() * 1000;

/** One look for a burst (REACH.lookMs): a working bot changes threads many times a second. */
function lookSoon(ms = REACH.lookMs) {
  state.looking ??= setTimeout(() => {
    state.looking = null;
    void look().catch((cause) => logger.error("reach: open work", cause));
  }, ms);
}

/**
 * One look at a time. Telling the phone waits on the network, and on a page being drawn: a
 * second look begun meanwhile reads the same open work and sends what the first has yet to
 * reach a second time. What changed during a look is read by one more, after it.
 */
async function look() {
  if (state.inLook) {
    state.lookAgain = true;
    return;
  }
  state.inLook = true;
  try {
    do {
      state.lookAgain = false;
      await lookForOpenWork();
    } while (state.lookAgain);
  } finally {
    state.inLook = false;
  }
}

/**
 * Open work — a question, or an ending nobody has seen — goes to the phone when the phone
 * is where it will be read. A thread started from a conversation here comes back to it,
 * whoever is watching; anything else comes only while no browser is (presence). Each item
 * is settled the first time it is looked at, so a browser that leaves later brings no
 * backlog with it — but for a question, which a bot is waiting on (offerLeftQuestions) —
 * and a restart brings none either (UP_SINCE). Progress never goes: a phone that buzzes for
 * every step is one that gets muted.
 */
async function lookForOpenWork() {
  // A tab that was open comes back within the grace presence gives one; until then
  // nobody watching is only nobody yet, and a restart would send the phone what it stopped
  const unknown = UP_SINCE + BROWSER_GONE_MS - Date.now();
  if (unknown > 0) return lookSoon(unknown);
  const anyone = await whereTo();
  if (!anyone) return;
  const threads = await listInboxThreads();
  const open = openWork(threads).filter((item) => item.kind !== "progress");
  const keys = new Set(open.map((item) => item.key));
  // Nothing is kept about what stopped waiting. Both are held for the life of the
  // process (pinned above), so a question answered on the computer would leave
  // its key and its buttons behind on every job, for as long as the server runs.
  for (const key of state.told.keys())
    if (!keys.has(key)) state.told.delete(key);
  for (const [data, choice] of state.choices)
    if (!keys.has(questionKey(choice.question))) state.choices.delete(data);

  const fresh = open.filter((item) => !state.told.has(item.key));
  if (!fresh.length) return;
  const started = await startedHere();
  for (const item of fresh) {
    const thread = threads.find((one) => one.id === item.threadId);
    if (!thread) continue;
    const from = started.get(item.threadId);
    const person = from ? await readPerson(from.name) : null;
    const to =
      from && person
        ? { live: from, person }
        : !presence.watching && toDate(thread.updatedAt).getTime() >= UP_SINCE
          ? anyone
          : null;
    state.told.set(item.key, { kind: item.kind, phone: Boolean(to) });
    if (to) await tell(to, item, thread);
  }
}

/**
 * The last browser left. A question it was left holding waits on someone who is no longer at
 * the screen, so it goes to the phone at the next look; what finished stays the screen's to
 * show, since a browser that leaves brings no backlog with it.
 */
function offerLeftQuestions() {
  for (const [key, told] of state.told)
    if (told.kind === "question" && !told.phone) state.told.delete(key);
  lookSoon(0);
}

/** The threads started from a conversation here, each with the service it was. */
async function startedHere(): Promise<Map<string, Live>> {
  const lives = [...state.live.values()];
  const jobs = await listCallJobs(lives.flatMap((live) => [...live.calls]));
  return new Map(
    jobs.flatMap((job) => {
      const live = lives.find((one) => one.calls.has(job.callId ?? ""));
      return live ? [[job.id, live] as const] : [];
    }),
  );
}

/**
 * One piece of open work, as the bot wrote it: whose it is and which thread, a line of
 * its own, then the words, its files after them. No turn of hers is spent on it — it is
 * already written — and she is left the fact, as she is when a question is answered on
 * screen. Delivered is seen: what reached their hands is not unread on the computer, and
 * that is what keeps it from being sent again.
 */
async function tell(
  to: { live: Live; person: ReachPerson },
  item: OpenWork,
  thread: Thread,
) {
  const { live, person } = to;
  // A question's own options answer the bot directly, without a turn of hers in between
  const question = thread.room.questions.find(
    (one) => questionKey(one.id) === item.key,
  );
  const buttons = (question?.options ?? []).map((option, at) => {
    const data = `${question?.id.slice(0, 40)}:${at}`;
    state.choices.set(data, {
      threadId: thread.id,
      bot: question?.bot ?? "",
      question: question?.id ?? "",
      answer: option,
    });
    return { text: option, data };
  });

  // Whose it is and which thread, as words, over what the bot wrote, in its own marks
  const words = {
    markdown: `${literal(`${item.show.line} · ${item.show.name}`)}\n\n${item.text || "…"}`,
  };
  try {
    if (live.channel.attaches)
      await sayAttached(live, person, words, item.text, buttons);
    else await live.channel.say(person.chat, words, buttons);
  } catch (cause) {
    // Still open, so the next look tries again
    logger.warn(`reach ${live.name}: could not tell ${item.key}`, cause);
    state.told.delete(item.key);
    return;
  }
  if (!live.channel.attaches) await sendFiles(live, person, item.text);
  live.notes.push({
    // With the time, in the prompt's own clock: a fact that waited a night reads as just now otherwise
    text: `${item.line}\n[The user has had this on their phone, as ${item.show.bot} wrote it, since ${clockNow()}.]`,
    said: false,
  });
  if (item.kind === "ending") await markSeen([item.threadId]);
  else await acceptRoomRelays(item.relayIds);
}

async function choose(
  live: Live,
  person: ReachPerson,
  data: string,
  under: Pressed | null,
) {
  const choice = state.choices.get(data);
  if (!choice) {
    await live.channel.say(person.chat, {
      plain: "That question is no longer open here. Write your answer instead.",
    });
    return;
  }
  for (const [key, one] of state.choices)
    if (one.question === choice.question) state.choices.delete(key);
  try {
    // The button knows its question: a bot with two open would otherwise take one answer for both
    await answerThread(
      choice.threadId,
      choice.answer,
      "user",
      choice.bot,
      choice.question || undefined,
    );
    if (under) await live.channel.settle(person.chat, under, choice.answer);
    // She is told, as she is when a question is answered on screen: a fact, not a turn
    live.notes.push({
      text: `[The user answered ${choice.bot}'s question from their phone at ${clockNow()}: ${choice.answer}. It has reached ${choice.bot}.]`,
      said: false,
    });
  } catch (cause) {
    await live.channel.say(person.chat, {
      plain: isPublicError(cause)
        ? cause.message
        : "That answer did not get through.",
    });
  }
}
