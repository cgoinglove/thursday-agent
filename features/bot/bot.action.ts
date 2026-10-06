"use server";

import * as z from "zod";
import { BOT_ROSTER } from "@/config";
import { textModelProviderSchema } from "@/features/ai/model.schema";
import { removeBotFolder } from "@/features/workspace/workspace";
import { serverAction } from "@/lib/protocol/server-action";
import { publicError } from "@/lib/public-error";
import { undoLesson } from "./bot.lesson";
import {
  clearOwnLine,
  countBots,
  createBot,
  deleteBot,
  findJobBot,
  updateBot,
  writeBotMemoryOn,
} from "./bot.query";
import {
  answerThread,
  askCompact,
  cancelRunningThreads,
  cancelThread,
  removeFinishedThreads,
  removeThread,
  startThread,
} from "./bot.runner";
import { BotFormSchema, labelOfWords } from "./bot.schema";
import { findBotSeed } from "./bot.seed";
import { acceptRoomRelays, withdrawDelivery } from "./room.query";
import { aboutFile, readFileThread, tellFileThread } from "./thread.file";
import { markSeen, resolveThread } from "./thread.query";

export const createBotAction = serverAction(async (input: unknown) => {
  const form = BotFormSchema.parse(input);
  const bot = await createBot(form);
  if (!bot) publicError(`"${form.name}" already exists`);
  return { name: bot.name };
});

export const updateBotAction = serverAction(
  async (name: string, patch: unknown) => {
    const parsed = BotFormSchema.partial().parse(patch);
    if (!(await updateBot(z.string().parse(name), parsed)))
      publicError("Bot not found");
  },
);

/** The user clears the line a bot wrote after its description (self.tool). */
export const clearOwnLineAction = serverAction(async (name: string) => {
  if (!(await clearOwnLine(z.string().parse(name))))
    publicError("Bot not found");
});

/** One seed bot to create; the model fields are optional and only count as a pair. */
const SeedPickSchema = z.object({
  name: z.string().trim().min(1).max(80),
  provider: textModelProviderSchema.nullish(),
  model: z.string().trim().min(1).max(80).nullish(),
});

/**
 * Creates seed bots (bot.seed). A taken name is skipped, not an error, and seeds past
 * BOT_ROSTER.max are left out in list order: a key saved on the call screen offers every
 * seed to a roster that may already be nearly full.
 * No model is resolved here: a half pick (provider or id alone) is emptied by
 * `createBot` and the bot runs on the app default at run time.
 */
export const createSeedBotsAction = serverAction(async (picks: unknown) => {
  const wanted = SeedPickSchema.array().max(20).parse(picks);
  const room = BOT_ROSTER.max - (await countBots());

  const created: string[] = [];
  for (const pick of wanted) {
    if (created.length >= room) break;
    const seed = findBotSeed(pick.name);
    if (!seed) continue;
    const bot = await createBot({
      name: seed.name,
      description: seed.description,
      systemPrompt: seed.systemPrompt,
      icon: seed.icon,
      provider: pick.provider,
      model: pick.model,
      toolIds: [],
    });
    if (bot) created.push(bot.name);
  }
  return { created };
});

export const deleteBotAction = serverAction(async (name: string) => {
  const bot = z.string().parse(name);
  if (!(await deleteBot(bot))) publicError("Bot not found");
  // The row is not the whole bot: what it kept is on disk under its name
  await removeBotFolder(bot);
});

/** Switched off, no bot is shown its own memory. What is already written stays on disk. */
export const setBotMemoryOnAction = serverAction(async (on: unknown) => {
  await writeBotMemoryOn(on === true);
});

// Threads are opened by the `delegate` tool during a call, or here when the user
// hands one over from the screen. Each returns at once, the run itself continues
// as promises held by bot.runner.

/** Takes back words the user stepped in with, before the bot reads them (room.query withdrawDelivery). */
export const withdrawStepInAction = serverAction(
  async (threadId: unknown, key: unknown) => {
    const gone = await withdrawDelivery(
      z.string().min(1).parse(threadId),
      z.string().min(1).parse(key),
    );
    if (!gone) publicError("It has already read that.");
  },
);

