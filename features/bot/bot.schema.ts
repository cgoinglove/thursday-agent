import * as z from "zod";
import {
  COMMON_VALIDATE,
  MAX_PINNED_TOOLS,
  THREAD_LABEL_CHARS,
} from "@/config";
import {
  type Effort,
  effortSchema,
  type TextModelProviderId,
  textModelProviderSchema,
} from "@/features/ai/model.schema";
import type { FileVersion } from "@/features/workspace/workspace.schema";
import { DateLikeSchema } from "@/lib/date-like";
import { clip } from "@/lib/utils";
import {
  MARK_PAINT_IDS,
  MARK_SHAPES,
  MARK_SYSTEM,
  randomMarkFill,
} from "./mark.const";
import { ROOM_THURSDAY, RoomViewSchema } from "./room.schema";

/** How a bot's mark is drawn. Every field is optional; the seed alone gives every bot a distinct face. */
export const botIconSchema = z.object({
  /** A hex colour, or MARK_SYSTEM to follow the theme. Stored so a chosen "system" differs from no choice. */
  color: z
    .string()
    .regex(/^(#[0-9a-fA-F]{6}|currentColor)$/, "Hex color")
    .optional(),
  shape: z.enum(MARK_SHAPES).optional(),
  /** Draw as an outline instead of a fill. */
  outline: z.boolean().optional(),
  /** A paint (MARK_PAINTS) worn in place of the colour; the colour stays for when it comes off. */
  paint: z.enum(MARK_PAINT_IDS).optional(),
});

const botSystemPromptSchema = z.string().max(COMMON_VALIDATE.prompt.max);

/** A bot's own words after the user's description (`describe_self`), why it wrote them, and when (ms). */
export const ownLineSchema = z.object({
  line: z.string(),
  reason: z.string(),
  at: z.number(),
});

export type OwnLine = z.infer<typeof ownLineSchema>;

/**
 * The face a new bot starts with, until someone draws it: the whole vocabulary is
 * rolled, shape and paints included, so a face the app hands out and a face
 * somebody picked are drawn from the same range. A seed wears its own (bot.seed).
 */
export const randomBotIcon = (): BotIcon => ({
  ...randomMarkFill(),
  shape: MARK_SHAPES[Math.floor(Math.random() * MARK_SHAPES.length)],
});

/** Pinned tool as the screen sees it. */
const PinnedToolSchema = z.object({
  id: z.number(),
  name: z.string(),
  serverName: z.string(),
});

/**
 * The name is the identity; there is no id. Whitespace collapses to single
 * spaces because the name travels through speech and transcripts.
 */
const botNameSchema = z
  .string()
  .trim()
  .transform((name) => name.replace(/\s+/g, " "))
  .refine(
    (name) => name.toLowerCase() !== ROOM_THURSDAY.toLowerCase(),
    "Thursday is reserved for the voice assistant.",
  )
  .pipe(z.string().min(1, "A name is required").max(COMMON_VALIDATE.name.max));

/** Tokens burned. Input and output stay apart because output costs about ten times more. */
const TokenUsageSchema = z.object({
  input: z.number(),
  output: z.number(),
});

export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/**
 * One step's usage as a thread adds it up: `cacheRead` and `cacheWrite` are the part of
 * `input` the provider read from its prompt cache or wrote to it, 0 where it says nothing.
 */
export type StepUsage = TokenUsage & { cacheRead: number; cacheWrite: number };

/** A budget under this leaves no room for the opening message, so it is refused rather than stored. */
export const COMPACT_AT_MIN = 8_000;

const BotSchema = z.object({
  name: z.string(),
  description: z.string(),
  /** The bot may not write its own line (botTable). */
  descriptionLocked: z.boolean(),
  /** The bot's words after the description; null until it writes some. */
  ownLine: ownLineSchema.nullish(),
  systemPrompt: z.string().nullish(),
  icon: botIconSchema.nullish(),
  /** Set only when chosen; empty runs on the app default model. */
  provider: textModelProviderSchema.nullish(),
  model: z.string().nullish(),
  /** Where this bot's runs compact; empty derives it from the model's own window. */
  compactAt: z.number().nullish(),
  /** How hard it thinks; empty takes the app default (Settings > Models). */
  effort: effortSchema.nullish(),
  /** Switched off by the user: kept whole, shown to no model. */
  disabled: z.boolean(),
  createdAt: DateLikeSchema,
  tools: PinnedToolSchema.array().default([]),
  /** Sum over every job this bot ran; deleted jobs drop out. */
  tokens: TokenUsageSchema,
  /** When this bot's latest job last moved; null if it never ran. Carried here so the roster need not page through history. */
  lastJobAt: DateLikeSchema.nullish(),
});

export const BotFormSchema = z.object({
  name: botNameSchema,
  description: z
    .string()
    .trim()
    .min(1, "Say what this bot is for")
    .max(COMMON_VALIDATE.description.max),
  systemPrompt: botSystemPromptSchema.optional(),
  icon: botIconSchema.optional(),
  /** Unset by default (runs on the app default). A half pick is emptied, see `pickedModel`. */
  provider: textModelProviderSchema.nullish(),
  model: z.string().trim().max(80).nullish(),
  /** Empty derives it from the model; a number overrides. Below the floor a run cannot start. */
  compactAt: z.coerce
    .number()
    .int()
    .min(COMPACT_AT_MIN, `At least ${COMPACT_AT_MIN / 1000}k`)
    .nullish(),
  /** Empty takes the app default; a step the model's ladder does not hold is dropped at the run (ai/model runEffort). */
  effort: effortSchema.nullish(),
  disabled: z.boolean().optional(),
  descriptionLocked: z.boolean().optional(),
  /**
   * Replaces the pinned set when sent. No default: `.partial()` keeps one, and every save
   * on the bot's page that was not about tools emptied the set.
   */
  toolIds: z.number().int().array().max(MAX_PINNED_TOOLS).optional(),
});

/**
 * Treats a half pick (provider or model alone) as no model. A function, not a
 * schema transform, because `BotFormSchema.partial()` is used elsewhere. Called
 * once at the write in bot.query.
 */
export const pickedModel = <T extends { provider?: unknown; model?: unknown }>(
  form: T,
): T & { provider: TextModelProviderId | null; model: string | null } => {
  const provider = (form.provider ?? null) as TextModelProviderId | null;
  const model = typeof form.model === "string" ? form.model.trim() : null;
  return provider && model
    ? { ...form, provider, model }
    : { ...form, provider: null, model: null };
};

export type BotIcon = z.infer<typeof botIconSchema>;
export type PinnedTool = z.infer<typeof PinnedToolSchema>;
export type Bot = z.infer<typeof BotSchema>;
export type BotForm = z.infer<typeof BotFormSchema>;

/** A bot as a job sees it. Not the row: DEFAULT_BOT has none, and pinned tools are reached through the prompt. */
export type JobBot = {
  name: string;
  description: string;
  /** The bot's own words after the description (`describe_self`); read through `rosterLine`. */
  ownLine: string | null;
  systemPrompt: string | null;
  icon: BotIcon | null;
  /** null means whatever key is configured; only the default bot. */
  provider: TextModelProviderId | null;
  model: string | null;
  /** Carried so a run that already has this bot can say so; `listJobBots` never returns a disabled one. */
  disabled: boolean;
  /** Where its runs compact; null derives it from the model (ai/model compactBudget). */
  compactAt: number | null;
  /** How hard it thinks; null takes the app default (ai/model runEffort). */
  effort: Effort | null;
};

/**
 * Worker that exists when no bot row does, so a fresh install can delegate.
 * Has no prompt: the base persona (ai/prompts/bot.prompt) says everything it needs.
 * The Jarvis seed takes the same name on purpose (bot.seed): installed, its row
 * stands in for the fallback, and carries this same face, so the worker a fresh
 * install already delegates to does not change colour on becoming a row. The face
 * is the theme's own ink: a bot nobody chose wears no colour that says who it is.
 */
export const DEFAULT_BOT_ICON: BotIcon = {
  color: MARK_SYSTEM,
  shape: "blob",
};

export const DEFAULT_BOT: JobBot = {
  name: "Jarvis",
  description: "Anything — this computer, a browser, the web, files, services",
  ownLine: null,
  systemPrompt: null,
  icon: DEFAULT_BOT_ICON,
  provider: null,
  model: null,
  disabled: false,
  compactAt: null,
  effort: null,
};

/**
 * The line a bot is listed and picked by: the user's description, then the bot's own words
 * after it as the next sentence. Every roster and the bot's own prompt read it from here, so
 * the two halves never read apart.
 */
export function rosterLine(bot: Pick<JobBot, "description" | "ownLine">) {
  const said = bot.description.trim();
  if (!bot.ownLine) return said;
  return `${said}${/[.!?。…]$/.test(said) ? "" : "."} ${bot.ownLine}`;
}

/**
 * A job handed over from the screen is named by the user's own words, on one line, up to
 * `THREAD_LABEL_CHARS`: cut at the last space in the second half, else where the count ends
 * (a script written without spaces). The bot reads the request in full either way.
 */
export function labelOfWords(words: string): string {
  const said = words.replace(/\s+/g, " ").trim();
  if (said.length <= THREAD_LABEL_CHARS) return said;
  const cut = said.slice(0, THREAD_LABEL_CHARS - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > cut.length / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

// A bot's own memory (features/bot/bot.memory): the setting behind it. The files
// are per bot; whether any bot is shown its own is not.

/** Config key (features/config config.query) the switch lives under. */
export const BOT_MEMORY_KEY = "BOT_MEMORY";

/** On unless it was switched off. Off, no prompt lists a bot's memory; the files stay. */
export const isBotMemoryOn = (value: string | undefined) =>
  value?.trim() !== "off";

/** One file of a bot's own memory (bot.memory), as its prompt lists it and its page draws it. */
const BotMemoryFileSchema = z.object({
  file: z.string(),
  /** Workspace-relative, for reading or deleting it the way Workspace does. */
  path: z.string(),
  /** The line it is listed by; empty for a file with nothing in it. */
  line: z.string(),
  at: DateLikeSchema,
  bytes: z.number(),
});
export type BotMemoryFile = z.infer<typeof BotMemoryFileSchema>;

export type BotMemory = {
  /** Workspace-relative: `bots/<name>/memory`. */
  folder: string;
  /** Newest first, as many as the reader asked for. */
  entries: BotMemoryFile[];
  /** Every file in the folder, listed or not. */
  total: number;
};

/** What a bot keeps for itself: a file of its memory, or a skill of its own. */
export type LessonKind = "memory" | "skill";

/**
 * Files of one thing a bot keeps, by workspace path: their text, and every path the thing holds
 * that is not text the app keeps (a picture, a file past BOT_LESSON.fileChars). Held whole while
 * a command runs; a lesson keeps only the files its job changed (lesson.query changeOf).
 */
export type KeptFiles = { files: Record<string, string>; unheld: string[] };

/**
 * One thing a bot kept for itself while it worked, as the screen shows it (bot.lesson): what
 * changed, in which job, and whether it was put back.
 */
export type BotLesson = {
  id: number;
  bot: string;
  /** The job it was kept in, which may since be cleared; its label still says which. */
  threadId: string | null;
  threadLabel: string;
  kind: LessonKind;
  /** The memory file's name, or the skill's folder. */
  name: string;
  /** What it is about: a memory file's first line, a skill's description. */
  line: string;
  /** What it did: wrote it new, changed it, or removed it. */
  change: "added" | "changed" | "removed";
  /** Lines added and taken out, over the text files it holds. */
  added: number;
  removed: number;
  /** What the job left of each file it changed (what it removed, when it removed it), clipped. */
  text: string;
  at: Date;
  undoneAt: Date | null;
};

/**
 * What a thread opened by a routine is told about it (features/routine): which one, when
 * it starts, and how its last run ended, so "since last time" means something.
 */
export type ThreadRoutine = {
  id: string;
  /** "Daily 09:00 · Mon–Fri" (routine.schema scheduleText). */
  when: string;
  last: { at: Date; said: string } | null;
  /** Why a watched routine opened this run (routine.clock): what its watch printed now and before, or how it failed. */
  watch?:
    | { command: string; now: string; before: string | null }
    | { command: string; failed: string }
    | null;
};

/** One of a bot's other threads, as its own prompt lists it (thread.query listBotWork). */
export type BotWorkLine = {
  /** The thread. Its first characters are the handle a cut line shows (`workHandle`). */
  id: string;
  /** The exchange `said` ended; what the bot was asked there hangs off it (thread.query readBotAsk). */
  workId: string | null;
  label: string;
  /** Who coordinates that thread: the bot itself, or the one it was called in by. */
  owner: string;
  status: ThreadStatus;
  /** Waiting on the user's answer rather than on Continue. */
  asking: boolean;
  updatedAt: Date;
  /** The bot's own last ending there; null when it has ended no turn in words. */
  said: string | null;
  /** `said` runs past what a line carries (config BOT_WORK.said), so there is more to open. */
  cut: boolean;
};

/** How a thread is named on a line and to the tool that opens it: enough of its id to tell ten apart. */
export const workHandle = (id: string) => id.slice(0, 6);

/**
 * `waiting`: a bot asked the user something, or the app stopped the work; the
 * answer resumes the same thread. `cancelled`: the user stopped it, or the app ended
 * a routine's run it had to stop, whose outcome then says why (room.query
 * `endStopped`). A model that breaks pauses any other job as `waiting` rather than
 * ending it. `done` and `cancelled` can be picked back up with a follow-up.
 */
const THREAD_STATUSES = ["running", "waiting", "done", "cancelled"] as const;

export type ThreadStatus = (typeof THREAD_STATUSES)[number];

/** The single option offered when the app stopped a job and asks whether to go on. Button text and spoken word alike. */
export const THREAD_CONTINUE = "Continue";

/**
 * Who a person's words to a job came from (bot.runner answerThread). Thursday
 * passing something on from a call and the user typing on screen reach a bot
 * down one pipe, so the words carry it in front of them.
 */
export type ThreadSpeaker = "thursday" | "user";

const SPEAKER_TAGS: Record<ThreadSpeaker, string> = {
  thursday: "Thursday, on the call:",
  user: "The user, on screen:",
};

export const tagSpeaker = (from: ThreadSpeaker, text: string): string =>
  `${SPEAKER_TAGS[from]} ${text}`;

/** Whose words these are, read off the tag they were stored under; null for untagged words. */
export const speakerOf = (text: string): ThreadSpeaker | null =>
  (Object.keys(SPEAKER_TAGS) as ThreadSpeaker[]).find((from) =>
    text.startsWith(`${SPEAKER_TAGS[from]} `),
  ) ?? null;

/** The words without their tag, as the screen draws a person's line (thread.query linesOf). */
export const untagSpeaker = (text: string): string => {
  const from = speakerOf(text);
  return from ? text.slice(SPEAKER_TAGS[from].length + 1) : text;
};

/**
 * What a waiting thread waits on: a bot's question (`messageId`, the asker `bot`)
 * or a stop the app made, which offers only Continue.
 */
export type ThreadPending = {
  options: string[];
  messageId?: string;
  bot?: string;
  /** A stop the app made because the provider turned down the key or sign-in the run was on. */
  refused?: TextModelProviderId;
};

/**
 * True when the app stopped the job (step cap, restart, idle room)
 * rather than a bot asking something. Why it stopped is in the outcome text; every
 * list calls it waiting on you, because the answer is the same click. A question
 * carries its message id, so a bot offering Continue as a choice is still asking.
 */
export const isAppStop = (
  ask: { options: string[]; messageId?: string } | null | undefined,
) => {
  const options = ask?.options ?? [];
  return (
    !ask?.messageId && options.length === 1 && options[0] === THREAD_CONTINUE
  );
};

/** A thread as a note about a file names it (thread.file); `bot` coordinates it. */
type ThreadRef = { id: string; label: string; bot: string };

export type FileThread =
  /** The file is not on disk any more. */
  | { state: "gone" }
  /**
   * No thread has it: none that is there reported it, or the one it was opened from was deleted
   * (`threadDeleted`). `bot` is the one whose folder holds it, to hand it to anew.
   */
  | { state: "none"; bot: string | null; threadDeleted: boolean }
  /** A bot in it waits on the user's answer: a note now would be taken as that answer. */
  | { state: "asking"; thread: ThreadRef; bot: string; question: string }
  /** Nobody could act on it: its bot was deleted, or the model it runs on cannot be reached. */
  | {
      state: "refused";
      thread: ThreadRef;
      reason: "deleted" | "model";
      why: string;
    }
  | {
      state: "open";
      thread: ThreadRef;
      status: ThreadStatus;
      /** Who reads the note: the bot whose folder holds the file when it is in the thread, else the coordinator. */
      to: string;
      coordinator: string;
      /** Why the app stopped it, when it did; the note takes it up again. */
      paused: string | null;
    };

/** A file open on screen, as the note under it reads it (app/api/bot/thread/file). */
export type FileNote = { file: FileVersion | null; note: FileThread };

/** One piece of a tool result as the screen draws it. Full output stays in the stored messages. */
const ResultPartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  /** data: or http(s) url usable in an <img>. */
  z.object({ type: z.literal("image"), src: z.string() }),
]);

export type ResultPart = z.infer<typeof ResultPartSchema>;

/** One thread line as the screen sees it. `bot` is null on the user side; `parent` is the exchange (thread_work) it was written under. */
const LineBase = z.object({
  /** Row id plus part index; one message may hold several lines. */
  id: z.string(),
  seq: z.number(),
  bot: z.string().nullable(),
  parent: z.string().nullable(),
  to: z.string().nullish(),
  at: DateLikeSchema,
});

const ThreadLineSchema = z.discriminatedUnion("kind", [
  /** What the user said (via Thursday): request, answer. */
  LineBase.extend({
    kind: z.literal("user"),
    text: z.string(),
    /** Who wrote them: the user on screen, or Thursday passing them on; null before tags. */
    by: z.enum(["thursday", "user"]).nullable(),
  }),
  /** Bot text; the last one is the answer. */
  LineBase.extend({ kind: z.literal("text"), text: z.string() }),
  /** Compaction summary (bot.run compact). The model resumes from here; the screen draws it as a divider. */
  LineBase.extend({ kind: z.literal("note"), text: z.string() }),
  /** Why the app stopped the run (room.query pauseRoom, or a break the runner retries), without what the resumed run is told to check. */
  LineBase.extend({ kind: z.literal("stop"), text: z.string() }),
  LineBase.extend({
    kind: z.literal("tool"),
    callId: z.string(),
    name: z.string(),
    /** Argument worth showing (query, command, path), clipped to one line. */
    input: z.string(),
    /** Model-written label (bash `description`). */
    note: z.string().nullish(),
    /** Unclipped path a file tool received; the screen's "Open" uses it because `input` may be truncated. */
    path: z.string().nullish(),
  }),
  LineBase.extend({
    kind: z.literal("tool-result"),
    callId: z.string(),
    name: z.string(),
    /** A glance: a few text lines, each clipped. The whole output is behind `queryKey.toolResult`. */
    results: ResultPartSchema.array(),
    /** The output holds more than the glance: more lines, a clipped line, or an image. */
    more: z.boolean(),
  }),
  /** A message sent to another participant or to Thursday (send_message); `question` asks the user. */
  LineBase.extend({
    kind: z.literal("ask"),
    callId: z.string(),
    to: z.string(),
    text: z.string(),
    question: z.boolean().optional(),
    /** The room question it opened (room.query messageKey), for a question to Thursday. */
    questionId: z.string().optional(),
    /** The exchange a send opens (room.query messageKey): the recipient's lines written for it carry it as `parent`. */
    exchange: z.string().optional(),
    /** The bots whose answers it waits for (send_message `after`); it is held until they are back and read. */
    after: z.array(z.string()).optional(),
  }),
]);

export type ThreadLine = z.infer<typeof ThreadLineSchema>;

/** One line of where a job is: the bot's last text plus the tool it reached for after. Stops at a user-side line. */
export function threadActivity(lines: ThreadLine[], max = 120): string | null {
  let doing: string | null = null;
  for (let at = lines.length - 1; at >= 0; at--) {
    const line = lines[at];
    if (line.kind === "tool") {
      doing ??= `${line.name} ${line.note ?? line.input}`;
    } else if (line.kind === "text") {
      return clip(doing ? `${line.text} → ${doing}` : line.text, max);
    } else if (line.kind === "ask") {
      return clip(`asked ${line.to}: ${line.text}`, max);
    } else if (line.kind === "user") {
      break;
    }
  }
  return doing ? clip(doing, max) : null;
}

/**
 * What a `waiting` thread asks: question from the row's `outcome`, options from
 * `pending`.
 */
const ThreadAskSchema = z.object({
  question: z.string(),
  messageId: z.string().optional(),
  bot: z.string().optional(),
  options: z.string().array(),
  /** The provider that turned down the key or sign-in the run was on (ThreadPending `refused`). */
  refused: textModelProviderSchema.optional(),
});

export type ThreadAsk = z.infer<typeof ThreadAskSchema>;

/** Thread as the screen and voice tools see it. */
const ThreadSchema = z.object({
  id: z.string(),
  bot: z.string(),
  label: z.string(),
  request: z.string(),
  status: z.enum(THREAD_STATUSES),
  outcome: z.string().nullable(),
  /** Set only while `waiting`. */
  ask: ThreadAskSchema.nullable(),
  /**
   * Whether the user has had the ending: they opened the thread, or Thursday marked
   * it once she had told them (`thread` `seen`). A cancel is seen by whoever
   * cancelled. A highlight and a count, never a filter.
   */
  seen: z.boolean(),
  /** The routine that opened it (features/routine); null for a job a person or a bot started. */
  routineId: z.string().nullable(),
  /** Who handed it over (`thread` `startedBy`); null for a routine's run and older jobs. */
  startedBy: z.enum(["thursday", "user"]).nullable(),
  /** Burned so far, across every participant. */
  tokens: TokenUsageSchema,
  /** Context size the model read on the last step (not a sum) and the compaction threshold (BOT_RUN.compactAt). 0 means no step ran yet. */
  contextTokens: z.number(),
  contextBudget: z.number(),
  createdAt: DateLikeSchema,
  updatedAt: DateLikeSchema,
  /** Lines to draw; the model's messages stay on the server. */
  lines: ThreadLineSchema.array(),
  room: RoomViewSchema,
});

export type Thread = z.infer<typeof ThreadSchema>;

/**
 * Which side of the screen a job stands on, and the one place that decides it. The left corner
 * holds what is over, the room's list holds everything else, and every count comes from here —
 * so a number and the list under it can never say different things.
 *
 * A job that has ended is over, whatever its room still holds: a question row left open on an
 * ended thread is dead, not owed (`thread.query closeEndedQuestions` closes those at boot). A
 * participant can ask while other participants keep working, so a question outranks the thread's
 * own status.
 */
export type ThreadStand = "finished" | "needsYou" | "working";

export const standOf = (thread: {
  status: string;
  room: Thread["room"];
}): ThreadStand => {
  if (thread.status === "done" || thread.status === "cancelled")
    return "finished";
  if (thread.status === "waiting" || thread.room.questions.length > 0)
    return "needsYou";
  return "working";
};

export const needsThreadReply = (thread: {
  status: string;
  room: Thread["room"];
}) => standOf(thread) === "needsYou";

/**
 * An ending nobody has opened. It needs the user too, to read rather than to
 * answer. Takes the two fields it reads, as `needsThreadReply` does, so a
 * stored row answers it as well as a drawn one.
 */
export const isUnread = (thread: { status: string; seen: boolean }) =>
  thread.status === "done" && !thread.seen;
