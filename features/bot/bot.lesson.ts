import type { Stats } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { BOT_LESSON, PATHS } from "@/config";
import { botFolder, WORKSPACE } from "@/features/workspace/workspace";
import { logger } from "@/lib/logger";
import { publicError } from "@/lib/public-error";
import { walkFiles } from "@/lib/sandbox";
import { botMemoryFolder, readMemoryFolder } from "./bot.memory";
import type { KeptFiles, LessonKind } from "./bot.schema";
import {
  findLesson,
  markLessonUndone,
  noteLesson,
  sameKept,
} from "./lesson.query";
import { findThread } from "./thread.query";

/**
 * What a bot keeps for itself — each file of its memory, each skill of its own — watched
 * across every command it runs (workspace.tool), so what a command changed is noted as a
 * lesson (lesson.query) the screen shows and can put back. What is on disk decides, never what
 * the bot says it kept: a write that failed, or one the memory limits took back, notes nothing.
 */

/** One thing kept, as it stands: each file's stamp (size and time), and the text of them. */
type Item = {
  kind: LessonKind;
  name: string;
  stamps: Map<string, string>;
  kept: KeptFiles;
};

type Pinned = typeof globalThis & {
  __botKept?: Map<string, Map<string, Item>>;
  __botKeptBusy?: Map<string, number>;
};

/**
 * Each bot's things as last held, by `kind:name`, so a command reads again only the files whose
 * stamp moved; and how many of its commands are running. On globalThis, as every server-lifetime
 * map here is.
 */
const held = ((globalThis as Pinned).__botKept ??= new Map());
const busy = ((globalThis as Pinned).__botKeptBusy ??= new Map());

const keyOf = (kind: LessonKind, name: string) => `${kind}:${name}`;

/** Workspace-relative, the way a prompt names it: the folder one thing lives in, or its file. */
function rootOf(bot: string, kind: LessonKind, name: string): string {
  return kind === "memory"
    ? `${botMemoryFolder(bot)}/${name}`
    : `${botFolder(bot)}/${PATHS.skills.own}/${name}`;
}

const stampOf = (info: Stats) => `${info.size}:${info.mtimeMs}`;

/** What the bot keeps on disk now, each thing with its files' stamps; no text read yet. */
async function onDisk(bot: string): Promise<Map<string, Omit<Item, "kept">>> {
  const found = new Map<string, Omit<Item, "kept">>();
  const memory = join(WORKSPACE, botMemoryFolder(bot));
  for (const { name, info } of await readMemoryFolder(memory))
    found.set(keyOf("memory", name), {
      kind: "memory",
      name,
      stamps: new Map([[rootOf(bot, "memory", name), stampOf(info)]]),
    });
  const skills = join(WORKSPACE, botFolder(bot), PATHS.skills.own);
  const folders = await readdir(skills, { withFileTypes: true }).catch(
    () => [],
  );
  for (const folder of folders) {
    if (!folder.isDirectory() || folder.name.startsWith(".")) continue;
    const stamps = new Map<string, string>();
    for await (const file of walkFiles(join(skills, folder.name))) {
      const info = await stat(file).catch(() => null);
      if (info)
        stamps.set(
          relative(WORKSPACE, file).split(sep).join("/"),
          stampOf(info),
        );
    }
    found.set(keyOf("skill", folder.name), {
      kind: "skill",
      name: folder.name,
      stamps,
    });
  }
  return found;
}

/** The text of each file, where it is text the app keeps (BOT_LESSON.fileChars). */
async function readKept(stamps: Map<string, string>): Promise<KeptFiles> {
  const kept: KeptFiles = { files: {}, unheld: [] };
  const text = new TextDecoder("utf-8", { fatal: true });
  for (const path of stamps.keys()) {
    const bytes = await readFile(join(WORKSPACE, path)).catch(() => null);
    let words: string | null = null;
    // More than four bytes a character is past the limit without decoding it
    if (bytes && bytes.length <= BOT_LESSON.fileChars * 4) {
      try {
        words = text.decode(bytes);
      } catch {
        // Not UTF-8: a picture, an archive
      }
    }
    if (words !== null && [...words].length <= BOT_LESSON.fileChars)
      kept.files[path] = words;
    else kept.unheld.push(path);
  }
  return kept;
}

const sameStamps = (a: Map<string, string>, b: Map<string, string>) =>
  a.size === b.size && [...a].every(([path, stamp]) => b.get(path) === stamp);

