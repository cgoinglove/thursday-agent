import { type ToolSet, tool } from "ai";
import * as z from "zod";
import { BOT_WORK, THREAD_STATUS_LIMIT } from "@/config";
import { botWorkHead } from "@/features/ai/prompts/prompt-helper";
import { TOOL_NAMES } from "@/features/ai/tools/tool-name";
import { workHandle } from "@/features/bot/bot.schema";
import { RoomMessageSchema } from "@/features/bot/room.schema";
import { listBotWork, readBotAsk } from "@/features/bot/thread.query";
import { clip } from "@/lib/utils";

/**
 * The call's hands on threads: one small tool for each thing it does, every argument
 * required. One tool with an action and optional fields was what the backend model got
 * wrong — text left in the wrong field, a follow-up sent as new work — so the choice
 * is which tool to call, and nothing about a call is left to fill in or leave out.
 */
const THREAD_REF = z.string().describe("Its label or id.");

export const threadStartSpec = {
  description:
    "Start a new thread: hand work to a bot. Returns a receipt at once; the work runs in the background and its updates reach the conversation on their own.",
  parameters: z.object({
    bot: z.string().describe("A name from the bot list."),
    request: z
      .string()
      .describe(
        "The whole of the work. The bot cannot hear the call, so everything it needs goes here — names, paths, what the user actually asked for — in their own language and their own words: it is the only language the bot has, and whatever it writes comes back to them. **Their request, never your reading of it**: a condition, a caution or a smaller goal they did not say is how work comes back as the wrong thing. When their words leave a real choice open, ask them on the call and put the answer here.",
      ),
    // Required: two threads are often open at once and this prefixes every line of both on screen
    label: z
      .string()
      .describe(
        "Two or three words naming the thread, in the user's language. Used on screen and said out loud.",
      ),
  }),
};

export const threadTellSpec = {
  description:
    "Say something to a thread that exists. Its bot reads it with everything the thread already holds.",
  parameters: z.object({
    thread: THREAD_REF,
    words: z
      .string()
      .describe("What to tell its bot, in the user's language and words."),
  }),
};

export const threadAnswerSpec = {
  description: `Answer a question a bot asked the user. Only for a question that is waiting; anything else said to a thread is \`${TOOL_NAMES.thread_tell}\`.`,
  parameters: z.object({
    thread: THREAD_REF,
    bot: z.string().describe("The bot that asked."),
    answer: z.string().describe("The user's answer, in their words."),
  }),
};

export const threadStatusSpec = {
  description: `Read threads as they are now. "all" lists up to ${THREAD_STATUS_LIMIT}, running and waiting work before recent endings; a label or an id reads that one whole, with its result and any question waiting.`,
  parameters: z.object({
    thread: z.string().describe('"all", or one thread by its label or its id.'),
  }),
};

export const threadCancelSpec = {
  description:
    'Stop a thread now: its bot stops where it is. The thread is kept, and saying more to it later carries it on. "all" stops every thread at work.',
  parameters: z.object({
    thread: z.string().describe('Its label or id, or "all".'),
  }),
};

export const threadShowSpec = {
  description:
    "Put a thread in front of the user on their screen: the file it made, or the thread itself when it made none. Showing it also counts as them having seen its result.",
  parameters: z.object({ thread: THREAD_REF }),
};

export const threadSeenSpec = {
  description:
    "Mark a thread's result as seen by the user. It leaves the work waiting on them.",
  parameters: z.object({ thread: THREAD_REF }),
};

/**
 * The coordinator's one way out (bot.run): work to a bot, or a question to the user. Thursday
 * takes nothing else, since the user sees who is working and the result is the turn's last words.
 */
export const sendMessageSpec = {
  description:
    "Hand part of the job to another bot, or put a question to the user through Thursday; the receipt comes back at once. A bot answers with the last words of its turn, which reach you later as a new message and start your next turn. Your own result reaches the user as the last words of your turn, so Thursday takes only a question that needs their answer.",
  parameters: RoomMessageSchema.extend({
    kind: RoomMessageSchema.shape.kind.describe(
      "question to Thursday when only the user can answer: it ends your turn, and you continue when the answer arrives. message to a bot.",
    ),
    options: RoomMessageSchema.shape.options.describe(
      "With a question, offer concise answer choices when useful. Omit for an open-ended question; the user can always type their own answer.",
    ),
    to: z
      .string()
      .trim()
      .min(1)
      .describe(
        "A bot from the roster, or Thursday for a question to the user.",
      ),
    text: z
      .string()
      .trim()
      .min(1)
      .describe(
        "Write the message and include the context the recipient needs. **What the user asked, never your reading of it**: a condition, a caution or a smaller goal they did not say is how work comes back as the wrong thing. A question to Thursday is put to the user word for word, on screen, on their phone and read aloud: write it to them.",
      ),
    why: z
      .string()
      .trim()
      .min(1)
      .describe(
        "What you need from them, in a few words, written for the user to read: they see who was brought in and what for.",
      ),
    after: RoomMessageSchema.shape.after.describe(
      "Bots already working for you whose answers this work needs. It goes out with their answers attached once they are all back and you end the turn in which you read them, so hand it out now rather than holding it yourself. If an answer shows the work cannot go yet, send that bot more or ask the user in that turn, and it keeps waiting.",
    ),
  }),
};

const threadRecallSpec = {
  description:
    "Open one of your other threads whole: what you were asked there and your last words in full.",
  parameters: z.object({
    id: z
      .string()
      .describe("The id in brackets on its line under Your other threads."),
  }),
};

/**
 * A bot's hand on its own other threads (thread.query listBotWork), and everything about it
 * is here. Held only while the list in its prompt cut a line short: with nothing more to
 * read there is no tool to reach for. What is left is bounded rather than asked for: a
 * thread opens once a turn, `BOT_WORK.reads` of them at most, and only the ones on the list.
 */
export async function createThreadRecallTool(
  bot: string,
  except: string | null,
): Promise<ToolSet> {
  const work = await listBotWork(bot, except);
  const lines = [...work.open, ...work.recent];
  if (!lines.some((line) => line.cut)) return {};

  const opened = new Set<string>();
  return {
    [TOOL_NAMES.thread_recall]: tool({
      description: threadRecallSpec.description,
      inputSchema: threadRecallSpec.parameters,
      execute: async ({ id }) => {
        // The id as the line shows it, the whole one, or the label a model gives instead
        const ref = id
          .trim()
          .replace(/^\[|\]$/g, "")
          .toLowerCase();
        const line = lines.find(
          (one) =>
            ref.length >= 4 &&
            (one.id.startsWith(ref) || one.label.toLowerCase() === ref),
        );
        if (!line)
          return `No thread "${id}" on your list. The ids there: ${lines
            .filter((one) => one.cut)
            .map((one) => workHandle(one.id))
            .join(", ")}.`;
        if (!line.cut) return "Its line already shows all of it.";
        if (opened.has(line.id)) return "Already opened above, this turn.";
        if (opened.size >= BOT_WORK.reads)
          return `${BOT_WORK.reads} threads are open already this turn. Carry on with what you have.`;
        opened.add(line.id);

        const asked = await readBotAsk(bot, line);
        const said = line.said ?? "";
        return [
          botWorkHead(line, bot),
          asked ? `You were asked: ${clip(asked, BOT_WORK.asked)}` : "",
          `Your last words there:\n${
            said.length > BOT_WORK.readChars
              ? `${said.slice(0, BOT_WORK.readChars)}\n[Cut here; the files it names hold the rest.]`
              : said
          }`,
        ]
          .filter(Boolean)
          .join("\n\n");
      },
    }),
  };
}
