"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { queryKey } from "@/app/api/query-key";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/notify";
import { undoLessonAction } from "@/features/bot/bot.action";
import type { BotLesson } from "@/features/bot/bot.schema";
import { BotMark } from "@/features/bot/components/bot-mark";
import type { BotRef } from "@/features/bot/thread.store";
import { shortAgo } from "@/lib/date-like";
import { useServerAction } from "@/lib/protocol/use-server-action";
import { revalidate, useServerRoute } from "@/lib/protocol/use-server-route";
import { cn } from "@/lib/utils";

/**
 * What bots kept for themselves (bot.lesson), as rows: what they did to a note or a skill of
 * their own, its first line, and Undo. At the end of the job they kept it in, and on the bot's
 * page. A row opens to the file as the job left it.
 */

/** What a lesson did, as a phrase after the bot's name. */
function lessonWords(lesson: BotLesson): string {
  if (lesson.kind === "memory")
    return lesson.change === "added"
      ? "kept a note"
      : lesson.change === "removed"
        ? "dropped a note"
        : "updated a note";
  return lesson.change === "added"
    ? `wrote the skill ${lesson.name}`
    : lesson.change === "removed"
      ? `removed its skill ${lesson.name}`
      : `changed its skill ${lesson.name}`;
}

/** What Undo asks before it puts a lesson back. */
function undoWords(lesson: BotLesson) {
  const skill = `the skill ${lesson.name}`;
  const thing = lesson.kind === "memory" ? `${lesson.bot}'s note` : skill;
  const title =
    lesson.kind === "memory"
      ? lesson.change === "added"
        ? "Forget this note?"
        : lesson.change === "removed"
          ? "Bring this note back?"
          : "Put this note back?"
      : lesson.change === "added"
        ? `Delete ${skill}?`
        : lesson.change === "removed"
          ? `Bring ${skill} back?`
          : `Put ${skill} back?`;
  const description =
    lesson.change === "added"
      ? `${lesson.bot} wrote it in this job. It is deleted, and the next job goes without it.`
      : lesson.change === "removed"
        ? `${thing.charAt(0).toUpperCase()}${thing.slice(1)} comes back as it was before this job.`
        : `${thing.charAt(0).toUpperCase()}${thing.slice(1)} goes back to how it was before this job.`;
  return {
    title,
    description,
    okText: lesson.change === "added" ? "Delete" : "Put back",
    destructive: lesson.change === "added",
  };
}

/** What one job's bots kept, under the job's last lines; nothing while they kept nothing. */
export function JobLessons({
  threadId,
  faces,
}: {
  threadId: string;
  /** The job's bots, so each row wears the face of the bot that kept it. */
  faces: BotRef[];
}) {
  const { data } = useServerRoute<BotLesson[]>(
    queryKey.lessons({ thread: threadId }),
  );
  if (!data?.length) return null;
  return (
    <div className="pt-2">
      <p className="px-1 pb-1 font-mono text-[10px] text-muted-foreground">
        Kept for next time
      </p>
      {data.map((lesson) => (
        <LessonRow
          key={lesson.id}
          lesson={lesson}
          face={
            faces.find((bot) => bot.name === lesson.bot) ?? {
              name: lesson.bot,
            }
          }
        />
      ))}
    </div>
  );
}

/** One bot's lessons, newest first, on its page above its memory. */
export function BotLessons({ bot }: { bot: string }) {
  const { data } = useServerRoute<BotLesson[]>(queryKey.lessons({ bot }));
  if (!data?.length) return null;
  return (
    <div className="pt-1">
      <div className="flex h-6 items-center">
        <span className="font-mono text-xs text-muted-foreground">Learned</span>
      </div>
      {data.map((lesson) => (
        <LessonRow key={lesson.id} lesson={lesson} />
      ))}
    </div>
  );
}

function LessonRow({ lesson, face }: { lesson: BotLesson; face?: BotRef }) {
  const [open, setOpen] = useState(false);
  const [undo, undoing] = useServerAction(undoLessonAction, {
    okMessage: ({ said }) => said,
    // Both lists it stands in: its job's and its bot's
    onOk: () => revalidate(queryKey.lessons({ bot: lesson.bot }).url),
  });
  const askUndo = async () => {
    const confirmed = await notify.confirm(undoWords(lesson));
    if (confirmed) undo(lesson.id);
  };

  return (
    <div className="border-t border-border/60 first-of-type:border-t-0">
      <div className="flex items-start gap-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg px-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
            {face && (
              <BotMark
                size={14}
                seed={face.name}
                color={face.icon?.color}
                shape={face.icon?.shape}
                outline={face.icon?.outline}
                paint={face.icon?.paint}
                notify={false}
                className="shrink-0"
              />
            )}
            <span className="truncate">
              {face
                ? `${lesson.bot} ${lessonWords(lesson)}`
                : lessonWords(lesson)}
              {!face && lesson.threadLabel && ` · ${lesson.threadLabel}`}
            </span>
            <span className="shrink-0 font-mono text-[10px] tabular-nums">
              {lesson.added > 0 && `+${lesson.added}`}
              {lesson.added > 0 && lesson.removed > 0 && " "}
              {lesson.removed > 0 && `−${lesson.removed}`}
            </span>
            {!face && (
              <span className="shrink-0 font-mono text-[10px]">
                {shortAgo(lesson.at)}
              </span>
            )}
          </span>
          <span
            className={cn(
              "flex min-w-0 items-center gap-1 text-[13px]",
              lesson.undoneAt && "text-muted-foreground line-through",
            )}
          >
            <ChevronRight
              className={cn(
                "size-3 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-90",
              )}
            />
            <span className="truncate">{lesson.line}</span>
          </span>
        </button>
        {lesson.undoneAt ? (
          <span className="shrink-0 pt-1 font-mono text-[10px] text-muted-foreground">
            put back
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            loading={undoing}
            onClick={askUndo}
            className="h-7 shrink-0 rounded-full px-2.5 text-[12px]"
          >
            Undo
          </Button>
        )}
      </div>
      {open && (
        <pre className="mb-2 ml-5 max-h-48 overflow-y-auto rounded-lg bg-muted/50 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
          {lesson.text || "(empty)"}
        </pre>
      )}
    </div>
  );
}
