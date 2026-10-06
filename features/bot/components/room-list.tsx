"use client";

import { format, isThisYear, isToday, isYesterday } from "date-fns";
import {
  ChevronLeft,
  ChevronsRight,
  Loader2,
  Settings2,
  Square,
} from "lucide-react";
import {
  Fragment,
  type RefObject,
  useCallback,
  useMemo,
  useState,
} from "react";
import { queryKey } from "@/app/api/query-key";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/notify";
import { ShinyText } from "@/components/ui/shiny-text";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { refusedWords } from "@/features/ai/model.schema";
import { cancelRunningThreadsAction } from "@/features/bot/bot.action";
import {
  type Bot,
  DEFAULT_BOT,
  isAppStop,
  isUnread,
  needsThreadReply,
  standOf,
  THREAD_CONTINUE,
  type Thread,
  type ThreadStand,
} from "@/features/bot/bot.schema";
import { BotMark } from "@/features/bot/components/bot-mark";
import { BotRoster } from "@/features/bot/components/bot-roster";
import { useAnswerThread } from "@/features/bot/components/thread-reply";
import { RoutineMark } from "@/features/routine/components/routine-mark";
import { openSettings } from "@/features/settings/settings.store";
import { type DateLike, shortAgo, toDate } from "@/lib/date-like";
import { useServerAction } from "@/lib/protocol/use-server-action";
import { type ServerPages } from "@/lib/protocol/use-server-pages";
import { revalidate } from "@/lib/protocol/use-server-route";
import { cn, plainText, WAITING_INK } from "@/lib/utils";
import {
  lastSaid,
  screenActs,
  type ThreadView,
  useBotThreads,
  useRingingThreads,
} from "../thread.store";
import { FoldButton, TAB } from "./room-conversation";

/** The room open on its lists: what is happening now, and the history behind it. Split out of bot-room by subject; see it for the room as a whole. */

/**
 * What waits on the user's answer, newest first: the rows the folded pill grows, and the
 * write line holds while it is up and the pill has no room to. A job the call-back rings
 * for is on its card instead, and one notice is enough.
 */
export function useWaitingRows(): ThreadView[] {
  const threads = useBotThreads();
  const rung = useRingingThreads();
  return useMemo(
    () =>
      [...threads]
        .reverse()
        .filter(
          (thread) => !rung.includes(thread.id) && needsThreadReply(thread),
        ),
    [threads, rung],
  );
}

/** The room's two lists. */
export type RoomTab = "now" | "history";

/**
 * The two lists as pills, drawn like a thread's bot tabs, and the fold beside them; on Now, with
 * threads at work, Stop all before the fold.
 */