/**
 * Hands a bot a job from the screen, with no call in the room. The typed message
 * is the whole request — there is no conversation to draw the rest from, which is
 * why the box asks for a sentence rather than a word.
 */
export const startThreadAction = serverAction(
  async (bot: string, request: string) => {
    const said = z.string().parse(request).trim();
    if (!said) publicError("Nothing to hand over.");
    return handOver(bot, said, said);
  },
);

/**
 * A note about a file, to the thread that made it (thread.file); `from` is the thread the
 * screen opened the file from, when it knows one.
 */
export const tellFileThreadAction = serverAction(
  async (path: unknown, note: unknown, from?: unknown) => {
    const said = z.string().parse(note).trim();
    if (!said) publicError("Nothing to tell it.");
    return tellFileThread(
      z.string().min(1).parse(path),
      said,
      z.string().nullish().parse(from) ?? null,
    );
  },
);

/** A file handed to a bot as a new job, for when no thread holds it (thread.file `none`). */
export const handFileAction = serverAction(
  async (bot: unknown, path: unknown, note: unknown) => {
    const said = z.string().parse(note).trim();
    if (!said) publicError("Nothing to hand over.");
    const file = z.string().min(1).parse(path);
    if ((await readFileThread(file)).state === "gone")
      publicError("This file is no longer on disk.");
    return handOver(bot, aboutFile(file, said), said);
  },
);

/** A new job from the screen; its label is read off the user's own words. */
async function handOver(bot: unknown, request: string, words: string) {
  // Resolved as a delegated job is, so an install with no bots still has its worker
  const worker = await findJobBot(z.string().parse(bot));
  if (!worker || worker.disabled)
    publicError(`No enabled bot called "${bot}".`);
  const label = labelOfWords(words);
  const id = await startThread({
    bot: worker.name,
    request,
    label,
    from: "user",
  });
  return { id, label, bot: worker.name };
}

export const answerThreadAction = serverAction(
  async (ref: string, answer: string, recipient?: string, replyTo?: string) => {
    const thread = await resolveThread(z.string().parse(ref));
    if (!thread) publicError(`No job called "${ref}".`);
    const said = z.string().parse(answer).trim();
    if (!said) publicError("Nothing to tell it.");
    await answerThread(
      thread.id,
      said,
      "user",
      z.string().nullish().parse(recipient) ?? undefined,
      z.string().nullish().parse(replyTo) ?? undefined,
    );
    return { id: thread.id, label: thread.label, status: "running" as const };
  },
);

/** The user asks a bot's desk in a thread to summarize itself at its next step (bot.runner askCompact). */
export const compactThreadAction = serverAction(
  async (id: unknown, bot: unknown) => {
    askCompact(z.string().min(1).parse(id), z.string().min(1).parse(bot));
  },
);

export const cancelThreadAction = serverAction(async (ref: string) => {
  const thread = await resolveThread(z.string().parse(ref));
  if (!thread) publicError(`No job called "${ref}".`);
  await cancelThread(thread.id);
  return { id: thread.id, label: thread.label, status: "cancelled" as const };
});

/** Puts back one thing a bot kept for itself, as it was before its job changed it (bot.lesson). */
export const undoLessonAction = serverAction(async (id: unknown) => ({
  said: await undoLesson(z.number().int().parse(id)),
}));

/** The room's Stop all: every thread at work stops, as each one's Stop would stop it. */
export const cancelRunningThreadsAction = serverAction(async () => ({
  stopped: await cancelRunningThreads(),
}));

/** Marks threads as read by the user: opened on screen. Their relays are settled with them (thread.query markSeen). */
export const markSeenAction = serverAction(async (ids: string[]) => {
  await markSeen(ids.filter((id) => typeof id === "string" && id));
});

export const deleteThreadAction = serverAction(async (id: string) => {
  if (!(await removeThread(z.string().parse(id))))
    publicError("Thread not found");
});

/** Empties the log of what is over. Running and waiting jobs are not touched. */
export const clearFinishedThreadsAction = serverAction(async () => {
  return { removed: await removeFinishedThreads() };
});

export const acceptThreadRelaysAction = serverAction(async (ids: unknown) => {
  await acceptRoomRelays(z.number().int().positive().array().parse(ids));
});
