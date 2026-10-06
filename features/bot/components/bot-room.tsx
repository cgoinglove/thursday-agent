"use client";

import { ArrowRight } from "lucide-react";
import dynamic from "next/dynamic";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useAppEvent } from "@/app/api/events/app-event.client";
import { queryKey } from "@/app/api/query-key";
import { Segmented } from "@/components/ui/segmented";
import { PAGE_SIZE } from "@/config";
import {
  type Bot,
  needsThreadReply,
  standOf,
  type Thread,
} from "@/features/bot/bot.schema";
import {
  type BotGesture,
  useCrewAwake,
  useCrewGestures,
} from "@/features/bot/components/crew-motion";
import { ThreadReply } from "@/features/bot/components/thread-reply";
import { ThursdayMark } from "@/features/thursday/components/thursday-mark";
import { useFocusReturn } from "@/hooks/use-focus-return";
import { typed, useEscape, windowKey } from "@/hooks/use-hotkey";
import { useWide } from "@/hooks/use-wide";
import { toDate } from "@/lib/date-like";
import { useServerPages } from "@/lib/protocol/use-server-pages";
import { useServerRoute } from "@/lib/protocol/use-server-route";
import { cn } from "@/lib/utils";
import {
  botThreads,
  roomOffice,
  roomOpen,
  roomOpens,
  roomReadAs,
  roomThread,
  type ThreadView,
  type ThreadViewStatus,
  threadFromRow,
  useBotThreads,
  useCallWaits,
  useRoomReadAs,
  useSeenOnDetail,
  writeLine,
} from "../thread.store";
import { Conversation, ThreadHeader } from "./room-conversation";
import {
  Empty,
  HistoryList,
  ListHeader,
  Quiet,
  RoomTab,
  ThreadList,
  ThreadLoading,
  useWaitingRows,
} from "./room-list";
import {
  Chip,
  CrewRow,
  crewOf,
  Happening,
  happenedIn,
  Moment,
  participantStates,
  RoomState,
  useHandoff,
  waitingStepIn,
} from "./room-pill";

/** The office of the thread being read (office-view): its code loads when one is. */
const OfficeBackdrop = dynamic(
  () => import("./office-view").then((module) => module.OfficeBackdrop),
  { ssr: false },
);

/**
 * The narrowest window the office is drawn in, beside the 40rem room where her face stands:
 * narrower, what is left of the call would draw the building too small to read, and the room
 * lies over her face as before.
 */
const OFFICE_MIN_WIDTH = 1280;

/**
 * How long the room and its office take to go (their fades, `duration-250`): what folds or steps
 * back is drawn that long, fading, so her face comes back through it rather than after a cut.
 */
const LEAVE_MS = 250;

/**
 * What is on screen, kept a moment after it goes so it can fade rather than vanish: the value
 * while there is one, then the last one, `leaving`, for `ms`, then nothing.
 */
function useLeaving<T>(value: T | null, ms: number) {
  const [kept, setKept] = useState(value);
  if (value !== null && value !== kept) setKept(value);
  const away = value === null;
  const [gone, setGone] = useState(away);
  if (!away && gone) setGone(false);
  useEffect(() => {
    if (!away) return;
    const out = setTimeout(() => setGone(true), ms);
    return () => clearTimeout(out);
  }, [away, ms]);
  const shown = value ?? kept;
  return gone || shown === null ? null : { value: shown, leaving: away };
}

/**
 * The thread room and inbox in the corner of the call screen: what is running, what is
 * asking, and what just finished (thread.query listInboxThreads). It only projects server
 * state.
 *
 * Folded, it is not a badge you have to open. Anything waiting on an answer is drawn
 * on the chip itself, with its buttons; what a bot is doing right now sits beside its
 * face, and what passed between two parties rides above one for a moment
 * (useHandoff). Open, a thread can be read and answered in place.
 *
 * memo: the parent re-renders per transcript chunk, and nothing here reads its props.
 */