export function ListHeader({
  tab,
  current,
  working,
  onTab,
  onClose,
}: {
  tab: RoomTab;
  /** Rows on Now. */
  current: number;
  /** Threads at work on Now: what Stop all stops. */
  working: number;
  onTab: (tab: RoomTab) => void;
  onClose: () => void;
}) {
  const [stopAll, stopping] = useServerAction(cancelRunningThreadsAction, {
    onOk: ({ stopped }) => {
      revalidate(queryKey.threads);
      for (const one of stopped)
        screenActs.announce({ kind: "stopped", id: one.id, label: one.label });
    },
  });
  const askStopAll = async () => {
    const confirmed = await notify.confirm({
      title:
        working === 1
          ? "Stop the thread at work?"
          : `Stop the ${working} threads at work?`,
      description:
        "Each bot stops where it is. The threads are kept, and saying more to one carries it on. A thread waiting on your answer is left as it is.",
      okText: "Stop all",
      destructive: true,
    });
    if (confirmed) stopAll();
  };
  return (
    <div className="flex items-center gap-2 pt-3 pr-3.5 pb-1.5 pl-2.5">
      <Tabs
        value={tab}
        onValueChange={(value) => onTab(value as RoomTab)}
        className="gap-0"
      >
        <TabsList className="gap-1 rounded-none bg-transparent p-0 group-data-horizontal/tabs:h-auto">
          <TabsTrigger value="now" className={TAB}>
            Now
            {current > 0 && (
              <span className="font-mono text-[10px] font-normal text-muted-foreground tabular-nums">
                {current}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className={TAB}>
            History
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <span className="flex-1" />
      {tab === "now" && working > 0 && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          loading={stopping}
          onClick={askStopAll}
          className="h-7 shrink-0 gap-1.5 rounded-full px-2.5 text-[12px]"
        >
          {!stopping && <Square className="size-2.5 fill-current" />}
          Stop all
        </Button>
      )}
      <FoldButton onClick={onClose} />
    </div>
  );
}

/** A room that has never had a thread. The faces are already in the room's foot. */
export function Empty({ bots }: { bots?: Bot[] }) {
  return (
    <p className="px-6 pt-4 pb-5 text-center text-[12px] text-muted-foreground">
      {bots?.length
        ? "Nothing handed over yet — ask for something that takes a while."
        : `Thursday hands work to ${DEFAULT_BOT.name} until you make bots of your own in Settings › Bots.`}
    </p>
  );
}

/** Now with nothing on it, when the room has had threads: what ended is one tab over. */
export function Quiet() {
  return (
    <p className="px-6 pt-4 pb-5 text-center text-[12px] text-muted-foreground">
      Nothing running or waiting.
    </p>
  );
}

/**
 * Every thread that has ended, newest first, grouped by day. Pages arrive as the
 * end of the list scrolls into view (listThreadHistory).
 */
export function HistoryList({
  pages,
  threads,
  scroll,
  onPick,
}: {
  pages: ServerPages<Thread>;
  /** The ended threads among the loaded pages. */
  threads: ThreadView[];
  /** Where the list was left, restored when a thread opened from it closes. */
  scroll: RefObject<number>;
  onPick: (id: string) => void;
}) {
  const restore = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) node.scrollTop = scroll.current;
    },
    [scroll],
  );

  const days: { day: string; rows: ThreadView[] }[] = [];
  for (const thread of threads) {
    const day = dayOf(thread.updatedAt);
    const last = days.at(-1);
    if (last?.day === day) last.rows.push(thread);
    else days.push({ day, rows: [thread] });
  }

  return (
    <div
      ref={restore}
      onScroll={(event) => {
        scroll.current = event.currentTarget.scrollTop;
      }}
      // a list is scanned, not read: it keeps under a thread's height and scrolls
      className="flex max-h-[50vh] min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pt-1 pb-2 scrollbar-none"
    >
      {pages.error ? (
        <p className="px-2.5 py-3 text-[12px] text-destructive">
          {pages.error.message}
        </p>
      ) : pages.isLoading ? (
        // The shape of the shortest answer — a day and one row — so a short history
        // arrives without the card growing and then shrinking back
        <>
          <span className="flex h-6 items-center px-2.5 pt-1">
            <Skeleton className="h-2.5 w-16" />
          </span>
          <GhostRow />
        </>
      ) : (
        <>
          {days.map((group, at) => (
            <Fragment key={group.day}>
              <p
                className={cn(
                  "px-2.5 pb-1 font-mono text-[10px] text-muted-foreground",
                  at === 0 ? "pt-1" : "pt-3",
                )}
              >
                {group.day} · {group.rows.length}
              </p>
              {group.rows.map((thread) => (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  onPick={() => onPick(thread.id)}
                />
              ))}
            </Fragment>
          ))}
          {pages.hasMore ? (
            <div ref={pages.sentinelRef}>
              <GhostRow />
            </div>
          ) : (
            days.length === 0 && (
              <p className="px-6 pt-3 pb-4 text-center text-[12px] text-muted-foreground">
                Nothing has ended yet.
              </p>
            )
          )}
        </>
      )}
    </div>
  );
}

/** "today", "yesterday", "sep 14" — lower case, like the room's other group labels. */
function dayOf(value: DateLike): string {
  const date = toDate(value);
  if (isToday(date)) return "today";
  if (isYesterday(date)) return "yesterday";
  return format(date, isThisYear(date) ? "MMM d" : "MMM d, yyyy").toLowerCase();
}

/** An open thread's shape while a job no list holds is read: the header, then a few lines. */
export function ThreadLoading({
  onBack,
  onClose,
}: {
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to the list"
          className="shrink-0 rounded-md p-1 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronLeft className="size-4" />
        </button>
        <Skeleton className="size-5.5 shrink-0 rounded-md" />
        <span className="flex min-w-0 flex-1">
          <Skeleton className="h-3.5 w-2/5" />
        </span>
        <FoldButton onClick={onClose} />
      </div>
      <div className="flex flex-col gap-2 px-4 py-4">
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </>
  );
}