/** Each thing as it stands, its text read again only where a stamp moved since `before`. */
async function readAll(
  bot: string,
  before: Map<string, Item> | undefined,
): Promise<Map<string, Item>> {
  const now = new Map<string, Item>();
  for (const [key, item] of await onDisk(bot)) {
    const was = before?.get(key);
    now.set(
      key,
      was && sameStamps(was.stamps, item.stamps)
        ? was
        : { ...item, kept: await readKept(item.stamps) },
    );
  }
  return now;
}

/**
 * Before a command: what the bot keeps is read as it stands, so a change the user made on the
 * bot's page meanwhile is not taken for the command's. While another of its commands is
 * running, what was held stays: a change that command made is still to be noted, by it.
 */
export async function holdKept(bot: string): Promise<void> {
  if (!busy.get(bot) || !held.has(bot))
    held.set(bot, await readAll(bot, held.get(bot)));
  busy.set(bot, (busy.get(bot) ?? 0) + 1);
}

/**
 * After a command: each thing whose files differ from what was held is noted as a lesson of
 * `threadId`'s job, and becomes what is held. Called once for every `holdKept`, failed command
 * or not. A lesson that cannot be written is logged: the command it followed stands.
 */
export async function noteKept(
  bot: string,
  threadId: string | null,
): Promise<void> {
  try {
    const before = held.get(bot) ?? new Map<string, Item>();
    const now = await readAll(bot, before);
    held.set(bot, now);
    type Change = Pick<Item, "kind" | "name"> & {
      before: KeptFiles | null;
      after: KeptFiles | null;
    };
    const changes: Change[] = [];
    for (const [key, item] of now) {
      const was = before.get(key);
      if (!was || (was !== item && !sameKept(was.kept, item.kept)))
        changes.push({ ...item, before: was?.kept ?? null, after: item.kept });
    }
    for (const [key, was] of before)
      if (!now.has(key))
        changes.push({ ...was, before: was.kept, after: null });
    if (!changes.length) return;
    const thread = threadId ? await findThread(threadId) : undefined;
    for (const { kind, name, before: was, after } of changes)
      await noteLesson({
        bot,
        thread: thread ? { id: thread.id, label: thread.label } : null,
        kind,
        name,
        before: was,
        after,
      });
  } catch (cause) {
    logger.error(`${bot}: noting what it kept`, cause);
  } finally {
    const left = (busy.get(bot) ?? 1) - 1;
    if (left > 0) busy.set(bot, left);
    else busy.delete(bot);
  }
}

/**
 * Puts one lesson back: the thing as it was before the job changed it, or gone when the job
 * wrote it new. Only while it still stands as the job left it — a later change, the bot's or
 * the user's, would be lost — and only inside that thing's own folder or file. A file that is
 * not text the app keeps stays as it is, and the answer names it.
 */
export async function undoLesson(id: number): Promise<string> {
  const row = await findLesson(id);
  if (!row) publicError("That lesson is gone.");
  if (row.undoneAt) publicError("It is already put back.");
  const root = rootOf(row.bot, row.kind, row.name);
  const paths = [row.before, row.after].flatMap((kept) => [
    ...Object.keys(kept?.files ?? {}),
    ...(kept?.unheld ?? []),
  ]);
  if (paths.some((path) => path !== root && !path.startsWith(`${root}/`)))
    publicError("That lesson names files outside what it changed.");

  const current = (await readAll(row.bot, held.get(row.bot))).get(
    keyOf(row.kind, row.name),
  );
  if (!sameKept(current?.kept ?? null, row.after))
    publicError(
      "It has changed since, so it is left as it is. Put back the later change first.",
    );

  if (!row.before) {
    await rm(join(WORKSPACE, root), { recursive: true, force: true });
  } else {
    const before = row.before;
    const keep = new Set([...Object.keys(before.files), ...before.unheld]);
    for (const path of [
      ...Object.keys(row.after?.files ?? {}),
      ...(row.after?.unheld ?? []),
    ])
      if (!keep.has(path))
        await rm(join(WORKSPACE, path), { recursive: true, force: true });
    for (const [path, text] of Object.entries(before.files)) {
      await mkdir(dirname(join(WORKSPACE, path)), { recursive: true });
      await writeFile(join(WORKSPACE, path), text);
    }
  }
  // Held as it now stands, so a command running meanwhile does not note the undo as its own
  held.set(row.bot, await readAll(row.bot, held.get(row.bot)));
  await markLessonUndone(id);
  const left = row.before?.unheld.filter((path) =>
    row.after?.unheld.includes(path),
  );
  return left?.length
    ? `Put back, but for ${left.join(", ")}: not text the app keeps, so left as it is.`
    : "Put back.";
}
