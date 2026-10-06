import { type ToolSet, tool } from "ai";
import * as z from "zod";
import { PROMPT_LINE, ROUTINE } from "@/config";
import { TOOL_NAMES } from "@/features/ai/tools/tool-name";
import { listJobBots } from "@/features/bot/bot.query";
import { findThread } from "@/features/bot/thread.query";
import {
  createRoutine,
  deleteRoutine,
  listRoutines,
  resolveRoutine,
  setRoutineWatch,
  updateRoutine,
} from "@/features/routine/routine.query";
import {
  type Routine,
  RoutineInputSchema,
  type RoutineSchedule,
  RoutineScheduleSchema,
  scheduleText,
} from "@/features/routine/routine.schema";
import { runWatch } from "@/features/routine/routine.watch";
import { toDate, whenOf } from "@/lib/date-like";
import { isPublicError } from "@/lib/public-error";
import { clip } from "@/lib/utils";

const routineSpec = {
  description: `Routines: work that starts by itself, each one a bot, the work and a time — once at a moment, a time of day on chosen days, or every few hours. List them, make one, change one, or delete one. Every start opens a thread like one started by hand; its result reaches the conversation the same way. At most ${ROUTINE.max} exist.`,
  parameters: z.object({
    action: z.enum(["list", "create", "change", "delete"]),
    routine: z
      .string()
      .nullish()
      .describe("With change or delete: the routine, by its name or ID."),
    bot: z
      .string()
      .nullish()
      .describe(
        "With create: a name from the bot list. With change: a new bot.",
      ),
    label: z
      .string()
      .nullish()
      .describe(
        "With create: two or three words naming it, in the user's language. It names every thread the routine opens, on screen and out loud.",
      ),
    request: z
      .string()
      .nullish()
      .describe(
        "With create: the whole of the work, handed to the bot as written every time it starts. Nobody is there then to fill in what is missing, so everything it needs goes here, in the user's own language and words. Their request, never your reading of it.",
      ),
    at: z
      .string()
      .nullish()
      .describe(
        'Starts once, at this moment, "YYYY-MM-DD HH:MM" in the user\'s own time, then switches itself off. Count "in an hour" or "tomorrow at eight" from **Now**. Give one of `at`, `time` or `everyHours`.',
      ),
    time: z
      .string()
      .nullish()
      .describe(
        'Starts at this time of day, 24-hour "HH:MM" in the user\'s own time, on `days`. Give one of `at`, `time` or `everyHours`.',
      ),
    days: z
      .array(z.number().int().min(1).max(7))
      .nullish()
      .describe(
        "With `time`: the days it starts, 1 Monday to 7 Sunday. Omit for every day.",
      ),
    everyHours: z
      .number()
      .int()
      .nullish()
      .describe(
        `Starts again this many hours after it last started, ${ROUTINE.minHours} at least. Give one of \`at\`, \`time\` or \`everyHours\`.`,
      ),
    enabled: z
      .boolean()
      .nullish()
      .describe(
        "With change: false switches it off without deleting it, true back on.",
      ),
  }),
};

type Args = z.infer<typeof routineSpec.parameters>;

/** The schedule the arguments spell, none when they say nothing about time, or the line that says what is wrong. */
function scheduleOf(args: Args): RoutineSchedule | string | null {
  if ([args.at, args.time, args.everyHours].filter(Boolean).length > 1)
    return "Give one of `at`, `time` or `everyHours`, not two.";
  const spelled = args.at
    ? { kind: "once", at: args.at }
    : args.time
      ? {
          kind: "daily",
          time: args.time,
          days: args.days?.length ? args.days : [1, 2, 3, 4, 5, 6, 7],
        }
      : args.everyHours
        ? { kind: "every", hours: args.everyHours }
        : null;
  if (!spelled) return null;
  const parsed = RoutineScheduleSchema.safeParse(spelled);
  return parsed.success ? parsed.data : parsed.error.issues[0].message;
}

/** A routine as a model reads it: no ids but its own, and how its last run ended in a line. */
function told(routine: Routine) {
  const last = routine.runs[0];
  return {
    id: routine.id,
    label: routine.label,
    bot: routine.bot,
    when: scheduleText(routine.schedule),
    enabled: routine.enabled,
    ...(routine.enabled ? { next: whenOf(toDate(routine.nextRunAt)) } : {}),
    request: clip(routine.request, PROMPT_LINE.routineRequest),
    ...(last
      ? {
          lastRun: {
            thread: last.id,
            status: last.status,
            at: whenOf(toDate(last.updatedAt)),
            ...(last.outcome
              ? { outcome: clip(last.outcome, PROMPT_LINE.routineOutcome) }
              : {}),
          },
        }
      : {}),
  };
}

/** A refusal the domain raised is one line the model can act on; anything else is a bug and stays thrown. */
const refusal = (cause: unknown): string => {
  if (isPublicError(cause)) return cause.message;
  throw cause;
};

