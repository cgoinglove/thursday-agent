import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { appEvents } from "@/app/api/events/app-event.server";
import { BOT_LESSON } from "@/config";
import { database } from "@/database/db";
import { botLessonTable as lesson } from "@/database/tables";
import { listingLine } from "./bot.memory";
import type { BotLesson, KeptFiles, LessonKind } from "./bot.schema";

/**
 * What bots kept for themselves, as rows (features/bot/bot.lesson writes them from what it
 * found on disk). A lesson is read by the job it was kept in and on the bot's page, and both
 * hear of it: the room through `threads`, Settings › Bots through `bots`.
 */

export type LessonRow = typeof lesson.$inferSelect;

const changed = () => {
  appEvents.emit({ type: "threads" });
  appEvents.emit({ type: "bots" });
};

/**
 * Notes that `bot` changed one thing it keeps, in one job. Folded into the row that job
 * already has for it while that row is not put back and ends where this change begins, so a
 * job that writes a file three times shows one lesson; a change that puts it back as that
 * row began leaves nothing. Otherwise a row of its own.
 */
export async function noteLesson(input: {
  bot: string;
  thread: { id: string; label: string } | null;
  kind: LessonKind;
  name: string;
  before: KeptFiles | null;
  after: KeptFiles | null;
}): Promise<void> {
  await database.transaction(async (tx) => {
    const [last] = await tx
      .select()
      .from(lesson)
      .where(
        and(
          eq(lesson.bot, input.bot),
          eq(lesson.kind, input.kind),
          eq(lesson.name, input.name),
          input.thread
            ? eq(lesson.threadId, input.thread.id)
            : isNull(lesson.threadId),
          isNull(lesson.undoneAt),
        ),
      )
      .orderBy(desc(lesson.id))
      .limit(1);
    if (last && sameKept(last.after, input.before)) {
      if (sameKept(last.before, input.after)) {
        await tx.delete(lesson).where(eq(lesson.id, last.id));
      } else {
        await tx
          .update(lesson)
          .set({ after: input.after, updatedAt: new Date() })
          .where(eq(lesson.id, last.id));
      }
      return;
    }
    await tx.insert(lesson).values({
      bot: input.bot,
      threadId: input.thread?.id ?? null,
      threadLabel: input.thread?.label ?? "",
      kind: input.kind,
      name: input.name,
      before: input.before,
      after: input.after,
    });
  });
  changed();
}

/** One job's lessons, oldest first, or one bot's, newest first (BOT_LESSON.listed). */
export async function listLessons(
  by: { thread: string } | { bot: string },
): Promise<BotLesson[]> {
  const rows =
    "thread" in by
      ? await database
          .select()
          .from(lesson)
          .where(eq(lesson.threadId, by.thread))
          .orderBy(lesson.id)
      : await database
          .select()
          .from(lesson)
          .where(eq(lesson.bot, by.bot))
          .orderBy(desc(lesson.id))
          .limit(BOT_LESSON.listed);
  return rows.map(toLesson);
}

export async function findLesson(id: number): Promise<LessonRow | undefined> {
  const [row] = await database.select().from(lesson).where(eq(lesson.id, id));
  return row;
}

export async function markLessonUndone(id: number): Promise<void> {
  await database
    .update(lesson)
    .set({ undoneAt: new Date() })
    .where(eq(lesson.id, id));
  changed();
}

/**
 * Lessons last changed before `before` (config HISTORY_KEEP), with the text they hold of each
 * file. What they changed stays on disk as it is; only putting it back goes with them.
 */
export async function deleteOldLessons(before: Date): Promise<number> {
  const gone = await database
    .delete(lesson)
    .where(lt(lesson.updatedAt, before))
    .returning({ id: lesson.id });
  if (gone.length) changed();
  return gone.length;
}

/** Whether two holds of one thing are the same files with the same text. */
export function sameKept(a: KeptFiles | null, b: KeptFiles | null): boolean {
  if (!a || !b) return a === b;
  const paths = Object.keys(a.files);
  return (
    paths.length === Object.keys(b.files).length &&
    paths.every((path) => a.files[path] === b.files[path]) &&
    [...a.unheld].sort().join("\n") === [...b.unheld].sort().join("\n")
  );
}

function toLesson(row: LessonRow): BotLesson {
  const now = row.after ?? row.before;
  // Lines with words on them: a blank line moved is no change worth a number
  const lines = (kept: KeptFiles | null) =>
    Object.values(kept?.files ?? {}).flatMap((text) =>
      text.split("\n").filter((line) => line.trim()),
    );
  const { added, removed } = lineChange(lines(row.before), lines(row.after));
  // A skill is told by its SKILL.md; a memory file by its own first line
  const main = Object.entries(now?.files ?? {}).find(
    ([path]) => row.kind === "memory" || path.endsWith("/SKILL.md"),
  );
  return {
    id: row.id,
    bot: row.bot,
    threadId: row.threadId,
    threadLabel: row.threadLabel,
    kind: row.kind,
    name: row.name,
    line: (main && listingLine(main[1])) || row.name,
    change: !row.before ? "added" : !row.after ? "removed" : "changed",
    added,
    removed,
    text: shown(main?.[1] ?? ""),
    at: row.updatedAt,
    undoneAt: row.undoneAt,
  };
}

/** A file's text as a lesson's row opens to, its lines kept, cut at BOT_LESSON.shownChars. */
const shown = (text: string) =>
  text.length > BOT_LESSON.shownChars
    ? `${text.slice(0, BOT_LESSON.shownChars).trimEnd()}\n…`
    : text;

/** Lines in `after` that `before` lacks, and the other way, counted as a multiset. */
function lineChange(before: string[], after: string[]) {
  const counts = new Map<string, number>();
  for (const line of before) counts.set(line, (counts.get(line) ?? 0) + 1);
  let added = 0;
  for (const line of after) {
    const left = counts.get(line) ?? 0;
    if (left > 0) counts.set(line, left - 1);
    else added += 1;
  }
  let removed = 0;
  for (const left of counts.values()) removed += left;
  return { added, removed };
}
