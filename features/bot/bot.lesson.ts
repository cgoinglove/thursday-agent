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
import {
  botFolder,
  insideWorkspace,
  WORKSPACE,
} from "@/features/workspace/workspace";
import { logger } from "@/lib/logger";
import { publicError } from "@/lib/public-error";
import { walkFiles } from "@/lib/sandbox";
import { botMemoryFolder, readMemoryFolder } from "./bot.memory";
import type { KeptFiles, LessonKind } from "./bot.schema";
import {
  findLesson,
  type LessonRow,
  markLessonUndone,
  noteLesson,
  pathsOf,
  sameKept,
  textAt,
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

/** Not there: what a reader takes for absent. Any other failure is thrown, never taken for it. */
function absent(cause: unknown): null {
  if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
  throw cause;
}

/**
 * What the bot keeps on disk now, each thing with its files' stamps; no text read yet. Only a
 * folder or file that is not there is absent: one that cannot be read throws, rather than every
 * note or skill in it reading as removed.
 */
async function onDisk(bot: string): Promise<Map<string, Omit<Item, "kept">>> {
  const found = new Map<string, Omit<Item, "kept">>();
  const memory = join(WORKSPACE, botMemoryFolder(bot));
  for (const { name, info } of await readMemoryFolder(memory, {
    strict: true,
  }))
    found.set(keyOf("memory", name), {
      kind: "memory",
      name,
      stamps: new Map([[rootOf(bot, "memory", name), stampOf(info)]]),
    });
  const skills = join(WORKSPACE, botFolder(bot), PATHS.skills.own);
  const folders =
    (await readdir(skills, { withFileTypes: true }).catch(absent)) ?? [];
  for (const folder of folders) {
    if (!folder.isDirectory() || folder.name.startsWith(".")) continue;
    const stamps = new Map<string, string>();
    for await (const file of walkFiles(join(skills, folder.name), {
      strict: true,
    })) {
      const info = await stat(file).catch(absent);
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

/**
 * The text of each file, where it is text the app keeps (BOT_LESSON.fileChars). One gone since
 * it was listed is left out; one that cannot be read throws, rather than reading as not text.
 */
async function readKept(stamps: Map<string, string>): Promise<KeptFiles> {
  const kept: KeptFiles = { files: {}, unheld: [] };
  const text = new TextDecoder("utf-8", { fatal: true });
  for (const path of stamps.keys()) {
    const bytes = await readFile(join(WORKSPACE, path)).catch(absent);
    if (!bytes) continue;
    let words: string | null = null;
    // More than four bytes a character is past the limit without decoding it
    if (bytes.length <= BOT_LESSON.fileChars * 4) {
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
  busy.set(bot, (busy.get(bot) ?? 0) + 1);
  if (busy.get(bot) !== 1 && held.has(bot)) return;
  try {
    held.set(bot, await readAll(bot, held.get(bot)));
  } catch (cause) {
    // What was held stays; the command runs, and noteKept says what it could not read
    logger.error(`${bot}: reading what it keeps`, cause);
  }
}

/**
 * After a command: each thing whose files differ from what was held is noted as a lesson of
 * `threadId`'s job, and becomes what is held. Called once for every `holdKept`, failed command
 * or not. What cannot be read or written is logged, and what was held stays, so the change is
 * noted by a later command that can read it: the command it followed stands.
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

/** One thing as it stands on disk now, whole; null when it is not there. */
async function readItem(
  bot: string,
  kind: LessonKind,
  name: string,
): Promise<Item | null> {
  const item = (await onDisk(bot)).get(keyOf(kind, name));
  return item ? { ...item, kept: await readKept(item.stamps) } : null;
}

/** Whether the thing stands, at `now`, as the lesson's job left it, in every file the job changed. */
function asLeft(row: LessonRow, now: KeptFiles | null): boolean {
  if (!row.after || !now) return !row.after && !now;
  const has = (kept: KeptFiles, path: string) =>
    path in kept.files || kept.unheld.includes(path);
  const left = row.after;
  const same = pathsOf(row).every(
    (path) =>
      textAt(left, path) === textAt(now, path) &&
      has(left, path) === has(now, path),
  );
  // Written new, it goes whole: nothing may have joined it since
  if (!row.before)
    return (
      same &&
      Object.keys(now.files).length + now.unheld.length ===
        Object.keys(left.files).length + left.unheld.length
    );
  return same;
}

/**
 * Puts one lesson back: each file the job changed as it found it, or the thing gone when the job
 * wrote it new. Only while it still stands as the job left it — a later change, the bot's or the
 * user's, would be lost — and only inside that thing's own file or folder, as it resolves on disk.
 * A file the app kept no text of cannot be brought back, and the answer names it.
 */
export async function undoLesson(id: number): Promise<string> {
  const row = await findLesson(id);
  if (!row) publicError("That lesson is gone.");
  if (row.undoneAt) publicError("It is already put back.");
  if (/[/\\]/.test(row.name) || row.name === "." || row.name === "..")
    publicError("That lesson names something that is not one note or skill.");
  const root = await insideWorkspace(rootOf(row.bot, row.kind, row.name));
  if (!root) publicError("That lesson names a place outside the workspace.");
  const where = new Map<string, string>();
  for (const path of [
    ...pathsOf(row),
    ...(row.before?.unheld ?? []),
    ...(row.after?.unheld ?? []),
  ]) {
    const full = await insideWorkspace(path);
    if (!full || (full !== root && !full.startsWith(`${root}${sep}`)))
      publicError("That lesson names files outside what it changed.");
    where.set(path, full);
  }
  const at = (path: string) => where.get(path) as string;

  const current = await readItem(row.bot, row.kind, row.name);
  if (!asLeft(row, current?.kept ?? null))
    publicError(
      "It has changed since, so it is left as it is. Put back the later change first.",
    );

  if (!row.before) {
    await rm(root, { recursive: true, force: true });
  } else {
    for (const path of pathsOf(row)) {
      const was = textAt(row.before, path);
      if (was !== null) {
        await mkdir(dirname(at(path)), { recursive: true });
        await writeFile(at(path), was);
      } else if (!row.before.unheld.includes(path)) {
        await rm(at(path), { recursive: true, force: true });
      }
    }
  }

  // Held as it now stands, this thing alone: a command of the bot's still running keeps what
  // it changed meanwhile to note, and does not note the undo as its own
  const now = await readItem(row.bot, row.kind, row.name);
  const bag = held.get(row.bot);
  if (bag && now) bag.set(keyOf(row.kind, row.name), now);
  else bag?.delete(keyOf(row.kind, row.name));
  await markLessonUndone(id);

  const lost = (row.before?.unheld ?? []).filter(
    (path) => !now?.stamps.has(path),
  );
  return lost.length
    ? `Put back, but for ${lost.join(", ")}: the app keeps no text of ${lost.length === 1 ? "it" : "them"}, so ${lost.length === 1 ? "it" : "they"} could not be brought back.`
    : "Put back.";
}
