"use client";

import { format } from "date-fns";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  CircleQuestionMark,
  Copy,
  CornerDownLeft,
  Loader2,
  RotateCw,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { FoldedText } from "@/components/ui/folded-text";
import { Markdown } from "@/components/ui/markdown";
import { ShinyText } from "@/components/ui/shiny-text";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { compactThreadAction } from "@/features/bot/bot.action";
import {
  Attachments,
  shortenPaths,
} from "@/features/bot/components/attachments";
import { BotMark } from "@/features/bot/components/bot-mark";
import { JobLessons } from "@/features/bot/components/lesson-rows";
import { ThursdayMark } from "@/features/thursday/components/thursday-mark";
import { FileViewer } from "@/features/workspace/components/file-view";
import { toDate } from "@/lib/date-like";
import { useServerAction } from "@/lib/protocol/use-server-action";
import {
  cn,
  errorToString,
  formatCount,
  plainText,
  WAITING_INK,
} from "@/lib/utils";
import { ROOM_THURSDAY, ROOM_USER } from "../room.schema";
import {
  type BotRef,
  type Chatter,
  heardBy,
  officePointed,
  type ThreadItem,
  type ThreadView,
  type ThreadViewStatus,
  threadItems,
  useOfficePointed,
} from "../thread.store";
import { BotTool, StepTile } from "./bot-tool";

/** One thread read as a conversation: its head, its tabs, and every turn in it. Split out of bot-room by subject; see it for the room as a whole. */

/**
 * Folds the room; shared by both headers. An X on its own filled circle, not a
 * chevron: in the thread header it sits a few pixels from the back arrow, and two
 * chevrons that differ only by rotation read as the same button twice. The fill is
 * always on rather than on hover, so it is found before the pointer gets there.
 */
export function FoldButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Fold the room away"
      className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-foreground outline-none transition-colors hover:bg-muted-foreground/20 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <X className="size-3.5" />
    </button>
  );
}

export function ThreadHeader({
  thread,
  onBack,
  onClose,
  titled = true,
  children,
}: {
  thread: ThreadView;
  onBack: () => void;
  onClose: () => void;
  /** Heads itself with the thread's bot and name; beside its office, the office's head does (bot-room). */
  titled?: boolean;
  /** Beside the fold button: how the thread is shown (bot-room). */
  children?: ReactNode;
}) {
  if (!titled)
    return (
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to the list"
          className="flex shrink-0 items-center gap-1 rounded-md p-1 pr-2 text-[12.5px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronLeft className="size-4" />
          Threads
        </button>
        <span className="flex-1" />
        <ThreadFacts thread={thread} />
        {children}
        <FoldButton onClick={onClose} />
      </div>
    );
  return (
    <div className="flex items-center gap-2 px-3 pt-3 pb-1">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to the list"
        className="shrink-0 rounded-md p-1 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronLeft className="size-4" />
      </button>
      <BotMark
        size={22}
        seed={thread.bot.name}
        color={thread.bot.icon?.color}
        shape={thread.bot.icon?.shape}
        outline={thread.bot.icon?.outline}
        paint={thread.bot.icon?.paint}
        notify={false}
        crossed={
          thread.status === "cancelled" || isDown(thread, thread.bot.name)
        }
      />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
        {thread.label}
      </span>
      <ThreadFacts thread={thread} />
      {children}
      <FoldButton onClick={onClose} />
    </div>
  );
}

/** Where a thread stands: tokens, the context meter, the status word. The room's header and the Threads reader draw it. */
export function ThreadFacts({ thread }: { thread: ThreadView }) {
  return (
    <>
      <Tokens thread={thread} />
      <Context thread={thread} />
      <State thread={thread} />
    </>
  );
}

/**
 * What the model read and wrote on its last step — the number the bar beside it measures
 * against the budget, and so the one that says how far compaction is. The running total is
 * in the title only: with a provider's prompt cache it is not what was paid for.
 */
function Tokens({ thread }: { thread: ThreadView }) {
  const { contextTokens: last, tokens: burned } = thread;
  if (!last) return null;
  return (
    <span
      title={`Last step ${formatCount(last)} tokens · in total in ${formatCount(burned.input)} · out ${formatCount(burned.output)}`}
      className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums"
    >
      {formatCount(last)}
    </span>
  );
}

/**
 * Context fill of the last step, not the running total. At the budget the bot compacts
 * (bot.run compact) and the bar drops. Pressing it asks for that now: the thread's own bot
 * summarizes itself at its next step, which for one that has stopped is its next turn.
 */