/** A row's shape while its page is on the way: the face, the label, the line. */
function GhostRow() {
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5">
      <Skeleton className="size-8 shrink-0 rounded-[10px]" />
      <span className="flex h-9 min-w-0 flex-1 flex-col justify-center gap-1.5">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-2.5 w-3/5" />
      </span>
    </div>
  );
}

/**
 * List sections in order, from the one rule (bot.schema `standOf`): this list holds what has not
 * ended, so a section here is either waiting on the user or working. What is over is the left
 * corner's, and after that the History tab's.
 */
const GROUPS: {
  id: ThreadStand;
  label: string;
}[] = [
  { id: "needsYou", label: "needs you" },
  { id: "working", label: "working" },
];

export function ThreadList({
  threads,
  onPick,
}: {
  threads: ThreadView[];
  onPick: (id: string) => void;
}) {
  const bucket = new Map<ThreadStand, ThreadView[]>();
  for (const thread of threads) {
    const stand = standOf(thread);
    const rows = bucket.get(stand);
    if (rows) rows.push(thread);
    else bucket.set(stand, [thread]);
  }

  return (
    // a list is scanned, not read: it keeps under a thread's height and scrolls
    <div className="flex max-h-[50vh] min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pt-1 pb-1 scrollbar-none">
      {GROUPS.map((group, at) => {
        const rows = bucket.get(group.id) ?? [];
        if (!rows.length) return null;
        return (
          <Fragment key={group.id}>
            <p
              className={cn(
                "px-2.5 pb-1 font-mono text-[10px] text-muted-foreground",
                at === 0 ? "pt-1" : "pt-3",
              )}
            >
              {group.label} · {rows.length}
            </p>
            {rows.map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                onPick={() => onPick(thread.id)}
              />
            ))}
          </Fragment>
        );
      })}
    </div>
  );
}

