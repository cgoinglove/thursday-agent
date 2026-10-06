"use server";

import * as z from "zod";
import { serverAction } from "@/lib/protocol/server-action";
import { publicError } from "@/lib/public-error";
import { runRoutineNow } from "./routine.clock";
import {
  createRoutine,
  deleteRoutine,
  findRoutine,
  setRoutineWatch,
  updateRoutine,
} from "./routine.query";
import { RoutineInputSchema } from "./routine.schema";

export const createRoutineAction = serverAction(async (input: unknown) => {
  const routine = await createRoutine(RoutineInputSchema.parse(input));
  return { id: routine.id };
});

/** Any of its fields, or the switch. */
export const updateRoutineAction = serverAction(
  async (id: string, patch: unknown) => {
    const parsed = RoutineInputSchema.partial()
      .extend({ enabled: z.boolean().optional() })
      .parse(patch);
    if (!(await updateRoutine(id, parsed))) publicError("Routine not found");
  },
);

export const deleteRoutineAction = serverAction(async (id: string) => {
  if (!(await deleteRoutine(id))) publicError("Routine not found");
});

export const runRoutineNowAction = serverAction(async (id: string) => ({
  threadId: await runRoutineNow(id),
}));

/** Settings › Routines' Stop watching: every start opens a run again, until its bot sets a watch. */
export const stopWatchingAction = serverAction(async (id: string) => {
  if (!(await findRoutine(id))) publicError("Routine not found");
  await setRoutineWatch(id, null);
});
