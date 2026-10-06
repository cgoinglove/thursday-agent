import type { ModelMessage } from "ai";
import { sql } from "drizzle-orm";
import {
  index,
  primaryKey,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { int, text } from "drizzle-orm/sqlite-core/columns";
import { sqliteTable } from "drizzle-orm/sqlite-core/table";
import * as z from "zod";
import type { Effort, TextModelProviderId } from "@/features/ai/model.schema";
import {
  botIconSchema,
  type KeptFiles,
  type LessonKind,
  type OwnLine,
  type ThreadPending,
  type ThreadSpeaker,
  type ThreadStatus,
} from "@/features/bot/bot.schema";
import type { RelayKind, WorkState } from "@/features/bot/room.schema";
import {
  MCPServerConfig,
  MCPStoredOAuth,
  MCPToolInfo,
} from "@/features/connectors/mcp.schema";
import type { MemorySource } from "@/features/memory/memory.schema";
import type { RoutineSchedule } from "@/features/routine/routine.schema";
import type { CallTurn } from "@/features/thursday/thursday.schema";

/** Workers that background jobs are delegated to. */
export const botTable = sqliteTable("bot", {
  /** The name is the identity: spoken aloud and typed back into `delegate`. */
  name: text("name").primaryKey(),
  /** One line, shown in lists and in the prompt's Bots section. */
  description: text("description").notNull(),
  /**
   * The user keeps the bot's line as it stands: its `describe_self` is left out of its tools.
   * Off at first, so a bot can say what it has come to do once that has changed.
   */
  descriptionLocked: int("description_locked", { mode: "boolean" })
    .notNull()
    .default(false),
  /**
   * The bot's own words, read after the description wherever it is listed (bot.schema
   * rosterLine), with why it wrote them. The description is the user's alone; this is the
   * bot's alone, and the user can only clear it. Null until the bot writes one.
   */
  ownLine: text("own_line", { mode: "json" }).$type<OwnLine>(),
  /** Appended after the base persona, never replacing it. null means generalist. */
  systemPrompt: text("system_prompt"),
  icon: text("icon", {
    mode: "json",
  }).$type<z.infer<typeof botIconSchema>>(),
  /** Both null unless a model was explicitly picked; runs then use the app default. */
  provider: text("provider").$type<TextModelProviderId>(),
  model: text("model"),
  /**
   * Context size in tokens at which this bot's runs summarize themselves. Null is
   * the usual answer: the run reads the model's own window instead (ai/model
   * `compactBudget`), and falls back to a constant only where that is unknowable.
   */
  compactAt: int("compact_at"),
  /**
   * How hard this bot thinks, as one step of the app's ladder (ai/model.schema `EFFORTS`).
   * Null is the usual answer: the run takes the app default instead (ai/model `runEffort`),
   * and sets nothing at all where the model's ladder is unknown.
   */
  effort: text("effort").$type<Effort>(),
  /**
   * Switched off: the row stays whole and nothing is thrown away, but no model
   * is ever shown this bot (bot.query listJobBots). Jobs it already has still
   * run and resume — a job that is under way is not a bot the agent may pick.
   */
  disabled: int("disabled", { mode: "boolean" }).notNull().default(false),
  createdAt: int("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** One row per registered MCP server. Its tools live in mcp_tool. */
export const mcpServerTable = sqliteTable("mcp_server", {
  /** Also the prefix of every tool name shown to the model. */
  name: text("name").primaryKey(),
  /**
   * How to connect: remote (`url`) or stdio (`command`), told apart by shape. The values of its
   * headers and env are credentials, sealed (mcp.query sealConfig).
   */
  config: text("config", {
    mode: "json",
  })
    .notNull()
    .$type<MCPServerConfig>(),
  /** When mcp_tool was last synced for this server. */
  toolsSyncedAt: int("tools_synced_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  /** Why the last connect failed; null when it succeeded. */
  lastError: text("last_error"),
  // Server-only: list queries must never select this column. Its credentials are sealed, its
  // `state` is not (mcp.schema MCPStoredOAuth).
  oauth: text("oauth", { mode: "json" }).$type<MCPStoredOAuth>(),
  createdAt: int("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * One row per tool a server reported. Exists so bots can pin tools by id;
 * deleting the server cascades to its tools and their pins. Sync must upsert
 * on (server_name, name), not delete-and-insert, or every pin silently vanishes.
 */
export const mcpToolTable = sqliteTable(
  "mcp_tool",
  {
    /** Surrogate key that pins point at; sync must preserve it. */
    id: int("id").primaryKey({ autoIncrement: true }),
    serverName: text("server_name")
      .notNull()
      .references(() => mcpServerTable.name, { onDelete: "cascade" }),
    /** The server's own tool name; the model sees it prefixed with the server name. */
    name: text("name").notNull(),
    description: text("description"),
    /** Stored loose: parsing with a known-key schema strips unknown keys to `{}`. */
    inputSchema: text("input_schema", { mode: "json" }).$type<
      MCPToolInfo["inputSchema"]
    >(),
    outputSchema: text("output_schema", { mode: "json" }).$type<
      MCPToolInfo["outputSchema"]
    >(),
  },
  (t) => [
    // Also serves "all tools of this server" lookups (server_name is leftmost).
    unique("uq_mcp_tool_server_name").on(t.serverName, t.name),
  ],
);

/** MCP tools a bot has pinned ahead of tool search. Only MCP tools are pinnable. */
export const botMcpToolTable = sqliteTable(
  "bot_mcp_tool",
  {
    botName: text()
      .notNull()
      .references(() => botTable.name, { onDelete: "cascade" }),
    toolId: int("tool_id")
      .notNull()
      .references(() => mcpToolTable.id, { onDelete: "cascade" }),
  },
  // The row itself is the pin; both columns form the key.
  (t) => [primaryKey({ columns: [t.botName, t.toolId] })],
);

/**
 * A job handed to a bot. Outlives the call that opened it. Two independent
 * axes: `status` is where the job is, `seen` is whether the user has had the ending.
 */
export const threadTable = sqliteTable(
  "thread",
  {
    /** uuid; the spoken and shown identifier is `label`. */
    id: text("id").primaryKey(),
    /** Bot name, deliberately not a foreign key: the default bot has no row, and a deleted bot's jobs stay. */
    bot: text("bot").notNull(),
    /**
     * Its name, for the screen and for speech: the few words `delegate` or a routine gives it, or
     * the user's own words when handed over from the screen (bot.schema labelOfWords).
     */
    label: text("label").notNull(),
    /** The full briefing; first user message of the thread, reused on resume. */
    request: text("request").notNull(),
    /**
     * running | waiting (question, idle or paused) | done | cancelled.
     * A done job goes back to running when it gets a follow-up answer.
     */
    status: text("status").notNull().$type<ThreadStatus>(),
    /** A user message or resume opens a new reporting epoch. */
    generation: int("generation").notNull().default(0),
    /** Automatic turns consumed since the last user message or resume. */
    turns: int("turns").notNull().default(0),
    /** Whether the current activity has already received one owner wrap-up. */
    wrapped: int("wrapped", { mode: "boolean" }).notNull().default(false),
    /** Last message, or the pending question. */
    outcome: text("outcome"),
    /**
     * While `waiting`: what it waits on (bot.schema ThreadPending) — a bot's question,
     * named by `messageId`, or a stop the app made; null once it runs again.
     */
    pending: text("pending", { mode: "json" }).$type<ThreadPending>(),
    /**
     * Whether the user has had the ending: opened on screen, or marked by Thursday once
     * told (`thread` `seen`). Highlight and badge only; the inbox selects by status.
     */
    seen: int("seen", { mode: "boolean" }).notNull().default(false),
    /** The call that opened the job; null when started from the screen. A later call's prompt finds the job under it. */
    callId: text("call_id"),
    /**
     * Who handed the job over: the user on screen, or Thursday. Null for a routine's run
     * and for a job from before it was kept; the screen draws those as hers.
     */
    startedBy: text("started_by").$type<ThreadSpeaker>(),
    /**
     * The routine that opened the job; null for one a person or a bot started. Not a foreign
     * key: a run outlives the routine it came from, the way a job outlives its bot.
     */
    routineId: text("routine_id"),
    /** Running totals across every participant; added per step. */
    inputTokens: int("input_tokens").notNull().default(0),
    outputTokens: int("output_tokens").notNull().default(0),
    /**
     * The part of `inputTokens` the provider read from its prompt cache, and the part it
     * wrote there; each billed apart from the rest of the input. Added per step, 0 where
     * the provider says nothing and on steps from before these were kept.
     */
    cacheReadTokens: int("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: int("cache_write_tokens").notNull().default(0),
    /** Context size of the last step, not a total; overwritten every step. */
    contextTokens: int("context_tokens").notNull().default(0),
    /**
     * Where the coordinator compacts, written at every step so the screen can draw the
     * meter without config. Display only: a context refused as too long lowers the
     * participant's own number (thread_work `context_budget`).
     */
    contextBudget: int("context_budget").notNull().default(0),
    createdAt: int("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    /** Every list sorts by this, descending. */
    updatedAt: int("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    /** Set on done/cancelled; reset to null on waiting. */
    endedAt: int("ended_at", { mode: "timestamp" }),
  },
  (t) => [
    // A routine's runs, newest first (routine.query)
    index("idx_thread_routine").on(t.routineId, t.createdAt),
    // Every list of jobs picks by status and sorts by this: the call's inbox, the
    // history, what is still running, and the hourly file sweep (thread.query).
    // Without it each one reads every row a user has ever made.
    index("idx_thread_status_updated").on(t.status, t.updatedAt),
  ],
);

/**
 * A thread's messages, one ModelMessage per row. Read back as the model's own
 * history on resume, and drawn by the screen from the same rows.
 */
export const threadMessageTable = sqliteTable(
  "thread_message",
  {
    /** Surrogate key; ordering is `seq`. */
    id: int("id").primaryKey({ autoIncrement: true }),
    threadId: text("thread_id")
      .notNull()
      .references(() => threadTable.id, { onDelete: "cascade" }),
    /**
     * Position in the thread, assigned before content exists: a step is written
     * while streaming and again when it ends, and participants interleave in the
     * same thread.
     */
    seq: int("seq").notNull(),
    /** Bot that produced the message; null is the user side (request, answers). */
    bot: text("bot"),
    /** The exchange (thread_work id) the message was written under; null only on the opening. */
    parent: text("parent"),
    /** Incoming bot messages are already visible at their sender. */
    hidden: int("hidden", { mode: "boolean" }).notNull().default(false),
    role: text("role").notNull().$type<ModelMessage["role"]>(),
    /** ModelMessage content as-is, tool calls and results included. */
    content: text("content", { mode: "json" })
      .notNull()
      .$type<ModelMessage["content"]>(),
    /** A compaction summary (user row). Resume reads from the last one (room.query listParticipantTranscript). */
    compact: int("compact", { mode: "boolean" }).notNull().default(false),
    /**
     * The app speaking rather than anyone in the room: why a run stopped, and
     * the compaction marker. Separate from `compact`, which says where a resume
     * starts — how a row reads and where a resume begins are two facts, and a
     * break row marked `compact` would throw the history away on the next run.
     */
    note: int("note", { mode: "boolean" }).notNull().default(false),
    /** Informational; ordering is `seq`. */
    createdAt: int("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  // Streaming and end-of-step writes upsert on this key.
  (t) => [unique("uq_thread_message_seq").on(t.threadId, t.seq)],
);

/** One conversation continuation. All continuations for a bot share its thread history. */
export const threadWorkTable = sqliteTable(
  "thread_work",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => threadTable.id, { onDelete: "cascade" }),
    bot: text("bot").notNull(),
    caller: text("caller").notNull(),
    /** The continuation a natural reply wakes; not the participant's identity. */
    parentId: text("parent_id"),
    state: text("state").notNull().$type<WorkState>(),
    generation: int("generation").notNull().default(0),
    /** A provider overflow lowers this participant's future compaction threshold. */
    contextBudget: int("context_budget").notNull().default(0),
    result: text("result"),
    options: text("options", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    /**
     * Bots whose answers this exchange waits on (`send_message` `after`): it stays `waiting`,
     * its words unread, until each of them is back, then goes out with their answers.
     */
    waitsFor: text("waits_for", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    createdAt: int("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_thread_work_queue").on(t.threadId, t.state, t.createdAt),
    index("idx_thread_work_parent").on(t.parentId),
    uniqueIndex("uq_thread_work_running_bot")
      .on(t.threadId, t.bot)
      .where(sql`${t.state} = 'running'`),
  ],
);

/** Durable inbox; insertion into a participant's transcript is transactional. */
export const threadDeliveryTable = sqliteTable(
  "thread_delivery",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    key: text("key").notNull().unique(),
    threadId: text("thread_id")
      .notNull()
      .references(() => threadTable.id, { onDelete: "cascade" }),
    workId: text("work_id")
      .notNull()
      .references(() => threadWorkTable.id, { onDelete: "cascade" }),
    speaker: text("speaker").notNull(),
    text: text("text").notNull(),
    visible: int("visible", { mode: "boolean" }).notNull().default(false),
    consumed: int("consumed", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("idx_thread_delivery_inbox").on(t.workId, t.consumed, t.id)],
);

/** Durable facts for Thursday; reading the thread is separate from relaying it. */
export const threadRelayTable = sqliteTable("thread_relay", {
  id: int("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  threadId: text("thread_id")
    .notNull()
    .references(() => threadTable.id, { onDelete: "cascade" }),
  bot: text("bot").notNull(),
  text: text("text").notNull(),
  kind: text("kind").notNull().$type<RelayKind>(),
  messageId: text("message_id"),
  accepted: int("accepted", { mode: "boolean" }).notNull().default(false),
});

/**
 * One row per call; turns are in call_message. The browser holds the
 * transcript and sends each turn as it is confirmed; audio never reaches the server.
 */
export const callTable = sqliteTable("call", {
  id: text("id").primaryKey(),
  /** Recorded per call, since settings and fallbacks change between calls. */
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  /** The Responses model that held the tools. Null on rows written before Live. */
  backendModel: text("backend_model"),
  startedAt: int("started_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  /**
   * What the provider said when the session closed, and the active seconds it
   * billed. Null when the confirmation never arrived — a call is charged by
   * active time, so "unknown" is a fact worth telling apart from zero.
   */
  endedReason: text("ended_reason"),
  seconds: int("seconds"),
  /**
   * null while open, or when nobody recorded the hangup (tab vanished).
   * Decides whether a finished job notifies the call or the desktop (bot.runner).
   */
  endedAt: int("ended_at", { mode: "timestamp" }),
  /**
   * When the pass after a spoken call took this call to keep what the user said about
   * themselves (features/memory/call-memory). Stamped as it starts, so no call is read
   * twice; null until then, and for good on a call in writing, which it never reads.
   */
  memoryKeptAt: int("memory_kept_at", { mode: "timestamp" }),
});

/** One spoken turn in a call. */
export const callMessageTable = sqliteTable(
  "call_message",
  {
    callId: text("call_id")
      .notNull()
      .references(() => callTable.id, { onDelete: "cascade" }),
    /** Provider item id; unique within a call only. */
    id: text("id").notNull(),
    /** Position in the conversation. Turns arrive out of order (user transcripts
     *  land after the reply starts), so this orders them, not `at`. */
    seq: int("seq").notNull(),
    /** `tool` turns keep only the tool name and its arguments, not the result. */
    role: text("role").notNull().$type<CallTurn["role"]>(),
    /** Tool name for `tool` turns; `text` is then the argument JSON. */
    tool: text("tool"),
    text: text("text").notNull(),
    /**
     * The exact transcript fragments this display group was folded from, with
     * their intervals (lib/live LiveFragment). Null on tool turns and on rows
     * written before Live: a group is revisable, the fragments are not.
     */
    fragments: text("fragments", { mode: "json" }).$type<
      { start: number; end: number; text: string }[]
    >(),
    /** Insert time; ordering is `seq`. */
    at: int("at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    // Item ids repeat across calls; repeated fragments of a turn upsert on this key.
    primaryKey({ columns: [t.callId, t.id] }),
    index("idx_call_message_call").on(t.callId, t.seq),
  ],
);

/**
 * The backend's reasoning summaries on a call, kept to look into how it worked.
 * Nothing draws them or reads them back into a prompt; they go with their call.
 */
export const callThoughtTable = sqliteTable(
  "call_thought",
  {
    callId: text("call_id")
      .notNull()
      .references(() => callTable.id, { onDelete: "cascade" }),
    /** Reasoning item and summary part (lib/live LiveReasoning); unique within a call. */
    id: text("id").notNull(),
    /** Where in the call it was thought, on call_message.seq's clock. */
    seq: int("seq").notNull(),
    text: text("text").notNull(),
    at: int("at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.callId, t.id] })],
);

/**
 * One note per subject. Path convention: 'profile' | 'preferences'
 * | 'people/<name>' | 'projects/<name>' | 'topics/<topic>' (memory.schema MEMORY_PATHS).
 * Forgetting score = (hits + 1) / (1 + days since lastReadAt).
 */

export const memoryNoteTable = sqliteTable("memory_note", {
  /** Surrogate key; `path` is the name people and the model use. */
  id: int("id").primaryKey({ autoIncrement: true }),
  path: text("path").notNull().unique(),
  // One line saying what the note is about, the names people use for it included; the
  // listing shows nothing else, so it stands in for search. Cap: config MEMORY_LIMITS.descriptionChars.
  description: text("description").notNull(),
  // Written by the user, not observed by the agent; the note survives losing its last fact.
  ownedByUser: int("owned_by_user", { mode: "boolean" })
    .notNull()
    .default(false),
  /** Numerator of the forgetting score. */
  hits: int("hits").notNull().default(0),
  /** Denominator of the forgetting score; null if never read. */
  lastReadAt: int("last_read_at", { mode: "timestamp" }),
  createdAt: int("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  /** Last time a fact was added or removed; reads do not touch it. */
  updatedAt: int("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** One fact line inside a note. */
export const memoryFactTable = sqliteTable(
  "memory_fact",
  {
    /** Surrogate key; also the read order within a note. */
    id: int("id").primaryKey({ autoIncrement: true }),
    noteId: int("note_id")
      .notNull()
      .references(() => memoryNoteTable.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    // false marks a superseded version; edits append a new row instead of overwriting.
    isLatest: int("is_latest", { mode: "boolean" }).notNull().default(true),
    /**
     * Who wrote it (memory.schema MemorySource): the user on the screen, the
     * call, or a bot mid-job. Memory is one note kept by three hands, and a
     * reader that cannot tell them apart reads what a bot inferred as
     * something the user said. Null on rows written before this column —
     * unknown, not guessed.
     */
    source: text("source").$type<MemorySource>(),
    /**
     * The call it was said in, when a call wrote it; null for the screen and
     * for a bot. Set by the runtime, never by a model (ai/load-tools). A deleted
     * call leaves the fact and drops the link.
     */
    callId: text("call_id").references(() => callTable.id, {
      onDelete: "set null",
    }),
    createdAt: int("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_memory_fact_note").on(t.noteId, t.isLatest),
    index("idx_memory_fact_call").on(t.callId),
  ],
);

/**
 * What a bot kept for itself while it worked — a file of its memory, a skill of its own — as it
 * was before and after, one row per thing one job changed (features/bot/bot.lesson). The screen
 * shows each and can put it back. `thread_id` is no foreign key: a lesson stays after its job is
 * cleared, as the memory it changed does, and its label says which job it was.
 */
export const botLessonTable = sqliteTable(
  "bot_lesson",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    bot: text("bot").notNull(),
    threadId: text("thread_id"),
    threadLabel: text("thread_label").notNull(),
    kind: text("kind").notNull().$type<LessonKind>(),
    /** The memory file's name, or the skill's folder. */
    name: text("name").notNull(),
    /** Null when it was not there before: written new. */
    before: text("before", { mode: "json" }).$type<KeptFiles>(),
    /** Null when it is gone after: removed. */
    after: text("after", { mode: "json" }).$type<KeptFiles>(),
    createdAt: int("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    /** Its last change in the same job, which is folded into this row. */
    updatedAt: int("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    /** When the user put it back as it was before. */
    undoneAt: int("undone_at", { mode: "timestamp" }),
  },
  (t) => [
    index("idx_bot_lesson_thread").on(t.threadId),
    index("idx_bot_lesson_bot").on(t.bot, t.createdAt),
  ],
);

/** Jobs that start by themselves; each start is a thread carrying `routine_id` (features/routine). */
export const routineTable = sqliteTable(
  "routine",
  {
    id: text("id").primaryKey(),
    /** Bot name, not a foreign key, as on `thread`: a deleted bot leaves the routine waiting for a new one. */
    bot: text("bot").notNull(),
    /** Names every thread it opens. */
    label: text("label").notNull(),
    /** The job, handed over each time as written. */
    request: text("request").notNull(),
    schedule: text("schedule", { mode: "json" })
      .notNull()
      .$type<RoutineSchedule>(),
    enabled: int("enabled", { mode: "boolean" }).notNull().default(true),
    /** The start it is waiting for; moved on before a run opens, so one tick starts it once. */
    nextRunAt: int("next_run_at", { mode: "timestamp" }).notNull(),
    createdAt: int("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("idx_routine_due").on(t.enabled, t.nextRunAt)],
);

/** Settings written from the UI, mostly API keys. Env vars still win on read. */
export const configTable = sqliteTable("config", {
  /** Same name as the env var (config.const). */
  key: text("key").primaryKey(),
  /** A secret sealed, a pick as it is (config.query writeConfig); never sent to the browser. */
  value: text("value").notNull(),
});
