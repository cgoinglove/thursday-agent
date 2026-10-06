import { and, count, desc, eq, inArray, lte } from "drizzle-orm";
import { appEvents } from "@/app/api/events/app-event.server";
import { ROUTINE } from "@/config";
import { database } from "@/database/db";
import { routineTable, threadTable } from "@/database/tables";
import { findJobBot } from "@/features/bot/bot.query";
import { publicError } from "@/lib/public-error";
import {
  momentOf,
  nextRun,
  type Routine,
  type RoutineInput,
  type RoutineRun,
  type RoutineSchedule,
  sameSchedule,
  type WatchLast,
} from "./routine.schema";

// Routines and the threads they opened. A run is an ordinary thread carrying `routine_id`;
// nothing about how it went is kept here, it is read off the thread.

/** Every write in this file ends with this; the screen re-reads the list on it. */
const changed = () => appEvents.emit({ type: "routines" });

type Row = typeof routineTable.$inferSelect;
export type RoutineRow = Row;

/** Newest first. `limit` is a routine's sheet; the clock asks for the one latest. */
async function runsOf(id: string, limit: number): Promise<RoutineRun[]> {
  return database
    .select({
      id: threadTable.id,
      status: threadTable.status,
      outcome: threadTable.outcome,
      updatedAt: threadTable.updatedAt,
    })
    .from(threadTable)
    .where(eq(threadTable.routineId, id))
    .orderBy(desc(threadTable.createdAt))
    .limit(limit);
}

const withRuns = async (row: Row): Promise<Routine> => {
  const { createdAt: _, watchSaw: __, ...routine } = row;
  return { ...routine, runs: await runsOf(row.id, ROUTINE.runsShown) };
};

/** In the order they were made, so a row never moves under the pointer when it runs. */
export async function listRoutines(): Promise<Routine[]> {
  const rows = await database
    .select()
    .from(routineTable)
    .orderBy(routineTable.createdAt);
  return Promise.all(rows.map(withRuns));
}

export async function findRoutine(id: string): Promise<Routine | null> {
  const [row] = await database
    .select()
    .from(routineTable)
    .where(eq(routineTable.id, id));
  return row ? withRuns(row) : null;
}

/** By id, else by its name as someone would say it. Several of one name is answered with none. */
export async function resolveRoutine(ref: string): Promise<Routine | null> {
  const byId = await findRoutine(ref.trim());
  if (byId) return byId;
  const needle = ref.trim().toLowerCase();
  const named = (await listRoutines()).filter(
    (routine) => routine.label.toLowerCase() === needle,
  );
  return named.length === 1 ? named[0] : null;
}

/** The bot's own spelling, and refused when nobody of that name can take a job. */
async function botNamed(name: string): Promise<string> {
  const bot = await findJobBot(name);
  if (!bot || bot.disabled) publicError("Choose an enabled bot.");
  return bot.name;
}

/** A routine that starts once, switched on, has to have its moment ahead of it. */
function refuseSpentMoment(schedule: RoutineSchedule, enabled: boolean) {
  if (
    enabled &&
    schedule.kind === "once" &&
    momentOf(schedule.at) <= new Date()
  )
    publicError("That time has passed. Pick a later one.");
}

export async function createRoutine(input: RoutineInput): Promise<Routine> {
  const [{ total }] = await database
    .select({ total: count() })
    .from(routineTable);
  if (total >= ROUTINE.max)
    publicError(
      `There are already ${ROUTINE.max} routines. Delete one to make another.`,
    );
  refuseSpentMoment(input.schedule, true);
  const [row] = await database
    .insert(routineTable)
    .values({
      id: crypto.randomUUID(),
      ...input,
      bot: await botNamed(input.bot),
      nextRunAt: nextRun(input.schedule, new Date()),
    })
    .returning();
  changed();
  return withRuns(row);
}

/**
 * A new schedule, and switching it back on, both count from now: a routine left off for a
 * month does not owe a run the moment it is switched on. The schedule it already has, sent
 * again, is not a new one.
 */
