import { listLessons } from "@/features/bot/lesson.query";
import { serverRoute } from "@/lib/protocol/server-route";
import { publicError } from "@/lib/public-error";

/**
 * What bots kept for themselves (bot.lesson): one job's, `?thread=`, oldest first, or one bot's,
 * `?bot=`, newest first. Under `threads`, so the room's open job re-reads it as the bot looks
 * back; Settings › Bots re-reads it on `bots`. Read only: a lesson is put back through bot.action.
 */
export const GET = serverRoute(async (request) => {
  const query = new URL(request.url).searchParams;
  const thread = query.get("thread")?.trim();
  const bot = query.get("bot")?.trim();
  if (thread) return listLessons({ thread });
  if (bot) return listLessons({ bot });
  publicError("Whose lessons?");
});