async function noSuchRoutine(ref: string | null | undefined): Promise<string> {
  const names = (await listRoutines()).map((one) => `"${one.label}"`);
  if (!names.length) return "There are no routines yet.";
  return ref
    ? `There is no single routine called "${ref}". The routines are: ${names.join(", ")}. Call again with one of those, or its ID.`
    : `Name the routine. The routines are: ${names.join(", ")}.`;
}

/** The call's hand on routines. A bot holds none: what starts by itself is the user's to set up. */
export function createRoutineTools() {
  return {
    [TOOL_NAMES.routine]: tool({
      description: routineSpec.description,
      inputSchema: routineSpec.parameters,
      execute: async (args: Args) => {
        if (args.action === "list")
          return { routines: (await listRoutines()).map(told) };

        const schedule = scheduleOf(args);
        if (typeof schedule === "string") return schedule;

        if (args.action === "create") {
          if (!schedule)
            return "Say when it starts: `at`, `time` (with `days`), or `everyHours`.";
          const input = RoutineInputSchema.safeParse({
            bot: args.bot ?? "",
            label: args.label ?? "",
            request: args.request ?? "",
            schedule,
          });
          if (!input.success)
            return `${input.error.issues[0].message}. Nothing was made — call again with bot, label, request and when.`;
          const names = (await listJobBots()).map((one) => one.name);
          if (
            !names.some(
              (name) => name.toLowerCase() === input.data.bot.toLowerCase(),
            )
          )
            return `There is no bot called "${input.data.bot}". The bots are: ${names.join(", ")}. Nothing was made — call again with one of those.`;
          const made = await createRoutine(input.data).catch(refusal);
          if (typeof made === "string") return made;
          const first = whenOf(toDate(made.nextRunAt));
          return {
            ...told(made),
            note:
              made.schedule.kind === "once"
                ? `${made.bot} starts "${made.label}" once, ${first}, and the routine then switches itself off. The start is a thread of its own, and its result reaches the conversation like any thread's.`
                : `${made.bot} starts "${made.label}" by itself, ${scheduleText(made.schedule)}, first ${first}. Each start is a thread of its own, and its result reaches the conversation like any thread's.`,
          };
        }

        const one = args.routine ? await resolveRoutine(args.routine) : null;
        if (!one) return await noSuchRoutine(args.routine);

        if (args.action === "delete") {
          await deleteRoutine(one.id);
          return `"${one.label}" is deleted and starts no more. The threads it already opened stay.`;
        }

        const patch = {
          ...(args.bot ? { bot: args.bot } : {}),
          ...(args.label?.trim() ? { label: args.label.trim() } : {}),
          ...(args.request?.trim() ? { request: args.request.trim() } : {}),
          ...(schedule ? { schedule } : {}),
          ...(typeof args.enabled === "boolean"
            ? { enabled: args.enabled }
            : {}),
        };
        if (!Object.keys(patch).length)
          return "Nothing to change was given: bot, label, request, when, or enabled.";
        const changed = await updateRoutine(one.id, patch).catch(refusal);
        if (typeof changed === "string") return changed;
        return changed ? told(changed) : await noSuchRoutine(args.routine);
      },
    }),
  };
}

/**
 * `routine_watch`: held by the bot a routine's run belongs to, in that run alone (load-tools),
 * so a routine is watched only by a command its own bot wrote while doing its job. The command
 * is run once as it is set, and a failing one is not kept.
 */
export async function createRoutineWatchTool(
  bot: string,
  threadId: string | null,
): Promise<ToolSet> {
  const thread = threadId ? await findThread(threadId) : undefined;
  const routineId = thread?.routineId;
  if (!routineId || thread.bot !== bot) return {};
  return {
    [TOOL_NAMES.routine_watch]: tool({
      description:
        "Set what this routine watches: a shell command run at each of its starts that prints what the routine waits on — a price, the free slots, whether a page changed — and prints the same while nothing worth a run has changed. A start whose command prints what it printed last opens no run and calls no model. The command runs once now, and what it prints comes back.",
      inputSchema: z.object({
        command: z
          .string()
          .nullish()
          .describe(
            "As bash runs it in the workspace. Empty stops watching, and every start opens a run.",
          ),
      }),
      execute: async ({ command }) => {
        const watch = command?.trim();
        if (!watch) {
          await setRoutineWatch(routineId, null);
          return "It watches nothing now: every start opens a run.";
        }
        const looked = await runWatch(watch);
        if ("failed" in looked)
          return `Not set: it failed (${looked.failed}). Fix the command and set it again.`;
        await setRoutineWatch(routineId, { command: watch, saw: looked.saw });
        return `Set. It prints now:\n${looked.saw || "(nothing)"}\nA start opens a run only once that changes.`;
      },
    }),
  };
}