export const BotRoom = memo(function BotRoom() {
  const threads = useBotThreads();
  /** What the pill grows to ask, when the write line leaves it room (room-list). */
  const waiting = useWaitingRows();
  const { data: bots } = useServerRoute<Bot[]>(queryKey.bot);
  const [open, setOpen] = useState(false);
  /** Folding by hand: still drawn while it fades down and out, then folded (`fold`). */
  const [closing, setClosing] = useState(false);
  /** Open thread; null shows the list. */
  const [picked, setPicked] = useState<string | null>(null);
  // A thread is read at nearly the window's height and lies over the call; only the write
  // line steps aside for it. The list is a short card in the corner
  const reading = open && picked !== null;
  // The write line is put away while anything stands open here (thread.store roomOpen)
  useEffect(() => {
    roomOpen.set(open ? (reading ? "thread" : "list") : null);
    return () => roomOpen.set(null);
  }, [open, reading]);
  // Folded, the focus goes back to what opened the room; a thread closed back to the list, to its row
  useFocusReturn(open, "room");
  useFocusReturn(reading, picked ? `thread-${picked}` : undefined);
  /** The bot each thread shows, by thread id; a thread not in here is on its own bot's tab. */
  const [sides, setSides] = useState<Record<string, string | null>>({});
  /** The list on screen: what is current, or everything that has ended. */
  const [tab, setTab] = useState<RoomTab>("now");
  /** Where History was scrolled, kept while one of its threads is open. */
  const scroll = useRef(0);

  const newest = [...threads].reverse();
  // One rule decides which side of the screen a job stands on (bot.schema `standOf`): what has
  // ended is the left corner's, everything else is this list's. So the count on the pill and the
  // rows under it are the same jobs, and an ending is never read in two places.
  const now = newest.filter((entry) => standOf(entry) !== "finished");

  // Read only while History is on screen, or one of its threads is.
  const browsing = open && tab === "history";
  const history = useServerPages<Thread>({
    key: (index, previous) => {
      if (!browsing) return null;
      if (index === 0) return queryKey.threadHistory(null);
      const tail = previous?.at(-1);
      return tail
        ? queryKey.threadHistory(toDate(tail.updatedAt).toISOString())
        : null;
    },
    size: PAGE_SIZE,
  });
  // Loaded pages stay cached while the tab is away and nothing refreshes them
  // then, so opening History reads them again — unless this is the first read.
  const { refresh } = history;
  const cached = useRef(false);
  cached.current = history.items.length > 0;
  useEffect(() => {
    if (browsing && cached.current) void refresh();
  }, [browsing, refresh]);
  const past = useMemo(
    () =>
      history.items
        .filter((row) => row.status === "done" || row.status === "cancelled")
        .map((row) => threadFromRow(row, bots)),
    [history.items, bots],
  );

  // An open thread is read whole by its id, whether or not a list holds it: the
  // inbox leaves an ended thread's lines out (thread.query listInboxThreads).
  // The key sits under the inbox's, so the `threads` signal keeps it live too.
  const listed = picked
    ? (newest.find((entry) => entry.id === picked) ??
      past.find((entry) => entry.id === picked) ??
      null)
    : null;
  const { data: lone, isLoading: fetching } = useServerRoute<Thread | null>(
    picked ? queryKey.thread(picked) : null,
  );
  const alone = useMemo(
    () => (lone && lone.id === picked ? threadFromRow(lone, bots) : null),
    [lone, picked, bots],
  );
  // A listed thread that carries its lines opens at once and the whole one
  // takes over; one that does not waits, rather than flashing an empty room.
  const current = alone ?? (listed?.lines.length ? listed : null);
  /** A thread stands in the room, or is on its way: the room is its frame, not the list's. */
  const threadShown = picked !== null && (current !== null || fetching);
  // The thread being read is drawn as its office where her face stands, from the moment it is
  // picked, unless the user reads threads as the conversation alone (ReadAsSwitch): her face
  // gives way at once (thursday) and the office builds itself as the thread arrives. Nothing
  // takes it down while it is read, since what she would ring for waits meanwhile (use-call-ring
  // roomThread); once it goes, it fades out as her face comes back
  const roomy = useWide(OFFICE_MIN_WIDTH);
  const readAs = useRoomReadAs();
  const office =
    reading &&
    roomy &&
    readAs === "office" &&
    !closing &&
    (current !== null || fetching);
  useEffect(() => roomOffice.set(office), [office]);
  useEffect(() => () => roomOffice.set(false), []);
  const drawn = useLeaving<ThreadView>(office ? current : null, LEAVE_MS);
  useEffect(
    () => roomThread.set(open && !closing ? picked : null),
    [open, closing, picked],
  );
  useEffect(() => () => roomThread.set(null), []);

  const [moment, handoff] = useHandoff();
  // A moment passes; words that wait on a bot stay up under it until they are read
  const bubble = useMemo(
    () =>
      moment ??
      waitingStepIn(threads, (name) => ({
        name,
        icon: bots?.find((bot) => bot.name === name)?.icon ?? null,
      })),
    [moment, threads, bots],
  );
  const { crew, more } = useMemo(() => crewOf(bots, threads), [bots, threads]);
  const [playing, play] = useCrewGestures();
  // Awake as the screen opens and as its window comes back, then asleep (config CREW_REST)
  const awake = useCrewAwake();

  // The crew arriving is the one thing the whole row answers, and it answers once:
  // before the bots are read the row is stand-ins, and a wave on those would be a
  // greeting from nobody.
  const greeted = useRef(false);
  useEffect(() => {
    if (greeted.current || !bots?.length) return;
    greeted.current = true;
    play(bots.map((bot) => ({ bot: bot.name, gesture: "wave" as const })));
  }, [bots, play]);

  // What each thread and participant was, and which lines had landed, at the
  // previous sync. Only what changed since then just happened.
  const known = useRef<Map<string, ThreadViewStatus> | null>(null);
  const standing = useRef(new Map<string, string>());
  const passed = useRef(new Set<string>());

  useEffect(() => {
    if (!botThreads.primed()) return;
    const was = known.current;
    known.current = new Map(threads.map((entry) => [entry.id, entry.status]));
    const stood = standing.current;
    standing.current = participantStates(threads);
    const had = passed.current;
    passed.current = new Set(
      threads.flatMap((thread) => thread.lines.map((line) => line.id)),
    );

    // The first list only seeds these: nothing on it just happened.
    if (!was) return;

    // One bubble at a time: of what this sync brought, the one that matters
    // most, and of equals the later. Every gesture it turned up plays, though —
    // each sits on its own face, so they never cover one another.
    let top: Happening | null = null;
    const felt: BotGesture[] = [];
    for (const thread of threads) {
      const { moments, gestures } = happenedIn(
        thread,
        was.get(thread.id),
        had,
        stood,
        standing.current,
      );
      felt.push(...gestures);
      for (const one of moments) {
        if (!top || one.rank >= top.rank) top = one;
      }
    }
    if (top) handoff(top);
    play(felt);
  }, [threads, handoff, play]);

  // Reading a thread is reading its ending; that is what clears its dot.
  useSeenOnDetail(open ? current : null);

  // Thursday put a job in front of the user (`thread` `open`): the room opens on it
  useAppEvent({
    showThread: (event) => {
      setPicked(event.threadId);
      setClosing(false);
      setOpen(true);
    },
  });

  // "Open thread" on the call-back card: the same, asked for by the screen
  useEffect(
    () =>
      roomOpens.subscribe((id) => {
        setPicked(id);
        setTab("now");
        setClosing(false);
        setOpen(true);
      }),
    [],
  );

  const busy = threads.filter((entry) => entry.status === "working").length;
  const pending = newest.filter(needsThreadReply).length;
  // In the open room the list says what each bot is on; its foot keeps the faces,
  // so a step's words never come and go under the list.
  const faces = useMemo(
    () => crew.map((face) => ({ ...face, word: null })),
    [crew],
  );

  // The room always opens on Now. A thread left open would greet the next click
  // on the pill, and a History one would not be found once its pages stop being read.
  const fold = () => {
    setOpen(false);
    setClosing(false);
    setPicked(null);
    setTab("now");
    scroll.current = 0;
  };
  // Folded by hand, the room fades down and out with its office, and her face comes back
  // through them; the write line asking for the foot folds it at once (below)
  const close = () => setClosing(true);
  const foldRef = useRef(fold);
  foldRef.current = fold;
  useEffect(() => {
    if (!closing) return;
    const out = setTimeout(() => foldRef.current(), LEAVE_MS);
    return () => clearTimeout(out);
  }, [closing]);

  // Her call in writing is still on behind the room, its line put away (write-line)
  const callWaits = useCallWaits();

  // Esc walks back the way the header's own two buttons do: a thread returns to the
  // list it was picked from, and the list folds away.
  useEscape(open && !closing, () => (reading ? setPicked(null) : close()));

  // Asking for the write line folds the room, whoever asks: its own "@", the `@` key, a file
  // put down elsewhere. The two never share the screen.
  useEffect(() => writeLine.subscribe(() => foldRef.current()), []);

  // With a thread open `@` is still the way to the message box, and the one on screen is
  // this thread's: who is in it is picked in the box. A thread with no box to write in (a bot
  // on a step) leaves the key alone.
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!reading) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!typed(event, "@") || !windowKey(event)) return;
      const box = panel.current?.querySelector<HTMLTextAreaElement>(
        "textarea:not(:disabled)",
      );
      if (!box) return;
      event.preventDefault();
      box.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [reading]);

  return (
    // Two places, one for each state (thursday CallFoot). Folded, the pill is a fixture at
    // the right end of the rail: it spans the rail rather than sitting in a column of it, so
    // nothing the rows above do can cap its width and it says the same thing with the write
    // line up as without. Open, the room is not a fixture: it takes the row above the rail,
    // all the height the rail leaves and none of its width, and is read there files and all,
    // over the right of the call (which does not move for it). A thread read there has its
    // office in what the room leaves of that row, where her face stands.
    <div
      className={cn(
        "pointer-events-none flex min-h-0 items-end justify-end",
        // stretched to the row, so the room's own `max-h-full` has a height to be full of:
        // left to its content, a long list grows straight past the top of the window
        open ? "col-span-3 row-start-1 self-stretch" : "col-span-3 row-start-2",
      )}
    >
      {open && drawn && (
        <OfficeBackdrop
          thread={drawn.value}
          leaving={drawn.leaving}
          // A bot pressed in the office opens its tab here, as pressing the tab would
          onBot={(bot) =>
            setSides((was) => ({
              ...was,
              [drawn.value.id]: bot === drawn.value.bot.name ? null : bot,
            }))
          }
          // Its ember line takes the user to what they are asked here: Continue for a job the
          // app paused, else the box to answer in, as `@` does
          onAnswer={() =>
            (
              panel.current?.querySelector<HTMLElement>(
                "[data-continue]:not(:disabled)",
              ) ??
              panel.current?.querySelector<HTMLElement>(
                "textarea:not(:disabled)",
              )
            )?.focus()
          }
          className="pointer-events-auto mr-4 min-h-0 min-w-0 flex-1 self-stretch"
        />
      )}
      {open ? (
        <div
          ref={panel}
          // what is dropped on the room is the open thread's (given-files roomDrop)
          data-room
          className={cn(
            "pointer-events-auto flex max-h-full w-160 max-w-full shrink-0 animate-in flex-col overflow-hidden rounded-3xl bg-background/75 shadow-2xl shadow-black/6 ring-1 ring-border/50 backdrop-blur-xl fade-in slide-in-from-bottom-1 duration-200",
            // A thread is read in a frame of one height, so its head stays where it is while
            // lines arrive, a question docks or the box grows: the conversation takes the difference
            threadShown && "h-[calc(64vh+11rem)]",
            closing &&
              "pointer-events-none translate-y-1 opacity-0 transition-[opacity,translate] duration-250 ease-in",
          )}
        >
          {callWaits && <CallWaits onBack={close} />}
          {!current && picked && fetching ? (
            <ThreadLoading onBack={() => setPicked(null)} onClose={close} />
          ) : current ? (
            <>
              <ThreadHeader
                thread={current}
                onBack={() => setPicked(null)}
                onClose={close}
                // beside its office the job's name heads the office, not this header too
                titled={!office}
              >
                {/* Offered only where the office can be drawn */}
                {roomy && <ReadAsSwitch />}
              </ThreadHeader>
              <Conversation
                thread={current}
                tab={sides[current.id] ?? null}
                onTab={(bot) =>
                  setSides((was) => ({ ...was, [current.id]: bot }))
                }
                className="max-h-none min-h-0 flex-1"
              />
              <ThreadReply
                thread={{
                  id: current.id,
                  label: current.label,
                  bot: current.bot.name,
                  ask: current.ask,
                  room: current.room,
                }}
                status={
                  current.status === "working" ? "running" : current.status
                }
                faces={current.roster}
                to={sides[current.id] ?? current.bot.name}
                className="mx-3 mb-2 shrink-0"
              />
            </>
          ) : (
            <>
              <ListHeader
                tab={tab}
                current={now.length}
                working={
                  now.filter((entry) => entry.status === "working").length
                }
                onTab={setTab}
                onClose={close}
              />
              {tab === "history" ? (
                <HistoryList
                  pages={history}
                  threads={past}
                  scroll={scroll}
                  onPick={setPicked}
                />
              ) : now.length ? (
                <ThreadList threads={now} onPick={setPicked} />
              ) : newest.length ? (
                <Quiet />
              ) : (
                <Empty bots={bots} />
              )}
              {/* The pill's own row at the room's foot: open, it is the same object
                  grown. A hand-off speaks here rather than over the list's rows. */}
              <CrewRow
                crew={faces}
                more={more}
                bubble={null}
                playing={playing}
                label="Fold the room away"
                onClick={close}
                onWrite={writeLine.choose}
                side={
                  bubble ? (
                    <Moment handoff={bubble} />
                  ) : (
                    // Open, the room is the hand the pill offers.
                    <RoomState busy={busy} pending={pending} grown />
                  )
                }
              />
            </>
          )}
        </div>
      ) : (
        <Chip
          crew={crew}
          more={more}
          bubble={bubble}
          playing={playing}
          resting={!awake}
          // What waits on the user and nothing else: a finished job's result is the left
          // corner's card (artifact-view), and one notice is enough
          rows={waiting}
          count={threads.length}
          busy={busy}
          pending={pending}
          onPick={(id) => {
            setPicked(id);
            setClosing(false);
            setOpen(true);
          }}
          // Always the list: a thread opens from its row, or when Thursday opens it.
          onOpen={() => {
            setClosing(false);
            setOpen(true);
          }}
        />
      )}
    </div>
  );
});