function Context({ thread }: { thread: ThreadView }) {
  const { contextTokens: used, contextBudget: budget } = thread;
  const [asked, setAsked] = useState(false);
  const [compact, asking] = useServerAction(compactThreadAction, {
    onOk: () => setAsked(true),
  });
  // A new number is a step taken since: what was asked for has happened. Synced during
  // render, as useDraft does: an effect would draw the new number still asked for a frame.
  const [seen, setSeen] = useState(used);
  if (seen !== used) {
    setSeen(used);
    setAsked(false);
  }
  if (!used || !budget) return null;
  const full = Math.min(1, used / budget);

  return (
    <button
      type="button"
      disabled={asking || asked}
      onClick={() => void compact(thread.id, thread.bot.name)}
      title={
        asked
          ? "It summarizes itself at its next step"
          : `Context ${formatCount(used)} of ${formatCount(budget)} — it summarizes itself at the end of the bar. Press to have it do so at its next step`
      }
      aria-label="Summarize this thread's context at its next step"
      className="-my-2 flex h-6 shrink-0 items-center rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default"
    >
      <span className="block h-[3px] w-9 overflow-hidden rounded-full bg-muted">
        <span
          className={cn(
            "block h-full rounded-full",
            asked
              ? "animate-pulse bg-muted-foreground/40"
              : full > 0.9
                ? "bg-amber-500/80"
                : "bg-muted-foreground/70",
          )}
          style={{ width: `${Math.max(4, Math.round(full * 100))}%` }}
        />
      </span>
    </button>
  );
}

/** Only waiting (amber) carries colour. */
const STATE_LOOK: Record<ThreadViewStatus, string> = {
  working: "text-muted-foreground",
  waiting: WAITING_INK,
  done: "text-foreground",
  cancelled: "text-muted-foreground",
};

/** The word for each, a stopped job called what the list and guide/bots.md call it. */
const STATE_WORD: Record<ThreadViewStatus, string> = {
  working: "working",
  waiting: "waiting",
  done: "done",
  cancelled: "stopped",
};

function State({ thread }: { thread: ThreadView }) {
  const look =
    thread.status === "done" && thread.seen
      ? "text-muted-foreground"
      : STATE_LOOK[thread.status];

  if (thread.status === "working") {
    return (
      <ShinyText
        text={STATE_WORD.working}
        speed={2.2}
        className="shrink-0 font-mono text-[10px]"
      />
    );
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1.5 font-mono text-[10px]",
        look,
      )}
    >
      {STATE_WORD[thread.status]}
    </span>
  );
}

/**
 * The thread as it is drawn: without the questions still waiting on the user.
 * The reply sheet holds those (ThreadReply), and each joins the thread as a record
 * once answered. A question's line names the room question it opened, so the same
 * words asked twice keep the answered one on the record.
 */
function withoutOpenQuestions(thread: ThreadView): ThreadView {
  const open = new Set(thread.room.questions.map((question) => question.id));
  if (!open.size) return thread;
  return {
    ...thread,
    lines: thread.lines.filter(
      (line) =>
        !(
          line.kind === "ask" &&
          line.questionId !== undefined &&
          open.has(line.questionId)
        ),
    ),
  };
}

/**
 * A whole thread as the conversation between its participants, from one bot's
 * tab (thread.store threadItems). Follows the newest line while the reader is at
 * the bottom. Also used by the Threads settings screen.
 */
export function Conversation({
  thread,
  tab = null,
  onTab,
  className,
  tabsClassName,
}: {
  thread: ThreadView;
  /** Another bot whose tab is open; null is the thread's own. */
  tab?: string | null;
  /** Keeps the picked tab. Without it the thread draws on its own bot's tab, with no tabs. */
  onTab?: (bot: string | null) => void;
  className?: string;
  tabsClassName?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const roster = thread.roster;
  const side =
    onTab && tab !== thread.bot.name && roster.some((bot) => bot.name === tab)
      ? tab
      : null;
  const self = side ?? thread.bot.name;
  // Who is still at it says so at the end of the tab that holds them.
  const live = roster.filter(
    (bot) => (!side || bot.name === side) && standingOf(thread, bot.name),
  );
  const items = threadItems(withoutOpenQuestions(thread), self, live);

  // A different thread, or another side of it, starts at its own end.
  useEffect(() => {
    following.current = true;
  }, [thread.id, side]);

  useEffect(() => {
    const box = scroller.current;
    if (box && following.current) box.scrollTop = box.scrollHeight;
  }, [thread.lines, thread.status, side]);

  // A page or a picture under a message is drawn a moment after the words and grows the
  // turn it is under, and a question docking in the box under the conversation shrinks it:
  // either way the end stays in view, rather than the last lines going behind the composer
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const watch = new ResizeObserver(() => {
      if (following.current) box.scrollTop = box.scrollHeight;
    });
    watch.observe(box);
    for (const child of Array.from(box.children)) watch.observe(child);
    return () => watch.disconnect();
  }, [items.length, thread.lines, side]);

  return (
    // One FileViewer per conversation, not per bubble.
    <FileViewer>
      {onTab && (
        <ThreadTabs
          thread={thread}
          roster={roster}
          side={side}
          onPick={onTab}
          className={tabsClassName}
        />
      )}
      <div
        ref={scroller}
        onScroll={(event) => {
          const box = event.currentTarget;
          following.current =
            box.scrollHeight - box.scrollTop - box.clientHeight < 24;
        }}
        className={cn(
          "min-w-0 max-h-[64vh] space-y-3 overflow-y-auto px-4 pt-6 pb-4 mask-[linear-gradient(to_bottom,transparent,black_2rem)] scrollbar-none",
          className,
        )}
      >
        {!side && <Request thread={thread} />}
        {items.map((item) =>
          item.kind === "invite" ? (
            <Invite key={item.key} from={item.from} to={item.to} />
          ) : (
            <SpeakerTurn
              key={item.key}
              turn={item}
              thread={thread}
              self={self}
            />
          ),
        )}
        {!side && <JobLessons threadId={thread.id} faces={roster} />}
      </div>
    </FileViewer>
  );
}

