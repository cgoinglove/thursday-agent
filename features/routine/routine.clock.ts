import { ROUTINE } from "@/config";
import { findJobBot } from "@/features/bot/bot.query";
import { startThread } from "@/features/bot/bot.runner";
import type { ThreadRoutine } from "@/features/bot/bot.schema";
import { markSeen } from "@/features/bot/thread.query";
import { toDate } from "@/lib/date-like";
import { logger } from "@/lib/logger";
import { publicError } from "@/lib/public-error";
import {
  claimRoutine,
  findRoutine,
  latestRun,
  listDueRoutines,
  listUnseenRunIds,
  noteWatched,
  type RoutineRow as Row,
} from "./routine.query";
import {
  type RoutineInput,
  type RoutineRun,
  scheduleText,
} from "./routine.schema";
import { runWatch } from "./routine.watch";

// What starts a routine. The clock only opens threads: from there a run is a job like any
// other (bot.runner), so its questions, stops and result reach the user the way a job's do —
// but for a stop the app makes, which ends a run rather than park it on Continue (room.query
// `endStopped`): left waiting, it would hold every later start below.

const isOpen = (run: RoutineRun | null | undefined) =>
  run?.status === "running" || run?.status === "waiting";

/**
 * Opens the routine's next thread; the caller has decided it may start. Endings of this
 * routine nobody opened are marked seen first: the run starting now stands in for them, so
 * a routine left alone for a month is one unread result and not thirty.
 */
async function open(
  routine: RoutineInput & { id: string },
  watch: ThreadRoutine["watch"] = null,
): Promise<string> {
  const last = await latestRun(routine.id);
  await markSeen(await listUnseenRunIds(routine.id));
  return startThread({
    bot: routine.bot,
    request: routine.request,
    label: routine.label,
    from: "user",
    routine: {
      id: routine.id,
      when: scheduleText(routine.schedule),
      last:
        last?.status === "done" && last.outcome
          ? { at: toDate(last.updatedAt), said: last.outcome }
          : null,
      watch,
    },
  });
}

/**
 * A watched routine's start (routine.watch): its watch runs, and a run opens only when what it
 * prints differs from what opened the last one, or when it fails, which its bot is told to fix.
 * Nothing changed: no run, no model, and the routine waits for its next time.
 */
async function startWatched(row: Row & { watch: string }): Promise<void> {
  const looked = await runWatch(row.watch);
  if ("failed" in looked) {
    await noteWatched(row.id, "failed");
    await open(row, { command: row.watch, failed: looked.failed });
    return;
  }
  if (looked.saw === row.watchSaw) {
    await noteWatched(row.id, "same");
    logger.info(`routine "${row.label}": its watch saw no change`);
    return;
  }
  await noteWatched(row.id, "changed", looked.saw);
  await open(row, {
    command: row.watch,
    now: looked.saw,
    before: row.watchSaw,
  });
}

/**
 * One look at what is due. Two things keep a due routine from starting, and they differ
 * in what becomes of the time it missed:
 * - its bot is gone or switched off: held, it starts once the bot is back;
 * - its last run is still running or waiting: skipped, runs are never stacked — but one
 *   that starts once has no later time to fall to, so it is held until that run closes.
 */
export async function startDueRoutines(now = new Date()) {
  const due = await listDueRoutines(now);
  if (!due.length) return;
  for (const row of due) {
    const bot = await findJobBot(row.bot);
    if (!bot || bot.disabled) continue;
    // Claiming switches a once-only routine off: a "Run now" still open at its moment
    // left it off with its own run never made
    if (row.schedule.kind === "once" && isOpen(await latestRun(row.id)))
      continue;
    // Moved on before anything opens, so a second tick reading the same row starts nothing
    if (!(await claimRoutine(row, now))) continue;
    if (isOpen(await latestRun(row.id))) {
      logger.info(`routine "${row.label}" skipped: its last run is still open`);
      continue;
    }
    const { watch } = row;
    await (watch ? startWatched({ ...row, watch }) : open(row)).catch((cause) =>
      logger.error(`routine "${row.label}" could not start`, cause),
    );
  }
}

/** The same start, asked for by a person; its next time stays where it was. */
export async function runRoutineNow(id: string): Promise<string> {
  const routine = await findRoutine(id);
  if (!routine) publicError("No such routine.");
  if (isOpen(routine.runs[0]))
    publicError("Its last run is still open. Answer or stop that one first.");
  return open(routine);
}

type Pinned = typeof globalThis & { __routineClock?: NodeJS.Timeout };

/** Wired once at boot (instrumentation). Pinned so a dev reload replaces the timer instead of adding one. */
export function startRoutineClock() {
  const pinned = globalThis as Pinned;
  if (pinned.__routineClock) clearInterval(pinned.__routineClock);
  let looking = false;
  pinned.__routineClock = setInterval(() => {
    // A slow look is not joined by a second one
    if (looking) return;
    looking = true;
    void startDueRoutines()
      .catch((cause) => logger.error("routine clock", cause))
      .finally(() => {
        looking = false;
      });
  }, ROUTINE.tickMs);
  pinned.__routineClock.unref();
}