/**
 * How a thread is shown, beside the fold button: beside its office where her face stands, or as
 * the conversation alone with her face kept. One choice for every thread, kept on this machine
 * (thread.store roomReadAs).
 */
function ReadAsSwitch() {
  const readAs = useRoomReadAs();
  return (
    <Segmented
      view
      size="sm"
      aria-label="How the thread is shown"
      value={readAs}
      onChange={roomReadAs.set}
      options={[
        {
          value: "office",
          label: "Office",
          title: "The thread beside its office, where her face stands",
        },
        {
          value: "chat",
          label: "Chat",
          title: "The conversation alone, her face kept",
        },
      ]}
      className="shrink-0"
    />
  );
}

/**
 * Said at the head of the open room while a call in writing waits behind it. The room has
 * the foot, so the line that would say the call is on is not drawn: without this, opening
 * a thread mid-conversation looks like the conversation ended. It is her face and a way
 * back in one press, since Esc from a thread takes two.
 */
function CallWaits({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="group/waits flex shrink-0 items-center gap-2.5 bg-brand/8 py-2.5 pr-3 pl-4 text-left outline-none transition-colors hover:bg-brand/12 focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-brand/14 dark:hover:bg-brand/20"
    >
      <ThursdayMark size={22} className="shrink-0" />
      <span className="min-w-0 flex-1 text-[13px] leading-5">
        <span className="font-medium">Thursday is still on the line</span>
        <span className="text-muted-foreground">
          {" "}
          — in writing. She is here when this closes.
        </span>
      </span>
      <span className="flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 font-medium text-[12.5px] text-brand ring-1 ring-brand/40 transition-colors group-hover/waits:bg-brand/10">
        Back to her
        <ArrowRight className="size-3.5" />
      </span>
    </button>
  );
}