/**
 * The thread's own bot first, where the thread opens and always there, then each
 * bot it brought in. A running bot's tab spins and one waiting on the user
 * carries its dot, so who is busy reads before any tab is opened.
 */
function ThreadTabs({
  thread,
  roster,
  side,
  onPick,
  className,
}: {
  thread: ThreadView;
  roster: BotRef[];
  side: string | null;
  onPick: (bot: string | null) => void;
  className?: string;
}) {
  // A bot pointed at in the office lights its tab as if hovered; pointing at a tab unfolds its
  // plate there (thread.store officePointed)
  const pointed = useOfficePointed();
  // pointed at as it went (Esc, another thread): no pointerleave comes
  useEffect(() => () => officePointed.set(null), []);
  return (
    <Tabs
      value={side ?? thread.bot.name}
      onValueChange={(value) =>
        onPick(value === thread.bot.name ? null : String(value))
      }
      className={cn("shrink-0 gap-0 px-3 pt-1 pb-0.5", className)}
    >
      {/* Positioned, so Base UI measures its picked tab against it (composite getOffset): measured
          against the page, the first tab reads as past the right edge and the row mounts scrolled */}
      <TabsList className="relative w-full justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0 scrollbar-none group-data-horizontal/tabs:h-auto">
        {roster.map((bot) => {
          const standing = standingOf(thread, bot.name);
          return (
            <TabsTrigger
              key={bot.name}
              value={bot.name}
              onPointerEnter={() => officePointed.set(bot.name)}
              onPointerLeave={() => officePointed.set(null)}
              className={cn(
                TAB,
                "pl-1.5",
                pointed === bot.name && "bg-muted/60 text-foreground",
              )}
            >
              <BotMark
                size={16}
                seed={bot.name}
                color={bot.icon?.color}
                shape={bot.icon?.shape}
                outline={bot.icon?.outline}
                paint={bot.icon?.paint}
                notify={standing === "asking"}
                crossed={isDown(thread, bot.name)}
                className="shrink-0"
              />
              <span className="max-w-28 truncate">{bot.name}</span>
              {standing === "running" && (
                <Loader2 className="size-3 animate-spin text-muted-foreground/70" />
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

/** A tab as a pill that fills while its side is on screen, in place of the boxed look TabsTrigger brings. */
export const TAB =
  "h-7 flex-none rounded-full px-3 py-0 text-[12px] text-muted-foreground hover:bg-muted/60 data-active:bg-muted data-active:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-none dark:data-active:border-transparent dark:data-active:bg-muted";

/**
 * Whether a bot's part in this thread was stopped, or paused by the app on Continue: its face
 * has its eyes crossed out, as in the office (office.scene Walker `crossed`).
 */
const isDown = (thread: ThreadView, bot: string) =>
  thread.room.participants.some(
    (one) =>
      one.bot === bot && (one.state === "cancelled" || one.state === "paused"),
  );

/** Whether a bot is at work in this thread or waiting on the user's answer. */
function standingOf(
  thread: ThreadView,
  bot: string,
): "running" | "asking" | null {
  const { room } = thread;
  if (room.questions.some((question) => question.bot === bot)) return "asking";
  return thread.status === "working" &&
    room.participants.some((one) => one.bot === bot && one.state === "running")
    ? "running"
    : null;
}

/**
 * One speaker's entries in a row. The open tab's bot holds the left, its work in
 * full and its words on no surface; everyone else answers from the right — the
 * user's side in the dark bubble, other bots on `secondary` with their work
 * folded into rows. A message to a bot other than the tab's names it at its head,
 * once while the addressee stays the same.
 */
function SpeakerTurn({
  turn,
  thread,
  self,
}: {
  turn: Extract<ThreadItem, { kind: "turn" }>;
  thread: ThreadView;
  /** The bot whose tab is open. */
  self: string;
}) {
  const mine = turn.speaker.name === self;
  const surface: Surface = mine
    ? "none"
    : isPerson(turn.speaker)
      ? "dark"
      : "secondary";
  let named: string | null = null;
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <Turn
        side={mine ? "start" : "end"}
        name={nameOf(turn.speaker)}
        mark={<TurnMark bot={turn.speaker} />}
      >
        {turn.entries.map((entry) => {
          if (entry.kind === "work") {
            return mine ? (
              <OwnWork
                key={entry.key}
                lines={entry.lines}
                trailing={entry.open}
                bot={turn.speaker}
                thread={thread}
              />
            ) : (
              <WorkRow
                key={entry.key}
                lines={entry.lines}
                trailing={entry.open}
                bot={turn.speaker}
                thread={thread}
              />
            );
          }
          const to = heardBy(entry.line);
          const mention =
            to &&
            to.name !== turn.speaker.name &&
            to.name !== self &&
            !isPerson(to) &&
            to.name !== named
              ? to
              : null;
          if (to) named = to.name;
          return (
            <Message
              key={entry.key}
              line={entry.line}
              surface={surface}
              mention={mention}
              threadId={thread.id}
            />
          );
        })}
      </Turn>
    </div>
  );
}

/**
 * Another bot's work between its messages, folded: a head that says what it did last, how
 * much and how long (the step it is on while it is still at it), over a strip of tiles for
 * the steps that finished — a picture it took, the site it opened, else what it did. The
 * head opens it in place to the steps, stops and words beside them; a tile opens it on
 * that step.
 */
function WorkRow({
  lines,
  trailing,
  bot,
  thread,
}: {
  lines: Chatter[];
  /** No message has followed it yet, so it may be what the bot is on now. */
  trailing: boolean;
  bot: BotRef;
  thread: ThreadView;
}) {
  const [open, setOpen] = useState(false);
  /** The step a tile opened, shown whole once the row unfolds. */
  const [picked, setPicked] = useState<string | null>(null);
  const standing = trailing ? standingOf(thread, bot.name) : null;
  const counts = countsOf(lines);
  const done = lines.filter((line) => line.tool?.results !== undefined);
  if (!standing && !counts) return null;
  const last = lines.findLast(
    (line) => line.kind === "tool" || line.kind === "say",
  );
  const shown = open && lines.length > 0;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-2xl bg-muted/40 p-1",
        shown ? "w-full" : "w-fit max-w-full",
      )}
    >
      <button
        type="button"
        disabled={!lines.length}
        aria-expanded={shown}
        onClick={() => {
          setOpen((was) => !was);
          setPicked(null);
        }}
        className="flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-1.5 text-left outline-none transition-colors enabled:hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {standing === "running" && (
          <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground/60" />
        )}
        {standing ? (
          <ShinyText
            text={
              standing === "asking"
                ? "waiting on you"
                : last
                  ? stepOf(last)
                  : "working"
            }
            tone={standing === "asking" ? "waiting" : "muted"}
            speed={2.4}
            className={cn(
              "min-w-0 truncate text-[12px] leading-4",
              shown && "flex-1",
            )}
          />
        ) : (
          <FoldedWords
            words={last ? stepOf(last) : ""}
            facts={[counts, tookOf(lines)].filter(Boolean).join(" · ")}
            grow={shown}
          />
        )}
        {lines.length > 0 && <FoldArrow open={shown} />}
      </button>
      {!shown && done.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 px-2 pt-0.5 pb-1.5">
          {done.map(
            (line) =>
              line.tool && (
                <StepTile
                  key={line.id}
                  tool={line.tool}
                  onOpen={() => {
                    setPicked(line.id);
                    setOpen(true);
                  }}
                />
              ),
          )}
        </div>
      )}
      {shown && (
        <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
          {runs(lines).map((run) =>
            run.kind === "tools" ? (
              run.lines.map(
                (line) =>
                  line.tool && (
                    // All start collapsed but the one a tile opened (bot-tool Frame)
                    <BotTool
                      key={line.id}
                      tool={line.tool}
                      threadId={thread.id}
                      collapsed={line.id !== picked}
                    />
                  ),
              )
            ) : run.kind === "stops" ? (
              <div key={run.key} className="px-1.5 py-1">
                <Stops lines={run.lines} />
              </div>
            ) : (
              run.lines.map((line) => <Line key={line.id} line={line} inset />)
            ),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The open tab's bot's own work, in full: nobody opens a row to read what the
 * bot on screen did. While it is at it with nothing mid-call, a shining line says
 * so; a call mid-way already shines on its own row.
 */
function OwnWork({
  lines,
  trailing,
  bot,
  thread,
}: {
  lines: Chatter[];
  /** No message has followed it yet, so it may be what the bot is on now. */
  trailing: boolean;
  bot: BotRef;
  thread: ThreadView;
}) {
  const standing = trailing ? standingOf(thread, bot.name) : null;
  const calling = lines.some(
    (line) => line.tool && line.tool.results === undefined,
  );
  return (
    <>
      {runs(lines).map((run) =>
        run.kind === "tools" ? (
          <Steps key={run.key} lines={run.lines} threadId={thread.id} />
        ) : run.kind === "stops" ? (
          <Stops key={run.key} lines={run.lines} />
        ) : (
          run.lines.map((line) => <Line key={line.id} line={line} />)
        ),
      )}
      {standing && (
        // While a call is mid-way it shines on its own row, and this line keeps its place
        // unseen, so the turn does not grow and shrink by a line at every step
        <ShinyText
          text={standing === "asking" ? "waiting on you" : "on the next step…"}
          tone={standing === "asking" ? "waiting" : "muted"}
          speed={2.2}
          className={cn(
            "block px-1 font-mono text-[10px]",
            calling && "invisible",
          )}
        />
      )}
    </>
  );
}

/**
 * A run of the open tab's bot's own tool calls, every step a row and none of it folded:
 * nobody opens anything to read what the bot on screen did (the user's pick). A row opens
 * to what the step was given and what came back.
 */
function Steps({ lines, threadId }: { lines: Chatter[]; threadId: string }) {
  return (
    <div className="flex w-full flex-col gap-0.5 rounded-2xl bg-muted/40 p-1">
      {lines.map(
        (line) =>
          line.tool && (
            <BotTool
              key={line.id}
              tool={line.tool}
              threadId={threadId}
              collapsed
            />
          ),
      )}
    </div>
  );
}

/**
 * The head of folded work, the same wherever work folds: what was done last in the bot's
 * own words, then how much and how long. A row tall enough to press, with an arrow that reads
 * as one.
 */
function FoldedWords({
  words,
  facts,
  grow = false,
}: {
  words: string;
  facts: string;
  /** Takes the row's width, so the facts sit at its far end. */
  grow?: boolean;
}) {
  return (
    <>
      <span
        className={cn(
          "min-w-0 truncate text-[12.5px] leading-5 text-foreground/80",
          grow && "flex-1",
        )}
      >
        {words}
      </span>
      <span className="shrink-0 font-mono text-[10.5px] leading-4 text-muted-foreground">
        {facts}
      </span>
    </>
  );
}

function FoldArrow({ open }: { open: boolean }) {
  return (
    <span className="grid size-5.5 shrink-0 place-items-center rounded-md bg-background text-muted-foreground ring-1 ring-border/60">
      <ChevronDown
        className={cn("size-3.5 transition-transform", open && "rotate-180")}
      />
    </span>
  );
}

/** How long a run of lines took, first to last: "40s", "3 min", "1h 5m". Empty when the rows carry no times. */
function tookOf(lines: Chatter[]): string {
  const times = lines.flatMap((line) =>
    line.at ? [toDate(line.at).getTime()] : [],
  );
  if (times.length < 2) return "";
  const seconds = Math.round((Math.max(...times) - Math.min(...times)) / 1000);
  if (seconds < 1) return "";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** "3 steps · 1 note", leaving out what did not happen; notes are the words beside a call. */
function countsOf(lines: Chatter[]): string {
  const words = [
    ["tool", "step"],
    ["say", "note"],
    ["stop", "stop"],
    ["note", "compaction"],
  ] as const;
  return words
    .map(
      ([kind, word]) =>
        [lines.filter((line) => line.kind === kind).length, word] as const,
    )
    .filter(([count]) => count > 0)
    .map(([count, word]) => `${count} ${word}${count === 1 ? "" : "s"}`)
    .join(" · ");
}

/** What a line is doing in the model's own words: a step's label, or what was said. */
export function stepOf(line: Chatter): string {
  if (line.kind === "tool" && line.tool) {
    return line.tool.note ?? `${line.tool.name} · ${line.tool.input}`;
  }
  return plainText(line.text).replace(/\s+/g, " ").trim();
}

/** The delegated request, folded to three lines (FoldedText); the user's own when they wrote it. */
function Request({ thread }: { thread: ThreadView }) {
  const by = thread.startedBy === "user" ? YOU : THURSDAY;
  return (
    <>
      <Invite from={by} to={thread.bot} />
      <Turn side="end" name={nameOf(by)} mark={<TurnMark bot={by} />}>
        <Said dark className="py-2 pr-2 pl-3.5">
          <FoldedText
            text={thread.request}
            subject="request"
            className="wrap-anywhere"
          />
        </Said>
      </Turn>
    </>
  );
}

/**
 * Thursday's side of a thread, which also stands for the user's where who wrote the words
 * was not kept; she is not a bot and has no row to read a face from. Her face is always
 * ThursdayMark (features/thursday).
 */
export const THURSDAY: BotRef = { name: ROOM_THURSDAY };

/**
 * The user, where the words are theirs: a job they wrote to a bot, what they typed into a
 * thread. Named "You" and drawn with no face, as a chat draws your own side.
 */
export const YOU: BotRef = { name: ROOM_USER };

/** The room's two people rather than bots: their side is the dark one. */
const isPerson = (bot: BotRef) =>
  bot.name === THURSDAY.name || bot.name === YOU.name;

/** A speaker's name as the room writes it. */
const nameOf = (bot: BotRef) => (bot.name === YOU.name ? "You" : bot.name);

/**
 * A bot joining the room. It is not a message — nobody said it — so it takes no
 * side and wears no bubble: a centred line, the way a chat room announces one.
 */
function Invite({ from, to }: { from: BotRef; to: BotRef }) {
  return (
    <div className="flex animate-in justify-center fade-in duration-300">
      <span className="flex max-w-full items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
        <Face bot={from} />
        <span className="shrink-0 text-muted-foreground">
          {from.name === YOU.name ? "asked" : "invited"}
        </span>
        <Face bot={to} />
      </span>
    </div>
  );
}

/** One name behind its own face, so the line reads as a sentence. */
function Face({ bot }: { bot: BotRef }) {
  if (bot.name === YOU.name) return <span className="shrink-0">You</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {bot.name === THURSDAY.name ? (
        <ThursdayMark size={15} className="shrink-0" />
      ) : (
        <BotMark
          size={15}
          seed={bot.name}
          color={bot.icon?.color}
          shape={bot.icon?.shape}
          outline={bot.icon?.outline}
          paint={bot.icon?.paint}
          notify={false}
          className="shrink-0"
        />
      )}
      <span className="truncate">{bot.name}</span>
    </span>
  );
}

/** A turn's face: Thursday's for hers, none for the user's own words, a bot its own. */
function TurnMark({ bot }: { bot: BotRef }) {
  if (bot.name === YOU.name) return null;
  return bot.name === THURSDAY.name ? (
    <ThursdayMark size={26} className="mt-1 shrink-0" />
  ) : (
    <BotMark
      size={26}
      seed={bot.name}
      color={bot.icon?.color}
      shape={bot.icon?.shape}
      outline={bot.icon?.outline}
      paint={bot.icon?.paint}
      notify={false}
      className="mt-1 shrink-0"
    />
  );
}

/**
 * Words from the other side of the tab. The user's side speaks in the one dark
 * bubble, whose contents take the other theme (`.inverse`, globals.css) so
 * Markdown's own surfaces — inline code, a code block, a link — stay readable on
 * it; other bots answer on `secondary`. `.inverse` is not on `BubbleContent`
 * itself, whose `bg-primary` would swap too.
 */
function Said({
  dark = false,
  children,
  className,
}: {
  dark?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Bubble
      align="end"
      variant={dark ? "default" : "secondary"}
      className="max-w-full"
    >
      <BubbleContent className={cn("rounded-tr-md px-3.5", className)}>
        <div className={cn("min-w-0", dark && "inverse")}>{children}</div>
      </BubbleContent>
    </Bubble>
  );
}

/**
 * One speaker's turn: a face, the name, and what it said and did. The start side
 * is the open tab's bot; the end side is everyone who talks with it.
 */
function Turn({
  side,
  mark,
  name,
  children,
}: {
  side: "start" | "end";
  mark: ReactNode;
  name: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex gap-2.5", side === "end" && "flex-row-reverse")}>
      {mark}
      {/* One cap on the turn's column, not one per block inside it: an answer and
          a one-line remark from the same speaker then end on the same edge. The
          answering side hugs that edge, so the two sides face each other. */}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-1.5 [&>*+*]:max-w-[80%]",
          side === "end" && "items-end",
        )}
      >
        <p className="max-w-[80%] truncate px-1 font-mono text-[10px] text-muted-foreground">
          {name}
        </p>
        {children}
      </div>
    </div>
  );
}

/** Where a message sits: the tab's bot on none, the user's side dark, other bots `secondary`. */
type Surface = "none" | "dark" | "secondary";

/**
 * A message: what passed between participants, a bot's reply, or the ending. A
 * question keeps its word as a record; the ending carries the files it names and
 * a copy.
 */
export function Message({
  line,
  surface,
  mention,
  threadId = null,
}: {
  line: Chatter;
  surface: Surface;
  /** The bot it is for, named at its head (SpeakerTurn). */
  mention: BotRef | null;
  /** The thread it is in; a note about a file it names goes there. */
  threadId?: string | null;
}) {
  const question = Boolean(line.question);
  const ending = line.kind === "result";
  const bubble = surface !== "none";
  // The files are drawn under the words, so the words keep their file names only.
  const text = shortenPaths(line.text);
  const body = (
    <>
      {question && <QuestionWord />}
      {mention ? (
        <Mentioned bot={mention} bubble={bubble}>
          {text}
        </Mentioned>
      ) : (
        <MessageText bubble={bubble} className={cn(!ending && "leading-snug")}>
          {text}
        </MessageText>
      )}
      <Attachments
        text={line.text}
        from={threadId}
        onBubble={bubble}
        className="mt-2"
      />
    </>
  );

  return (
    <>
      {bubble ? (
        <Said dark={surface === "dark"}>{body}</Said>
      ) : (
        <div className="min-w-0 max-w-full px-1">{body}</div>
      )}
      {line.steppedIn && (
        // A record that these words interrupted a running turn: what follows turned on them.
        <p className="flex items-center gap-1 px-1 font-mono text-[10px] text-muted-foreground">
          <CornerDownLeft className="size-2.5" />
          stepped in
        </p>
      )}
      {ending && (
        // The copy: the end of the answer is where a reader is when they want it.
        <div className="flex px-1">
          <CopyReport text={line.text} />
        </div>
      )}
    </>
  );
}

/**
 * Streamdown's code block as one surface inside a message bubble: its own frame
 * there would be a box in a box.
 */
const IN_BUBBLE =
  "[&_[data-streamdown=inline-code]]:text-[12px] [&_[data-streamdown=code-block]]:my-2 [&_[data-streamdown=code-block]]:gap-0 [&_[data-streamdown=code-block]]:rounded-[10px] [&_[data-streamdown=code-block]]:border-0 [&_[data-streamdown=code-block]]:bg-background [&_[data-streamdown=code-block]]:p-0 [&_[data-streamdown=code-block-header]]:h-7 [&_[data-streamdown=code-block-header]]:px-2.5 [&_[data-streamdown=code-block-header]]:text-[11px] [&_[data-streamdown=code-block-body]]:border-0 [&_[data-streamdown=code-block-body]]:bg-transparent! [&_[data-streamdown=code-block-body]]:px-2.5 [&_[data-streamdown=code-block-body]]:pt-0 [&_[data-streamdown=code-block-body]]:pb-2.5 [&_[data-streamdown=code-block-body]]:text-[12.5px] [&_[data-streamdown=code-block]_div:has(>[data-streamdown=code-block-actions])]:-mt-7 [&_[data-streamdown=code-block-actions]]:mr-1 [&_[data-streamdown=code-block-actions]]:border-0 [&_[data-streamdown=code-block-actions]]:bg-transparent!";

function MessageText({
  children,
  bubble = false,
  className,
}: {
  children: string;
  /** Inside a message bubble (Said). */
  bubble?: boolean;
  className?: string;
}) {
  return (
    <Markdown
      className={cn(
        "min-w-0 max-w-full text-[13px] leading-relaxed wrap-anywhere break-keep [&_h1]:text-[15px] [&_h2]:text-[14px] [&_h3]:text-[13px] [&_h3]:font-semibold [&_li]:my-0.5 [&_table]:text-[12px] [&_table]:wrap-normal [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        bubble && IN_BUBBLE,
        className,
      )}
    >
      {children}
    </Markdown>
  );
}

/**
 * Who a message is for, at its head: the addressee's face and name. In a bubble
 * the chip takes the page's background, which stands off both bubbles in either
 * theme; on no surface it is muted.
 */
function Mention({ bot, bubble }: { bot: BotRef; bubble: boolean }) {
  return (
    <span
      className={cn(
        "mr-1.5 inline-flex h-5 max-w-full items-center gap-1 rounded-full pr-2 pl-[3px] align-[-4px] text-[12px] leading-none font-medium whitespace-nowrap text-foreground",
        bubble ? "bg-background" : "bg-muted",
      )}
    >
      <BotMark
        size={14}
        seed={bot.name}
        color={bot.icon?.color}
        shape={bot.icon?.shape}
        outline={bot.icon?.outline}
        paint={bot.icon?.paint}
        notify={false}
        className="shrink-0"
      />
      <span className="truncate">{bot.name}</span>
    </span>
  );
}

/**
 * Words that follow a mention. The Markdown box dissolves (`contents`) so its
 * first paragraph runs on from the mention; later blocks still break lines.
 */
function Mentioned({
  bot,
  bubble,
  children,
}: {
  bot: BotRef;
  bubble: boolean;
  children: string;
}) {
  return (
    <div className="min-w-0 max-w-full text-[13px] leading-snug">
      <Mention bot={bot} bubble={bubble} />
      <MessageText
        bubble={bubble}
        className="contents leading-snug [&>p:first-child]:inline"
      >
        {children}
      </MessageText>
    </div>
  );
}

/** A question kept as a record. While it waits, the reply sheet holds it in amber. */
function QuestionWord() {
  return (
    <p className="mb-1 flex items-center gap-1.5 text-[12px] leading-4 font-medium text-muted-foreground">
      <CircleQuestionMark className="size-3.5 shrink-0" />
      Question
    </p>
  );
}

/** Work that is not a step: a compaction, or the words beside a call. */
function Line({
  line,
  inset = false,
}: {
  line: Chatter;
  /** Inside a work row, in line with its steps' labels. */
  inset?: boolean;
}) {
  // A compact summary (bot.run compact): a divider, with the summary behind it.
  if (line.kind === "note") {
    return (
      <details className="w-full px-2 py-1 text-muted-foreground">
        <summary className="flex cursor-pointer list-none items-center gap-2.5 outline-none [&::-webkit-details-marker]:hidden">
          <span className="h-px flex-1 bg-border" />
          <span className="min-w-0 text-center font-mono text-[10px]">
            Compacted — it goes on from its summary
          </span>
          <span className="h-px flex-1 bg-border" />
        </summary>
        <MessageText className="mt-2 rounded-xl bg-muted/40 px-3 py-2 text-[11px]">
          {line.text}
        </MessageText>
      </details>
    );
  }

  return (
    <MessageText
      className={cn(
        "text-[12.5px] text-muted-foreground",
        inset ? "px-2.5 py-1" : "px-1",
      )}
    >
      {line.text}
    </MessageText>
  );
}

/** Copies the answer. The icon confirms; a toast only reports failure. */
function CopyReport({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const back = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (back.current) clearTimeout(back.current);
    },
    [],
  );

  return (
    <button
      type="button"
      aria-label="Copy the answer"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          if (back.current) clearTimeout(back.current);
          back.current = setTimeout(() => setCopied(false), 1400);
        } catch (cause) {
          toast.add({
            type: "error",
            title: "Could not copy the answer",
            description: errorToString(cause),
          });
        }
      }}
      className="grid size-5 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </button>
  );
}

/**
 * Where the app stopped the run (room.query pauseRoom, a break the runner retries): a failed model call, a
 * restart. Muted and in the bot's work, since the bot goes on
 * from here. The same reason in a row is one line with a count; opening it lists
 * each stop by the time it happened.
 */
function Stops({ lines }: { lines: Chatter[] }) {
  return (
    <details className="group min-w-0 px-1 text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] leading-relaxed outline-none [&::-webkit-details-marker]:hidden">
        <RotateCw className="size-3 shrink-0" />
        <span className="min-w-0 truncate">{leadOf(lines[0].text)}</span>
        {lines.length > 1 && (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            ×{lines.length}
          </span>
        )}
        <ChevronDown className="size-2.5 shrink-0 text-muted-foreground/70 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-1 space-y-1 pl-4.5 text-[11px] leading-relaxed">
        {lines.map((line) => (
          <p key={line.id} className="flex gap-2 break-keep wrap-anywhere">
            {line.at && (
              <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
                {format(toDate(line.at), "HH:mm:ss")}
              </span>
            )}
            <span className="min-w-0">{line.text}</span>
          </p>
        ))}
      </div>
    </details>
  );
}

/** What stopped it, without the words behind it: a reason may name those in parentheses. */
export const leadOf = (text: string) => text.split(" (")[0].replace(/\.$/, "");

/** Splits a bot's work into runs of tool calls, of stops, and of everything else. */
type Run =
  | { kind: "tools"; key: string; lines: Chatter[] }
  | { kind: "stops"; key: string; lines: Chatter[] }
  | { kind: "said"; key: string; lines: Chatter[] };

export function runs(lines: Chatter[]): Run[] {
  const out: Run[] = [];
  for (const line of lines) {
    const kind =
      line.kind === "tool" && line.tool
        ? "tools"
        : line.kind === "stop"
          ? "stops"
          : "said";
    const open = out.at(-1);
    // Stops fold only while the reason repeats; another reason is a line of its own
    const same =
      open?.kind === kind &&
      (kind !== "stops" || leadOf(open.lines[0].text) === leadOf(line.text));
    if (open && same) open.lines.push(line);
    else out.push({ kind, key: line.id, lines: [line] });
  }
  return out;
}
