import type { Stats } from "node:fs";
import {
  open,
  readdir,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { BOT_MEMORY_LIMITS } from "@/config";
import { botFolder, WORKSPACE } from "@/features/workspace/workspace";
import type { BotMemory, BotMemoryFile } from "./bot.schema";

/**
 * A bot's own memory: files it keeps in its folder, one topic each, written and read with
 * its own shell. The disk is the only index — a file's first line is its listing line — so
 * keeping something is one write, and no list can fall out of step with the files.
 */

/** Workspace-relative, the way a prompt names it (config PATHS.bots). */
export const botMemoryFolder = (bot: string): string =>
  `${botFolder(bot)}/memory`;

/** Enough of a file to find its first line in; the rest is the bot's to open. */
const HEAD_BYTES = 1024;

/**
 * Newest first. `limit` is how many are read for their first line: the prompt lists
 * BOT_MEMORY_LIMITS.files, the bot's page (Settings > Bots) as many as a Workspace folder shows.
 */
export async function listBotMemory(
  bot: string,
  limit = BOT_MEMORY_LIMITS.files,
): Promise<BotMemory> {
  const folder = botMemoryFolder(bot);
  const dir = join(WORKSPACE, folder);
  const files = (await readMemoryFolder(dir)).sort(
    (a, b) => b.info.mtimeMs - a.info.mtimeMs,
  );
  const entries = await Promise.all(
    files.slice(0, limit).map(
      async ({ name, info }): Promise<BotMemoryFile> => ({
        file: name,
        path: `${folder}/${name}`,
        line: await firstLine(join(dir, name)),
        at: new Date(info.mtimeMs),
        bytes: info.size,
      }),
    ),
  );
  return { folder, entries, total: files.length };
}

/**
 * What counts as a memory file, for the listing and the limits alike: a plain file, not hidden.
 * A folder or file that cannot be read is left out; `strict`, only one that is not there is, and
 * any other failure is thrown (bot.lesson, which would take it for a file removed).
 */
export async function readMemoryFolder(
  dir: string,
  { strict = false }: { strict?: boolean } = {},
): Promise<{ name: string; info: Stats }[]> {
  const absent = (cause: unknown) => {
    if (strict && (cause as NodeJS.ErrnoException).code !== "ENOENT")
      throw cause;
    return null;
  };
  const names = (await readdir(dir).catch(absent)) ?? [];
  const found = await Promise.all(
    names
      .filter((name) => !name.startsWith("."))
      .map(async (name) => {
        const info = await stat(join(dir, name)).catch(absent);
        return info?.isFile() ? { name, info } : null;
      }),
  );
  return found.filter((file) => file !== null);
}

/**
 * A bot's memory as it stood before a command, so what the command takes past
 * BOT_MEMORY_LIMITS can be put back. A file already past the limit is held without its
 * text: there is nothing within the limit to put back.
 */
type HeldBotMemory = Map<
  string,
  {
    text: string | null;
    size: number;
    mtimeMs: number;
    atime: Date;
    mtime: Date;
  }
>;

export async function holdBotMemory(bot: string): Promise<HeldBotMemory> {
  const dir = join(WORKSPACE, botMemoryFolder(bot));
  const held: HeldBotMemory = new Map();
  await Promise.all(
    (await readMemoryFolder(dir)).map(async ({ name, info }) => {
      // More than four bytes a character is past the limit without reading it
      const text =
        info.size > BOT_MEMORY_LIMITS.chars * 4
          ? null
          : await readFile(join(dir, name), "utf8").catch(() => null);
      held.set(name, {
        text:
          text !== null && charCount(text) <= BOT_MEMORY_LIMITS.chars
            ? text
            : null,
        size: info.size,
        mtimeMs: info.mtimeMs,
        atime: info.atime,
        mtime: info.mtime,
      });
    }),
  );
  return held;
}

/**
 * Puts back what was done to a bot's memory past BOT_MEMORY_LIMITS since `held`, and says
 * so in lines the bot can act on; null when nothing went past. A file written past `chars`
 * goes back to what it was, or is removed when it is new; new files that take the folder
 * past `files` are removed. A file that was already past the limit stays and is named.
 */
export async function keepBotMemory(
  bot: string,
  held: HeldBotMemory,
): Promise<string | null> {
  const folder = botMemoryFolder(bot);
  const dir = join(WORKSPACE, folder);
  const { files: most, chars } = BOT_MEMORY_LIMITS;
  const lines: string[] = [];
  const fresh: string[] = [];
  let count = 0;

  for (const { name, info } of await readMemoryFolder(dir)) {
    count += 1;
    const was = held.get(name);
    if (was && was.size === info.size && was.mtimeMs === info.mtimeMs) {
      continue;
    }
    const path = join(dir, name);
    const length = charCount(await readFile(path, "utf8").catch(() => ""));
    if (length <= chars) {
      if (!was) fresh.push(name);
      continue;
    }
    const size = `${length.toLocaleString("en-US")} characters, past the ${chars.toLocaleString("en-US")} a memory file holds`;
    if (!was) {
      await rm(path, { force: true });
      count -= 1;
      lines.push(
        `Not kept: \`${folder}/${name}\` came to ${size}, so it was removed. Write it again shorter.`,
      );
    } else if (was.text !== null) {
      await writeFile(path, was.text);
      await utimes(path, was.atime, was.mtime);
      lines.push(
        `Not kept: \`${folder}/${name}\` came to ${size}, so it is back as it was. Write it again shorter.`,
      );
    } else {
      lines.push(`\`${folder}/${name}\` is ${size}. Shorten it.`);
    }
  }

  if (count > most && fresh.length) {
    await Promise.all(
      fresh.map((name) => rm(join(dir, name), { force: true })),
    );
    const named = fresh.map((name) => `\`${folder}/${name}\``).join(", ");
    lines.push(
      `Not kept: your memory holds ${most} files at most and this made ${count}, so ${named} ${fresh.length === 1 ? "was" : "were"} removed. Delete or merge files no longer worth keeping, then write it again.`,
    );
  }
  return lines.length ? lines.join("\n") : null;
}

/** A file's length as BOT_MEMORY_LIMITS counts it. */
const charCount = (text: string): number => [...text.trim()].length;

/** The line a file is listed by, read from its head (`listingLine`). */
async function firstLine(path: string): Promise<string> {
  const handle = await open(path, "r").catch(() => null);
  if (!handle) return "";
  try {
    const head = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await handle.read(head, 0, HEAD_BYTES, 0);
    return listingLine(head.toString("utf8", 0, bytesRead));
  } finally {
    await handle.close();
  }
}

/**
 * The line a text is listed by: its first, without a heading's `#`. A file that opens with
 * frontmatter anyway — a shape models are trained on, and every skill's `SKILL.md` — is listed
 * by its `description`, or by the first line after it.
 */
export function listingLine(text: string): string {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines[0] === "---") {
    const said = lines.find((line) => line.startsWith("description:"));
    if (said) {
      return said
        .slice("description:".length)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
    const end = lines.indexOf("---", 1);
    return end > 0 ? (lines[end + 1] ?? "").replace(/^#+\s*/, "") : "";
  }
  return (lines[0] ?? "").replace(/^#+\s*/, "");
}
