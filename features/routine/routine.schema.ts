import * as z from "zod";
import { ROUTINE } from "@/config";
import { DateLikeSchema } from "@/lib/date-like";

/**
 * A routine is a job that starts by itself: who runs it, what to do, and when. Each time it
 * is due it opens an ordinary thread (bot.runner startThread), so everything after the start
 * — questions, stops, the result reaching a call — is the thread's.
 */

/** 1 is Monday, 7 is Sunday (ISO), so a week reads the same in every locale. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

const TimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "A time is HH:MM, 00:00 to 23:59");

/** "YYYY-MM-DD HH:MM" in this machine's own time, read as a date. */
export function momentOf(at: string): Date {
  const [day, time] = at.split(" ");
  const [year, month, date] = day.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, date, hours, minutes);
}

const MOMENT = /^\d{4}-\d\d-\d\d ([01]\d|2[0-3]):[0-5]\d$/;

const MomentSchema = z
  .string()
  .regex(MOMENT, 'A moment is "YYYY-MM-DD HH:MM"')
  // a month or a day the calendar does not have rolls over into another when read
  .refine((at) => {
    if (!MOMENT.test(at)) return true;
    const read = momentOf(at);
    return (
      read.getMonth() === Number(at.slice(5, 7)) - 1 &&
      read.getDate() === Number(at.slice(8, 10))
    );
  }, "There is no such day");

/**
 * When it starts, in this machine's own time. Three kinds and no cron string: a model fills
 * any of them without a syntax to get wrong, and the screen draws each without parsing.
 * One that starts `once` switches itself off as it starts (routine.query claimRoutine).
 */
export const RoutineScheduleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("once"),
    at: MomentSchema,
  }),
  z.object({
    kind: z.literal("daily"),
    time: TimeSchema,
    days: z
      .array(z.number().int().min(1).max(7))
      .min(1, "Pick at least one day")
      .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
  }),
  z.object({
    kind: z.literal("every"),
    hours: z
      .number()
      .int()
      .min(ROUTINE.minHours, `No more often than every ${ROUTINE.minHours}h`)
      .max(24 * 7),
  }),
]);
export type RoutineSchedule = z.infer<typeof RoutineScheduleSchema>;

export const RoutineInputSchema = z.object({
  bot: z.string().trim().min(1, "Pick a bot"),
  label: z.string().trim().min(1, "Give it a name").max(80),
  request: z.string().trim().min(1, "Say what it should do"),
  schedule: RoutineScheduleSchema,
});
export type RoutineInput = z.infer<typeof RoutineInputSchema>;

/** The latest thread a routine opened, as its row and its sheet draw it. */
const RoutineRunSchema = z.object({
  id: z.string(),
  status: z.enum(["running", "waiting", "done", "cancelled"]),
  outcome: z.string().nullable(),
  updatedAt: DateLikeSchema,
});
export type RoutineRun = z.infer<typeof RoutineRunSchema>;

const RoutineSchema = RoutineInputSchema.extend({
  id: z.string(),
  enabled: z.boolean(),
  nextRunAt: DateLikeSchema,
  /** The command its bot watches with (routine_watch); null when every start opens a run. */
  watch: z.string().nullable(),
  /** When the watch last ran at a start. */
  watchedAt: DateLikeSchema.nullable(),
  /** Newest first, at most `ROUTINE.runsShown`. */
  runs: z.array(RoutineRunSchema),
});
export type Routine = z.infer<typeof RoutineSchema>;

/** A weekday's short name, Monday first as `WEEKDAYS` counts them. */
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * "Once · Sep 21 20:00", "Daily 09:00 · Mon–Fri", "Mon 10:00", "Every 6 hours": the one
 * spelling, on screen and to a model.
 */
export function scheduleText(schedule: RoutineSchedule): string {
  if (schedule.kind === "once") {
    const [day, time] = schedule.at.split(" ");
    const [, month, date] = day.split("-").map(Number);
    return `Once · ${MONTH_NAMES[month - 1]} ${date} ${time}`;
  }
  if (schedule.kind === "every")
    return schedule.hours === 1
      ? "Every hour"
      : `Every ${schedule.hours} hours`;
  const { days, time } = schedule;
  if (days.length === 7) return `Daily ${time}`;
  if (days.length === 1) return `${DAY_NAMES[days[0] - 1]} ${time}`;
  const run = days.every((day, at) => at === 0 || day === days[at - 1] + 1);
  const names = run
    ? `${DAY_NAMES[days[0] - 1]}–${DAY_NAMES[days.at(-1)! - 1]}`
    : days.map((day) => DAY_NAMES[day - 1]).join(" ");
  return `Daily ${time} · ${names}`;
}

/**
 * Whether two schedules start the same runs, whatever order the days were picked in: the
 * one kept, and the same one picked again, which changes nothing.
 */
export function sameSchedule(a: RoutineSchedule, b: RoutineSchedule): boolean {
  if (a.kind === "once") return b.kind === "once" && a.at === b.at;
  if (a.kind === "every") return b.kind === "every" && a.hours === b.hours;
  const days = (list: number[]) => [...list].sort((x, y) => x - y).join();
  return (
    b.kind === "daily" && a.time === b.time && days(a.days) === days(b.days)
  );
}

/**
 * The first start after `from`. A daily one is the next listed day at its time; an `every`
 * one counts from `from` itself, so a machine that slept through several starts owes one,
 * not all of them. A `once` one has its moment, passed or not.
 */
export function nextRun(schedule: RoutineSchedule, from: Date): Date {
  if (schedule.kind === "once") return momentOf(schedule.at);
  if (schedule.kind === "every")
    return new Date(from.getTime() + schedule.hours * 3_600_000);
  const [hours, minutes] = schedule.time.split(":").map(Number);
  for (let ahead = 0; ahead <= 7; ahead++) {
    const at = new Date(from);
    at.setDate(at.getDate() + ahead);
    at.setHours(hours, minutes, 0, 0);
    // getDay: 0 is Sunday
    const day = at.getDay() === 0 ? 7 : at.getDay();
    if (at > from && schedule.days.includes(day)) return at;
  }
  // Unreachable: `days` is never empty, so one of eight days ahead matches
  return new Date(from.getTime() + 86_400_000);
}
