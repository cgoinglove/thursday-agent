import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Collapses whitespace to one line and cuts at `max` characters with an ellipsis. */
export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/**
 * Text as a name a path can carry and a person can still read: lowercase, each run of
 * anything but a letter or a digit one `-`, none at either end, at most 40 characters.
 * Empty when nothing is left.
 */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** How much of a thrown object with no words of its own is worth reading back. */
const THROWN_JSON_MAX = 300;

/**
 * Message of a caught `unknown`, in one line. Not everything thrown is an Error: a
 * provider's streamed failure arrives as its parsed body, with the words in `message`
 * or one `error` down, and an object without either reads back as its JSON.
 */
export function errorToString(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause !== "object" || cause === null) return String(cause);
  const { message, error } = cause as { message?: unknown; error?: unknown };
  if (typeof message === "string" && message) return message;
  if (typeof error === "string" && error) return error;
  const inner = (error as { message?: unknown } | null | undefined)?.message;
  if (typeof inner === "string" && inner) return inner;
  try {
    return clip(JSON.stringify(cause), THROWN_JSON_MAX);
  } catch {
    // A cycle or a bigint: no JSON, and the constructor is all there is to name
    return `${cause.constructor?.name ?? "Object"} thrown without a message`;
  }
}

/** Every string inside a parsed JSON value, however deep: the texts a stored blob holds. */
export function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(stringsIn);
}

/** 1234 → "1.2k", 1234567 → "1.2M". For numbers read only for their size, like tokens. */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** 900 → "900 B", 12345 → "12.1 KB", 5e9 → "4.7 GB". Binary units; the OS reports the same. */
export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let at = 0;
  while (value >= 1024 && at < units.length - 1) {
    value /= 1024;
    at += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[at]}`;
}

/** `https://www.tenki.jp/…` → `tenki.jp`; null for a URL that does not parse. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Takes emphasis marks off, and only marks, as CommonMark reads them: a run longer than the
 * mark (a key shown as `sk-…******…`), a mark with a space inside it (`2 * 3`), or an
 * underscore inside a word (`cafe_list_v2.md`) is text and stays. Widest first, so one mark
 * inside another (`**a *b* c**`) comes off too.
 */
const EMPHASIS = (["\\*", "_"] as const).flatMap((mark) => {
  // what may not touch it from outside: another mark, and for `_` a letter too
  const outside = mark === "_" ? "\\w_" : mark;
  return [3, 2, 1].map((width) => {
    const run = mark.repeat(width);
    return new RegExp(
      `(?<![${outside}])${run}(?![\\s${mark}])(.+?)(?<![\\s${mark}])${run}(?![${outside}])`,
      "g",
    );
  });
});
const unemphasize = (text: string) =>
  EMPHASIS.reduce((out, mark) => out.replace(mark, "$1"), text);

/** Markdown as plain text for a one-line preview: strips headings, emphasis, code, links and table rules. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s?)/gm, "")
    .replace(/[^\n]+/g, unemphasize)
    .replace(/^\s*\|?[\s:|-]+\|\s*$/gm, " ")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A link as written in Markdown: `[label](href)`. */
export const MARKDOWN_LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/**
 * Markdown as a caption: the marks go as in `plainText`, but the lines a list or a table is
 * made of stay lines (a table row as its cells with " · " between, its rule dropped) and a
 * link keeps its `[label](href)` for the caption to draw as one. Emphasis is taken off around
 * a link and off its label, never off where it leads: a file name's underscores are its path.
 */
export function captionText(markdown: string): string {
  const links: string[] = [];
  const bare = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(MARKDOWN_LINK, (_, label: string, href: string) => {
      links.push(`[${unemphasize(label.replace(/`/g, ""))}](${href})`);
      return `\uE000${links.length - 1}\uE000`;
    });
  const lines: string[] = [];
  for (const raw of bare.split("\n")) {
    let line = raw.trim();
    if (!line) continue;
    // A table's rule, the row under its head, or a rule across the page
    if (/^\|?[\s:|-]+\|[\s:|-]*$|^[-*_]{3,}$/.test(line)) continue;
    if (/\|.*\|/.test(line))
      line = line
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean)
        .join(" · ");
    line = unemphasize(
      line
        .replace(/^#{1,6}\s+/, "")
        .replace(/^>\s?/, "")
        .replace(/^[-*+]\s+/, "• ")
        .replace(/`([^`]*)`/g, "$1"),
    ).replace(/\s+/g, " ");
    lines.push(line);
  }
  return lines
    .join("\n")
    .replace(/\uE000(\d+)\uE000/g, (_, at: string) => links[Number(at)] ?? "");
}

export const isFunction = <
  T extends (...args: any[]) => any = (...args: any[]) => any,
>(
  v: unknown,
): v is T => typeof v === "function";

/** Runs async functions one at a time in order. A failure does not break the chain. */
export const PromiseChain = () => {
  let promise: Promise<any> = Promise.resolve();
  return <T>(asyncFunction: () => Promise<T>): Promise<T> => {
    const resultPromise = promise.then(() => asyncFunction());
    promise = resultPromise.catch(() => {});
    return resultPromise;
  };
};

/**
 * "Waiting on me" ink. The other status colour is `text-destructive` (failed);
 * success, connected and enabled carry none. Blue is no status: it is the brand
 * (`bg-brand`), the one thing a screen asks for and Thursday herself.
 */
export const WAITING_INK = "text-waiting";
