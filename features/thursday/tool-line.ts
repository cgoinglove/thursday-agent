import { TOOL_NAMES } from "@/features/ai/tools/tool-name";
import type { Thread } from "@/features/bot/bot.schema";

// Human-readable activity lines for tool calls on the call screen. The model
// never reads these. Unknown names resolve to null and the screen shows the name.
const LINES: Record<string, string> = {
  [TOOL_NAMES.memory_recall]: "Checking your notes",
  [TOOL_NAMES.memory_create]: "Starting a note",
  [TOOL_NAMES.memory_remember]: "Noting that down",
  [TOOL_NAMES.memory_describe]: "Renaming a note",
  [TOOL_NAMES.memory_forget]: "Forgetting that",
  [TOOL_NAMES.bash]: "Doing it on this computer",
  [TOOL_NAMES.web_search]: "Searching the web",
  [TOOL_NAMES.load_skill]: "Reading how to do this",
  [TOOL_NAMES.look_at]: "Looking at the picture",
  [TOOL_NAMES.make_deck]: "Making the deck",
  [TOOL_NAMES.end_call]: "Ending the call",
  [TOOL_NAMES.routine]: "Checking your routines",
};

/** When a routine being made starts, as the call's arguments say it: "once at 19:10", "every 6 hours". */
function routineWhen(args: Record<string, unknown>): string | null {
  if (typeof args.at === "string" && args.at.length >= 16) {
    const [day, time] = args.at.split(" ");
    const [year, month, date] = day.split("-").map(Number);
    const on = new Date(year, month - 1, date);
    if (on.toDateString() === new Date().toDateString())
      return `once at ${time}`;
    const named = on.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return `once, ${named} ${time}`;
  }
  if (typeof args.time === "string" && args.time)
    return `daily at ${args.time}`;
  if (typeof args.everyHours === "number")
    return `every ${args.everyHours} hours`;
  return null;
}

/**
 * How much of a fact the line carries. What is being written is the one thing
 * on this screen the user cannot check afterwards without opening the note, so
 * it is said as it happens — but the row is one line that also carries the
 * path and the tool's name, and a fact cut mid-word reads as a bug rather than
 * a quotation.
 */
const FACT_MAX = 28;

/** A line whose snippet is the whole of it carries more, since nothing else shares the row. */
const SAID_MAX = 44;

