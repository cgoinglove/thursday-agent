import type { CatalogProviderId } from "@/features/ai/model.schema";

/**
 * Every endpoint the browser reads. Keys double as SWR cache keys; `revalidate`
 * matches by url prefix, so invalidating `queryKey.memory` also refreshes every
 * `queryKey.memoryPage` loaded. Writes go through server actions, not here.
 */
/** Encodes per segment, keeping the path's `/`. */
const encodePath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");

/**
 * Inverse of encodePath for route-handler segments. No decoding: Next already
 * decodes segments, and decoding again throws on names containing `%`.
 */
export const decodePath = (segments: string[]) => segments.join("/");

/** Next.js page params retain URL encoding; decode once, including literal percent signs. */
export const decodePagePath = (segments: string[]) =>
  segments.map(decodeURIComponent).join("/");

export const queryKey = {
  /** MemoryNote[] first page: pinned first, then by warmth */
  memory: "/api/memory",
  /** Next page; `offset` is the count received so far */
  memoryPage: (offset: number) => ({
    url: "/api/memory",
    query: { offset: offset || null },
  }),

  /** MCPServerSummary[] with tool counts, no tools */
  mcp: "/api/mcp",
  /** MCPServer, one server with its tools */
  mcpServer: (name: string | null) => ({
    url: "/api/mcp",
    pathVariable: [name],
  }),

  /** Every MCP tool across servers, flat */
  mcpTools: "/api/mcp/tools",

  /** SkillSummary[], custom first */
  skills: "/api/skills",
  /**
   * SkillNode: a folder listing or a file's text inside a skill.
   * `path` is relative to the skill folder; "" is the skill itself.
   */
  skillNode: (source: string | null, dir: string | null, path: string) => ({
    url: "/api/skills",
    pathVariable: [source, dir],
    query: { path },
  }),

  /**
   * Bot[]. `threads` and `threadHistory` sit under this prefix, so editing a bot
   * also revalidates the inbox and loaded history pages.
   */
  bot: "/api/bot",

  /** boolean: whether bots keep their own memory (Settings > Bots) */
  botMemory: "/api/bot/memory",
  /** BotMemory: one bot's own memory files, newest first (Settings > Bots) */
  botMemoryFiles: (bot: string) => ({
    url: "/api/bot/memory/files",
    query: { bot },
  }),

  /** Routine[] in the order they were made, each with its latest runs (Settings > Routines) */
  routines: "/api/routine",

  /**
   * Inbox: Thread[] newest first, everything running or asking plus the most
   * recent finished few. Read by use-thursday only; the `threads` signal
   * triggers revalidation, with a poll (config INBOX_POLL_MS) as fallback.
   * Only what can still move carries its lines — an ended thread's are read
   * with `thread` below, since this list is re-read every time anything
   * changes.
   */
  threads: "/api/bot/thread",
  /**
   * History page: Thread[] newest first. `before` is the last page's final
   * updatedAt (ISO), null for the first page. Lines as in `threads`: only what
   * can still move carries them, and every page loaded is re-read on the same
   * signal.
   */
  threadHistory: (before: string | null, q?: string) => ({
    url: "/api/bot/thread",
    query: { history: 1, before, q: q || undefined },
  }),
  /**
   * Thread | null: one job with all of its lines. What the room reads for the
   * thread it has open, whether or not a list holds it. Under `threads`, so the
   * same signal keeps an open thread live.
   */
  thread: (id: string) => ({ url: "/api/bot/thread", query: { id } }),
  /**
   * BotLesson[]: what bots kept for themselves, one job's or one bot's (bot.lesson). Under
   * `threads`, so the job's lessons arrive as its bots look back.
   */
  lessons: (by: { thread: string } | { bot: string }) => ({
    url: "/api/bot/thread/lessons",
    query: by,
  }),
  /**
   * FileNote: where a note about a file open on screen goes, and the version the file is at
   * (bot/thread.file). Under `threads`, so a thread moving re-reads it; the `files` signal
   * re-reads the bare key.
   */
  fileNotes: "/api/bot/thread/file",
  fileNote: (path: string, from: string | null) => ({
    url: "/api/bot/thread/file",
    query: { path, from },
  }),
  /**
   * ResultPart[]: the full result of one tool call; lists carry only a few lines. Not under
   * `threads`: it does not change, so no signal reads it again.
   */
  toolResult: (threadId: string | null, callId: string | null) => ({
    url: "/api/bot/tool-result",
    pathVariable: [threadId],
    query: { call: callId },
  }),
  /**
   * WorkspaceFolder: one folder's rows, and nothing below them. The bare key
   * is the root, so invalidating it refreshes every folder.
   */
  workspace: "/api/workspace",
  workspaceFolder: (path: string, rows: number) => ({
    url: "/api/workspace",
    query: { path: path || null, rows },
  }),
  /** Attachments: which of the paths one message names are on disk, and how big. Under `workspace`, so it refreshes with it. */
  workspaceFiles: (paths: string[]) => ({
    url: "/api/workspace/files",
    query: { paths: JSON.stringify(paths) },
  }),

  /**
   * ArtifactShelf: every bot's folder in `artifacts/` and what is loose there,
   * one row per artifact. `artifactSet` opens one of those rows by its path.
   * The bare key is the menu, so invalidating it refreshes an open set too.
   */
  artifacts: "/api/artifact",
  artifactShelf: (rows: number) => ({
    url: "/api/artifact",
    query: { rows },
  }),
  artifactSet: (path: string, rows: number) => ({
    url: "/api/artifact",
    query: { set: path, rows },
  }),

  /** Raw workspace file, no Result envelope; for iframe, img and fetch, not SWR. */
  file: (path: string) => `/api/file/${encodePath(path)}`,
  /** A page drawn as a file's tile: the route ignores the query, and a page wearing the shell draws its content alone (skills/artifact/runtime/shell). */
  fileFace: (path: string) => `/api/file/${encodePath(path)}?face`,
  /** A site's icon, fetched by the server (lib/favicon): an image, never a JSON read. */
  favicon: (host: string) => `/api/favicon/${encodeURIComponent(host)}`,
  /** File viewer page (new tab): md rendered, html and pdf framed */
  fileView: (path: string) => `/artifact/${encodePath(path)}`,

  /**
   * Server-sent events, not a read; only app-event.client's `AppEventSource`
   * opens it. The payloads are the AppEvent union in app/api/events/app-event.ts.
   */
  events: "/api/events",

  /** ConfigStatus[]: which declared config keys are set; values stay on the server */
  config: "/api/config",

  /**
   * CallRecord[] page, newest call first, turns in speaking order; pages count
   * calls (CALL_HISTORY_PAGE). `before` is the oldest call's `startedAt` (ISO)
   * on the previous page, null for the first. Calls with no turns are omitted.
   */
  callHistory: (before: string | null) => ({
    url: "/api/thursday/call",
    query: { before },
  }),

  /**
   * LiveSettings: who she is on a call and what she may do (Settings › Thursday). The
   * app's, not one browser's — a phone writing in and a second machine read the same row.
   */
  thursdaySettings: "/api/thursday/settings",

  /**
   * POST, not a read; the one endpoint here SWR never touches. Body is
   * {toolCallId, callId, name, input}; one JSON Result per call, abortable.
   */
  toolCall: "/api/thursday/tool-call",
  /** POST, a beacon: the call a closing tab held, ended (use-thursday). */
  callEnd: "/api/thursday/call/end",
  /** The sign-ins the app keeps for bots to borrow (features/signins). */
  signIns: "/api/signins",
  /** Who may write from a phone, and who is asking to (features/reach). */
  reach: "/api/reach",
  /** POST, one turn of a call in writing, streamed as she answers (thursday.text). */
  textCall: "/api/thursday/text",
  /** POST, an edit from the memory screen, streamed as it runs (memory.edit). */
  memoryEdit: "/api/memory/edit",

  /** Providers this app can call and whether each key is set */
  llmModel: "/api/llm-model",
  /**
   * AutomaticModel: what a bot with no model picked runs on now. Under `llmModel`, so a key
   * saved or a sign-in re-reads it.
   */
  automaticModel: "/api/llm-model/automatic",
  /** CatalogModel[]: every model a catalog provider lists (`CATALOG_PROVIDERS`), read without a key */
  modelCatalog: (provider: CatalogProviderId) =>
    `/api/llm-model/catalog/${provider}`,
  /**
   * KeyCredits | null: what is left on a catalog provider's key, null without one.
   * Under `llmModel`, so the key dialog's revalidate re-reads it after a save.
   */
  keyCredits: (provider: CatalogProviderId) =>
    `/api/llm-model/credits/${provider}`,
  /**
   * SubscriptionUsage | null: how much of the GPT Subscription plan is used, null when
   * signed out. Under `llmModel`, so signing in or out re-reads it.
   */
  subscriptionUsage: "/api/llm-model/subscription",
  /** Running: where this server runs — the background, a terminal — and the command to change it */
  running: "/api/running",
  /** Update: the version that runs, npm's newest when it is newer, and how to move there */
  update: "/api/update",
} as const;