export function ThreadRow({
  thread,
  onPick,
  lines = 1,
}: {
  thread: ThreadView;
  onPick: () => void;
  /** Lines its second row may take: two where it has the write line's width, so a question keeps its end. */
  lines?: 1 | 2;
}) {
  const attention = needsThreadReply(thread);
  // secondLine runs plainText over the whole answer. Every sync rebuilds each ThreadView
  // (thread.store), so depend on the fields that change the line, not on `thread`.
  const last = thread.lines.at(-1);
  const line = useMemo(
    () => secondLine(thread),
    [
      thread.status,
      thread.outcome,
      thread.seen,
      thread.ask,
      thread.room.questions,
      last?.id,
    ],
  );
  const [answer, answering] = useAnswerThread();
  const [sending, setSending] = useState<string | null>(null);
  // What the user can answer from the row, without opening the thread: a bot's own choices where
  // it gave any, else the one Continue an app stop offers. The choices are already on the row a
  // question is read from, so a list that shows the question shows what to answer it with.
  const question = thread.room.questions[0];
  const options = question
    ? (question.options ?? [])
    : thread.status === "waiting" && isAppStop(thread.ask)
      ? (thread.ask?.options ?? [])
      : [];

  return (
    // The row is not itself a button: the option buttons cannot nest inside one.
    <div className="rounded-xl transition-colors hover:bg-muted/60">
      <button
        type="button"
        onClick={onPick}
        // Where the focus goes back to once its thread closes (use-focus-return)
        data-focus-home={`thread-${thread.id}`}
        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span
          className="relative flex size-8 shrink-0 items-center justify-center overflow-visible"
          title={thread.bot.name}
        >
          <BotMark
            size={32}
            seed={thread.bot.name}
            color={thread.bot.icon?.color}
            shape={thread.bot.icon?.shape}
            outline={thread.bot.icon?.outline}
            paint={thread.bot.icon?.paint}
            state={thread.status === "working" ? "thinking" : "idle"}
            notify={attention || isUnread(thread)}
            crossed={thread.status === "cancelled"}
          />
        </span>

        <span className="min-w-0 flex-1">
          {/* A question needs no word saying it is one: the dot on the face, the words shining and
              the answers under them say it three ways already (the user's pick). What the app
              stopped is not asking anyone, so that one keeps its label and nothing else. */}
          {attention && !question && isAppStop(thread.ask) && (
            <span className="block font-mono text-[10px] tracking-wide text-muted-foreground">
              Paused
            </span>
          )}
          <span className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "min-w-0 truncate text-[14px] leading-5 tracking-[-0.15px]",
                attention ? "text-foreground" : "text-foreground/80",
                // the rows that need you or are new stand out by weight, not by a heavier label
                (attention || isUnread(thread)) && "font-medium",
              )}
            >
              {thread.label}
            </span>
            {thread.routineId && (
              <span title="Started by a routine" className="shrink-0">
                <RoutineMark className="size-3 text-muted-foreground/80" />
              </span>
            )}
            <BotRoster bots={thread.roster} />
            <span className="flex-1" />
            <span className="shrink-0 font-mono text-[11px] leading-4 text-muted-foreground tabular-nums">
              {shortAgo(thread.updatedAt)}
            </span>
          </span>
          <span
            className={cn(
              "mt-px flex items-center gap-1.5",
              lines === 1 && "h-4",
            )}
          >
            {thread.status === "working" && (
              <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground/70" />
            )}
            {/* Anything still moving says so by shining, here as in the thread
                (bot-tool) and the pill (Chip). */}
            {thread.status === "working" || question ? (
              <ShinyText
                text={line.text}
                speed={question ? 3.4 : 2.2}
                // A question is words to read, so it shines on the foreground rather than being
                // tinted; a step shines the way every moving line in the app does.
                tone={question ? "reading" : undefined}
                // The shine brings its own ink; only the placeholder's italic carries over.
                className={cn(
                  "min-w-0 flex-1 text-[12px] leading-4",
                  lines === 1 ? "truncate" : "line-clamp-2",
                  line.tone.includes("italic") && "italic",
                )}
              />
            ) : (
              <span
                className={cn(
                  "min-w-0 flex-1 text-[12px] leading-4",
                  lines === 1 ? "truncate" : "line-clamp-2",
                  line.tone,
                )}
              >
                {line.text}
              </span>
            )}
          </span>
        </span>
      </button>

      {options.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5 pr-2 pb-2 pl-12.5">
          {/* A refused key is mended in Settings; Continue then picks the job up on it */}
          {!question && thread.ask?.refused && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => openSettings("keys")}
              className="h-7 gap-1.5 rounded-full px-3 text-[12px]"
            >
              <Settings2 className="size-3.5" />
              Open Settings
            </Button>
          )}
          {options.map((option) => (
            <Button
              key={option}
              size="sm"
              variant="secondary"
              loading={sending === option}
              disabled={answering}
              onClick={async () => {
                setSending(option);
                // A bot's question is answered to the bot that asked it, under that question:
                // the row carries both, so answering here is the same act as answering inside.
                await answer(thread, option, question?.bot, question?.id);
                setSending(null);
              }}
              // The row already says the job wants the user — the dot, the shine. A coloured
              // button would be a third thing saying it (the user's pick: never an outline,
              // never a colour on a button).
              className="h-7 gap-1.5 rounded-full px-3 text-[12px]"
            >
              {option === THREAD_CONTINUE && (
                <ChevronsRight className="size-3.5" />
              )}
              {option}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Second row of a thread line: the question, the outcome, or the bot's last step. */
function secondLine(thread: ThreadView): { text: string; tone: string } {
  const question = thread.room.questions[0];
  if (question) {
    return { text: plainText(question.text), tone: "text-foreground" };
  }
  if (thread.status === "waiting" && thread.ask) {
    // A budget stop is not a question, but it waits on the user exactly as one
    // does, so it carries the waiting colour too; only the words differ.
    return {
      text: thread.ask.refused
        ? `${refusedWords(thread.ask.refused)}.`
        : isAppStop(thread.ask)
          ? plainText(thread.outcome ?? thread.ask.question)
          : thread.ask.question,
      tone: WAITING_INK,
    };
  }
  // Reports are markdown; keep only the text. An ending the user has opened steps back.
  const had = thread.seen;
  if (thread.status === "cancelled") {
    return { text: "Stopped", tone: "text-muted-foreground" };
  }
  if (thread.status === "done") {
    return {
      text: plainText(thread.outcome ?? "Done"),
      tone: had ? "text-muted-foreground" : "text-foreground",
    };
  }
  const last = lastSaid(thread);
  if (!last) {
    return {
      text: `${thread.bot.name} is taking it on…`,
      tone: "text-muted-foreground italic",
    };
  }
  return {
    text:
      last.kind === "tool" && last.tool
        ? // The model's own label when it wrote one, else the raw call.
          (last.tool.note ?? `${last.tool.name} · ${last.tool.input}`)
        : last.text,
    tone: "text-muted-foreground",
  };
}