function snippet(text: string, max = FACT_MAX): string {
  const said = text.trim().replace(/\s+/g, " ");
  if (said.length <= max) return said;
  const cut = said.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** A path as the line names it: the file, not the folders above it. */
const fileName = (path: string) => path.split("/").filter(Boolean).at(-1) ?? "";

/** One string argument, trimmed, or "" while the arguments are still streaming in. */
const said = (args: Record<string, unknown>, key: string) =>
  typeof args[key] === "string" ? (args[key] as string).trim() : "";

/** The first fact of a `memory_remember` or `memory_create` call, while the arguments are whole enough to read. */
function firstFact(
  args: Record<string, unknown>,
): { text: string; more: number } | null {
  if (!Array.isArray(args.facts)) return null;
  const texts = args.facts
    .map((fact) =>
      fact &&
      typeof fact === "object" &&
      typeof (fact as { text?: unknown }).text === "string"
        ? (fact as { text: string }).text.trim()
        : "",
    )
    .filter(Boolean);
  return texts.length ? { text: texts[0], more: texts.length - 1 } : null;
}

/** Lines that need the arguments; arguments may still be streaming in. */
function fromArgs(
  name: string,
  args: Record<string, unknown>,
  bot: string | null,
): string | null {
  if (
    name === TOOL_NAMES.memory_remember ||
    name === TOOL_NAMES.memory_create
  ) {
    const path = said(args, "path");
    const fact = firstFact(args);
    const verb = name === TOOL_NAMES.memory_create ? "Starting" : "Noting";
    if (!path) return null;
    if (!fact) return `${verb} ${path}`;
    const more = fact.more > 0 ? ` (+${fact.more})` : "";
    return `${verb} ${path}: ${snippet(fact.text)}${more}`;
  }
  // What is read is named as exactly as what is written: a note she opened and said
  // nothing of is one the user cannot go back and check
  if (name === TOOL_NAMES.memory_recall) {
    const path = said(args, "path");
    return path ? `Checking · ${path}` : null;
  }
  if (name === TOOL_NAMES.memory_describe) {
    const path = said(args, "path");
    return path ? `Renaming · ${path}` : null;
  }
  // The tool asks the model for this line for this screen (workspace.tool bash);
  // the command stands in when it wrote none
  if (name === TOOL_NAMES.bash) {
    const what = said(args, "description") || said(args, "command");
    return what ? `On this computer · ${snippet(what, SAID_MAX)}` : null;
  }
  if (name === TOOL_NAMES.load_skill) {
    const skill = said(args, "name");
    return skill ? `Reading the ${skill} skill` : null;
  }
  if (name === TOOL_NAMES.look_at) {
    const path = said(args, "path");
    return path ? `Looking at ${fileName(path)}` : null;
  }
  if (name === TOOL_NAMES.make_deck) {
    const title = said(args, "title");
    return title ? `Making the deck · ${snippet(title, SAID_MAX)}` : null;
  }
  if (name === TOOL_NAMES.thread_start) {
    const bot = said(args, "bot");
    return bot ? `Handing this to ${bot}` : "Handing this over";
  }
  if (name === TOOL_NAMES.web_search) {
    const query = said(args, "query");
    return query ? `Searching · ${query}` : null;
  }
  if (name === TOOL_NAMES.routine) {
    if (args.action === "create") {
      const bot = said(args, "bot");
      const when = routineWhen(args);
      const what = [bot, when].filter(Boolean).join(", ");
      return what ? `Setting a routine · ${what}` : "Setting a routine";
    }
    if (args.action === "change") return "Changing a routine";
    if (args.action === "delete") return "Deleting a routine";
    return null;
  }
  const label = said(args, "thread");
  if (name === TOOL_NAMES.thread_tell)
    return bot ? `Telling ${bot}` : "Passing that on";
  if (name === TOOL_NAMES.thread_answer)
    return bot ? `Answering ${bot}` : "Answering that";
  if (name === TOOL_NAMES.thread_cancel)
    return label?.toLowerCase() === "all"
      ? "Stopping all the work"
      : label
        ? `Stopping ${label}`
        : "Stopping that";
  if (name === TOOL_NAMES.thread_seen)
    return label ? `Marking ${label} as read` : "Marking that as read";
  if (name === TOOL_NAMES.thread_show)
    return label ? `Opening ${label}` : "Opening that";
  if (name === TOOL_NAMES.thread_status)
    return label && label.toLowerCase() !== "all"
      ? `Checking on ${label}`
      : "Checking on the work";
  return null;
}

/** MCP tools are named `<server>__<tool>`; only the server name is shown. */
function fromServer(name: string): string | null {
  const at = name.indexOf("__");
  if (at <= 0) return null;
  return `Reaching ${name.slice(0, at).replace(/[-_]/g, " ")}`;
}

/** Arguments as an object, or null while they are still streaming in. */
function parseArgs(args?: string): Record<string, unknown> | null {
  if (!args) return null;
  try {
    const value: unknown = JSON.parse(args);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // Partial or non-JSON arguments: fall back to the name-only line.
  }
  return null;
}

/** The line for a tool call; `bot` is who it reaches (`toolBot`), for the lines that name them. */
export function toolLine(
  name: string,
  args?: string,
  bot: string | null = null,
): string | null {
  if (name === TOOL_NAMES.tool_search || name === TOOL_NAMES.tool_call) {
    return "Reaching a connected service";
  }
  const parsed = parseArgs(args);
  return (
    (parsed && fromArgs(name, parsed, bot)) ?? LINES[name] ?? fromServer(name)
  );
}

/**
 * What the backend's work is about, for the line while it thinks: a reasoning summary opens
 * with its title in bold, on a call aloud and in writing alike. Null when it opens otherwise.
 */
export function reasoningTitle(summary: string): string | null {
  return /^\s*\*\*(.+?)\*\*/.exec(summary)?.[1]?.trim() || null;
}

/** The call's tools that act on one thread the model names by its label or id. */
const ON_A_THREAD = new Set<string>([
  TOOL_NAMES.thread_tell,
  TOOL_NAMES.thread_answer,
  TOOL_NAMES.thread_status,
  TOOL_NAMES.thread_show,
  TOOL_NAMES.thread_cancel,
  TOOL_NAMES.thread_seen,
]);

/**
 * The bot a call's tool reaches, so its row wears that bot's face rather than a glyph —
 * who work went to is a face everywhere else in the app. The one work is handed to, else
 * the bot of the thread the tool names, found as the server finds a thread (thread.query
 * resolveThread): its id, else its label. An answer goes to the bot that asked; "all"
 * reaches nobody in particular. A thread the page does not hold — stopped and read, or
 * finished longer ago than the inbox keeps — is named by the tool's answer once it is back.
 */
export function toolBot(
  name: string,
  args?: string,
  threads?: Thread[],
  output?: string,
): string | null {
  const parsed = parseArgs(args);
  if (!parsed) return null;
  if (name === TOOL_NAMES.thread_start)
    return typeof parsed.bot === "string" && parsed.bot.trim()
      ? parsed.bot.trim()
      : null;
  if (!ON_A_THREAD.has(name)) return null;
  const ref = typeof parsed.thread === "string" ? parsed.thread.trim() : "";
  if (!ref || ref.toLowerCase() === "all") return null;
  const lower = ref.toLowerCase();
  const thread =
    threads?.find((one) => one.id === ref) ??
    threads?.find((one) => one.label.toLowerCase() === lower);
  if (!thread) return answeredBy(output);
  return name === TOOL_NAMES.thread_answer
    ? (thread.room.questions[0]?.bot ?? thread.bot)
    : thread.bot;
}

/** Whom a thread tool's answer says it reached (load-tools): `bot`, or the bot that took it as its answer. */
function answeredBy(output?: string): string | null {
  const said = parseArgs(output);
  if (!said) return null;
  if (typeof said.bot === "string" && said.bot.trim()) return said.bot.trim();
  const answered = said.answered as { bot?: unknown } | null | undefined;
  return typeof answered?.bot === "string" ? answered.bot : null;
}

/**
 * The label a thread was started under, or null for any other turn. It is
 * how a job is found again from the line that opened it — in her prompt and in
 * the call log alike.
 */
export function startedLabel(
  tool: string | null | undefined,
  text: string,
): string | null {
  if (tool !== TOOL_NAMES.thread_start) return null;
  try {
    const said = JSON.parse(text) as { label?: unknown };
    return typeof said.label === "string" ? said.label : null;
  } catch {
    return null;
  }
}

/** A page a call's web search read (lib/live LiveSource), as its tool turn stores it. */
export type SearchedSource = { url: string; title?: string };

/**
 * What a web search turn looked for and read, or null for any other turn. The call's
 * search is the backend's own hosted tool: its turn is stored by the page as
 * `{query, sources}`, and the call log and the next call's prompt read it back here.
 */
export function searchOf(
  tool: string | null | undefined,
  text: string,
): { query: string | null; sources: SearchedSource[] } | null {
  if (tool !== TOOL_NAMES.web_search) return null;
  try {
    const said = JSON.parse(text) as { query?: unknown; sources?: unknown };
    return {
      query: typeof said.query === "string" ? said.query : null,
      sources: sourcesIn(said.sources),
    };
  } catch {
    return null;
  }
}

/** What a `web_search` call asked for, from its arguments. */
export function searchQueryOf(args: string): string | null {
  const query = parseArgs(args)?.query;
  return typeof query === "string" && query.trim() ? query.trim() : null;
}

/**
 * The pages the call's Exa search came back with (ai/tools/search.tool createCallSearchTool
 * answers `{results, sources}`), or none for an answer of any other shape — a failure line,
 * a result cut short.
 */
export function searchSourcesOf(output: string): SearchedSource[] {
  return sourcesIn(parseArgs(output)?.sources);
}

/** The pages in a search's `sources`: each entry that has an address, none for anything else. */
function sourcesIn(sources: unknown): SearchedSource[] {
  return Array.isArray(sources)
    ? sources.flatMap((source) =>
        source &&
        typeof source === "object" &&
        typeof (source as SearchedSource).url === "string"
          ? [source as SearchedSource]
          : [],
      )
    : [];
}