export async function updateRoutine(
  id: string,
  patch: Partial<RoutineInput> & { enabled?: boolean },
): Promise<Routine | null> {
  const [was] = await database
    .select()
    .from(routineTable)
    .where(eq(routineTable.id, id));
  if (!was) return null;
  const schedule = patch.schedule ?? was.schedule;
  const restarts =
    Boolean(patch.schedule && !sameSchedule(patch.schedule, was.schedule)) ||
    (patch.enabled && !was.enabled);
  // only a moment being given or switched on is asked about: one waiting to start is due, not spent
  if (restarts) refuseSpentMoment(schedule, patch.enabled ?? was.enabled);
  const bot = patch.bot ? await botNamed(patch.bot) : was.bot;
  // A watch is its bot's command for its job: another job or bot, or a start that comes once,
  // leaves nothing for it to decide (routine.watch)
  const unwatched =
    (patch.request !== undefined && patch.request !== was.request) ||
    bot !== was.bot ||
    schedule.kind === "once";
  const [row] = await database
    .update(routineTable)
    .set({
      ...patch,
      ...(patch.bot ? { bot } : {}),
      ...(restarts ? { nextRunAt: nextRun(schedule, new Date()) } : {}),
      ...(unwatched && was.watch
        ? { watch: null, watchSaw: null, watchedAt: null, watchLast: null }
        : {}),
    })
    .where(eq(routineTable.id, id))
    .returning();
  changed();
  return withRuns(row);
}

/** Its runs stay: they are threads, and what they made is the user's. */
export async function deleteRoutine(id: string): Promise<boolean> {
  const removed = await database
    .delete(routineTable)
    .where(eq(routineTable.id, id))
    .returning({ id: routineTable.id });
  if (removed.length) changed();
  return removed.length > 0;
}

/** Switched on and past their time, oldest due first. */
export async function listDueRoutines(now: Date): Promise<Row[]> {
  return database
    .select()
    .from(routineTable)
    .where(
      and(eq(routineTable.enabled, true), lte(routineTable.nextRunAt, now)),
    )
    .orderBy(routineTable.nextRunAt);
}

/**
 * Moves a due routine on to its next time, and says whether this caller was the one to do
 * it; one that starts once has no next time and is switched off instead. The start it was
 * waiting for is part of the condition, so two ticks that read the same due row open one
 * thread between them.
 */
export async function claimRoutine(row: Row, now: Date): Promise<boolean> {
  const claimed = await database
    .update(routineTable)
    .set(
      row.schedule.kind === "once"
        ? { enabled: false }
        : { nextRunAt: nextRun(row.schedule, now) },
    )
    .where(
      and(
        eq(routineTable.id, row.id),
        eq(routineTable.enabled, true),
        eq(routineTable.nextRunAt, row.nextRunAt),
      ),
    )
    .returning({ id: routineTable.id });
  if (claimed.length) changed();
  return claimed.length > 0;
}

/**
 * Sets what the routine watches (routine_watch), with what it printed as it was set: the next
 * start opens a run only once that differs. Null watches nothing, and every start opens a run.
 * False when there is no such routine.
 */
export async function setRoutineWatch(
  id: string,
  watch: { command: string; saw: string } | null,
): Promise<boolean> {
  const set = await database
    .update(routineTable)
    .set({
      watch: watch?.command ?? null,
      watchSaw: watch?.saw ?? null,
      watchedAt: watch ? new Date() : null,
      watchLast: null,
    })
    .where(eq(routineTable.id, id))
    .returning({ id: routineTable.id });
  if (set.length) changed();
  return set.length > 0;
}

/** That the watch ran at a start and what it found; `saw`, what a change printed, is kept to compare with. */
export async function noteWatched(
  id: string,
  found: WatchLast,
  saw?: string,
): Promise<void> {
  await database
    .update(routineTable)
    .set({
      watchedAt: new Date(),
      watchLast: found,
      ...(saw !== undefined && { watchSaw: saw }),
    })
    .where(eq(routineTable.id, id));
  changed();
}

/** The latest run, whatever became of it. */
export async function latestRun(id: string): Promise<RoutineRun | null> {
  return (await runsOf(id, 1))[0] ?? null;
}

/** Endings of this routine nobody has opened, which the run about to start stands in for. */
export async function listUnseenRunIds(id: string): Promise<string[]> {
  const rows = await database
    .select({ id: threadTable.id })
    .from(threadTable)
    .where(
      and(
        eq(threadTable.routineId, id),
        eq(threadTable.seen, false),
        inArray(threadTable.status, ["done", "cancelled"]),
      ),
    );
  return rows.map((row) => row.id);
}
