"use client";

import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  FolderOpen,
  History,
  Plus,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import {
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAppEvent } from "@/app/api/events/app-event.client";
import { queryKey } from "@/app/api/query-key";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { notify } from "@/components/ui/notify";
import { ShinyText } from "@/components/ui/shiny-text";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  APP_NAME,
  BOT_ROSTER,
  BOT_RUN,
  COMMON_VALIDATE,
  MAX_PINNED_TOOLS,
  PROMPT_CROWDED,
} from "@/config";
import { EffortSwitch } from "@/features/ai/components/effort-switch";
import { ModelPicker } from "@/features/ai/components/model-picker";
import {
  type AiProvider,
  type CatalogModel,
  compactAtFor,
  contextWindowOf,
  type Effort,
  isCatalogProvider,
  planMediaOf,
  type TextModelProviderId,
} from "@/features/ai/model.schema";
import {
  clearOwnLineAction,
  createBotAction,
  createSeedBotsAction,
  deleteBotAction,
  setBotMemoryOnAction,
  updateBotAction,
} from "@/features/bot/bot.action";
import {
  type Bot,
  type BotForm,
  type BotIcon,
  type BotMemory,
  type BotMemoryFile,
  randomBotIcon,
  type Thread,
} from "@/features/bot/bot.schema";
import { BOT_SEEDS, type BotSeed } from "@/features/bot/bot.seed";
import { BotMark, iconProps } from "@/features/bot/components/bot-mark";
import { BotLessons } from "@/features/bot/components/lesson-rows";
import { MarkPalette } from "@/features/bot/components/mark-palette";
import {
  type BotRef,
  roomOpens,
  type ThreadView,
  threadFromRow,
} from "@/features/bot/thread.store";
import {
  type ConfigStatus,
  isConfigSet,
  MEDIA_MODEL_KEYS,
  mediaModelWords,
} from "@/features/config/config.const";
import {
  PICKED_ROW,
  SettingDialogContent,
  SettingError,
  SettingNote,
  SettingPanes,
  SettingPanesSkeleton,
  SettingRailNote,
} from "@/features/settings/components/setting-ui";
import {
  openSettings,
  useSettingsStore,
} from "@/features/settings/settings.store";
import {
  FileBody,
  useFileText,
} from "@/features/workspace/components/file-view";
import { viewKindOf } from "@/features/workspace/file-kind";
import {
  deleteWorkspaceFileAction,
  revealFileAction,
} from "@/features/workspace/workspace.action";
import { useObjectState } from "@/hooks/use-object-state";
import { type DateLike, shortAgo, whenOf } from "@/lib/date-like";
import { useServerAction } from "@/lib/protocol/use-server-action";
import { revalidate, useServerRoute } from "@/lib/protocol/use-server-route";
import { cn, formatCount, WAITING_INK } from "@/lib/utils";
import { MARK_SHAPES, MARK_SYSTEM } from "../mark.const";

/** A new bot's Create, raised from its page to the rail at the foot of the screen. */
type DraftCreate = {
  /** What the form still lacks, in words ("a name"); empty when it can be created. */
  missing: string[];
  creating: boolean;
  submit: () => void;
};

/**
 * The bots Thursday hands background work to. Roster on the left, the picked bot's
 * page on the right. Fields save on blur or on pick; only a new bot has a Create button,
 * in the rail at the foot where every other form keeps its own.
 */
export function BotSetting() {
  const { data, isLoading, error } = useServerRoute<Bot[]>(queryKey.bot);
  const bots = data ?? [];
  // A bot that rewrote its own description while this was open (self.tool)
  useAppEvent({ bots: () => void revalidate(queryKey.bot) });
  // First page of history, not the inbox: the inbox keeps only a few finished threads.
  const { data: history } = useServerRoute<Thread[]>(
    queryKey.threadHistory(null),
  );
  const jobs = history ?? [];
  // The same page read as the room reads threads, for the office a bot's page holds it in
  const sat = useMemo(
    () => (history ?? []).map((row) => threadFromRow(row, data)),
    [history, data],
  );
  /** Picked roster entry: a bot name, NEW, or null for the first bot. */
  const [picked, setPicked] = useState<string | null>(null);

  const [draft, setDraft] = useState<DraftCreate | null>(null);

  if (isLoading) return <SettingPanesSkeleton />;
  if (error) return <SettingError message={error.message} />;

  const drafting = picked === NEW;
  const on = bots.filter((bot) => !bot.disabled).length;
  const have = new Set(bots.map((bot) => bot.name));
  const missing = BOT_SEEDS.filter((seed) => !have.has(seed.name));
  const current = drafting
    ? null
    : (bots.find((bot) => bot.name === picked) ?? bots[0] ?? null);

  return (
    <SettingPanes
      footer={
        bots.length === 0 && !drafting ? null : (
          <BotRail bot={current} draft={drafting ? draft : null} />
        )
      }
      left={
        <div className="flex flex-col py-2">
          {/* The two ways to get a bot, on one line and apart from the roster
              under it: a seed is not a bot you have. At the ceiling the line
              says so in their place, since neither could make one */}
          {bots.length >= BOT_ROSTER.max ? (
            <p className="mx-2 mb-1 px-2 py-1.5 font-mono text-[11px] leading-5 text-muted-foreground">
              {bots.length} bots · {BOT_ROSTER.max} is the most
            </p>
          ) : (
            <div className="mx-2 mb-1 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPicked(NEW)}
                className={cn(
                  "flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                  drafting
                    ? PICKED_ROW
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Plus className="size-3.5 shrink-0" />
                New bot
              </button>

              {bots.length > 0 && missing.length > 0 && (
                <SeedInvite
                  missing={missing}
                  have={have}
                  onDone={(name) => setPicked(name)}
                />
              )}
            </div>
          )}

          {bots.map((bot) => (
            <RosterRow
              key={bot.name}
              bot={bot}
              job={jobs.find((job) => job.bot === bot.name) ?? null}
              active={!drafting && bot.name === current?.name}
              onPick={() => setPicked(bot.name)}
            />
          ))}

          {/* Only bots that are on: a switched-off one is in no prompt to crowd. */}
          {on > PROMPT_CROWDED.bots && (
            <SettingNote className="mx-3 mt-2 leading-relaxed">
              {on} bots are on. Each is a line in every prompt, and one more for
              Thursday to choose between.
            </SettingNote>
          )}
        </div>
      }
      right={
        drafting ? (
          <BotPage
            key="new"
            jobs={[]}
            onDone={(name) => setPicked(name)}
            onDraft={setDraft}
          />
        ) : current ? (
          // Keyed by name so field state does not carry over to the next bot.
          <BotPage
            key={current.name}
            bot={current}
            jobs={jobs
              .filter((job) => job.bot === current.name)
              .slice(0, RECENT)}
            desk={deskOf(sat, current.name)}
            onDone={() => setPicked(null)}
          />
        ) : missing.length > 0 ? (
          // Nothing on the roster: the offer is the only thing this pane could
          // hold, so it fills it rather than sitting in a dialog nobody opened
          <SeedPackage have={have} onDone={(name) => setPicked(name)} />
        ) : (
          <div className="space-y-4 p-8">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Thursday talks; bots do the rest — search the web, draft a reply,
              check a schedule. Give one a job and a model, and work gets handed
              over mid-call while the conversation keeps going.
            </p>
            <Button variant="outline" onClick={() => setPicked(NEW)}>
              <Plus />
              New bot
            </Button>
          </div>
        )
      }
    />
  );
}

/** Roster selections that are not a bot; values no bot name can be. */
const NEW = " new";
/** Jobs shown under Recent on a bot's page. */
const RECENT = 3;

/**
 * The jobs a bot's desk is read from, as its own or called in: the one it is at work or waiting
 * in now, and the last it sat in.
 */
function deskOf(threads: ThreadView[], bot: string): Desk {
  const sat = threads.filter((thread) =>
    thread.roster.some((one) => one.name === bot),
  );
  const now =
    sat.find(
      (thread) => thread.status === "working" || thread.status === "waiting",
    ) ?? null;
  return { now, last: now ?? sat[0] ?? null };
}

type Desk = { now: ThreadView | null; last: ThreadView | null };

/** The office drawing loads only when a bot's page shows a desk, as the room loads it. */
const BotDesk = dynamic(
  () =>
    import("@/features/bot/components/office-view").then(
      (module) => module.BotDesk,
    ),
  { ssr: false },
);

/** One roster line: face, name, and what the bot is doing now. */
function RosterRow({
  bot,
  job,
  active,
  onPick,
}: {
  bot: Bot;
  /** Latest job if it is on the first history page; `bot.lastJobAt` covers the rest. */
  job: Thread | null;
  active: boolean;
  onPick: () => void;
}) {
  const line = liveLine(job, bot.lastJobAt, bot.disabled);
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "mx-2 flex items-center gap-2.5 rounded-md px-2 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
        active ? PICKED_ROW : "hover:bg-muted/60",
      )}
    >
      <BotMark
        size={32}
        {...markProps(bot.name, bot.icon)}
        state={job?.status === "running" ? "thinking" : "idle"}
        notify={job?.status === "waiting"}
        crossed={job?.status === "cancelled"}
        className={cn("shrink-0", bot.disabled && "opacity-45")}
      />
      <span
        className={cn(
          "min-w-0 flex-1 space-y-0.5",
          bot.disabled && "opacity-45",
        )}
      >
        <span
          className={cn(
            "block truncate text-[13px]",
            active ? "font-medium" : "text-foreground/90",
          )}
        >
          {bot.name}
        </span>
        {line.shine ? (
          <ShinyText
            text={line.text}
            tone={line.amber ? "waiting" : "muted"}
            className="block truncate font-mono text-[11px] leading-4"
          />
        ) : (
          <span className="block truncate font-mono text-[11px] leading-4 text-muted-foreground">
            {line.text}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * What the bot is doing, most urgent first. Every wait is amber: the job moves
 * again only when the user answers, whatever stopped it. Which kind of stop it
 * was is the words' job, not the colour's.
 */
function liveLine(
  job: Thread | null,
  lastJobAt: Bot["lastJobAt"],
  disabled: boolean,
): {
  text: string;
  shine?: boolean;
  amber?: boolean;
} {
  if (job?.status === "waiting") {
    return { text: "waiting on you", shine: true, amber: true };
  }
  if (job?.status === "running") {
    return { text: `working · ${job.label}`, shine: true };
  }
  // Switched off, and no colour: off is the user's own choice, not something
  // waiting on them, so the word carries it. It stands where the idle line
  // would — the two cases above are a job it already had, which off never
  // stopped, and hiding an ask behind "off" is how one goes unanswered.
  if (disabled) return { text: "off" };
  if (!job) {
    if (!lastJobAt) return { text: "idle · no jobs yet" };
    return { text: `idle · last job ${sinceWord(lastJobAt)}` };
  }
  return { text: `idle · last job ${sinceWord(job.updatedAt)}` };
}

/** "just now" or "3h ago". */
function sinceWord(at: DateLike): string {
  const ago = shortAgo(at);
  return ago === "now" ? "just now" : `${ago} ago`;
}
/**
 * What a seed still needs before it can work, as one line, or null when it needs
 * nothing. A studio kind nobody picked and the GPT Subscription does not make is
 * absent — the tool is not there — so the row says so before the bot finds out
 * mid-job. Ticking is never blocked: the list states the cost, it does not cap it.
 */
function unmetLine(
  seed: BotSeed,
  isSet: (key: string) => boolean,
  /** The GPT Subscription's sign-in and its plan (model.schema planMediaOf); null when signed out. */
  signIn: { plan: string | null } | null,
): string | null {
  const unmet = (seed.requires ?? []).filter(
    (kind) => !isSet(MEDIA_MODEL_KEYS[kind]) && !planMediaOf(kind, signIn),
  );
  if (!unmet.length) return null;
  return `needs ${unmet.map(mediaModelWords).join(" and ")}`;
}

/**
 * The picker's state, shared by the two places the offer appears: the pane an
 * empty roster opens on, and the dialog the roster's invite opens. Seeds are
 * ticked already, because the set is the recommendation and unticking is the
 * decision; one already on the roster is locked on and says so, since `createBot`
 * would only answer "already exists", which is an error about something this
 * screen already knows. Near BOT_ROSTER.max only as many as fit start ticked, in
 * list order, and the rest wait until one is unticked. One call creates all of them.
 */
function useSeedPicks(
  have: Set<string>,
  onDone: (name: string | null) => void,
) {
  const room = Math.max(0, BOT_ROSTER.max - have.size);
  const [off, setOff] = useState<Set<string>>(
    () =>
      new Set(
        BOT_SEEDS.filter((seed) => !have.has(seed.name))
          .slice(room)
          .map((seed) => seed.name),
      ),
  );
  const [add, adding] = useServerAction(createSeedBotsAction, {
    onOk: (made) => {
      revalidate(queryKey.bot);
      onDone(made.created[0] ?? null);
    },
  });
  // Same key the Models section and its badge read, so one fetch answers all three.
  const { data: config } = useServerRoute<ConfigStatus[]>(queryKey.config);
  const isSet = (key: string) => isConfigSet(config, key);
  // The plan the sign-in is on, which decides what it makes (unmetLine)
  const { data: providers } = useServerRoute<AiProvider[]>(queryKey.llmModel);
  const plan = providers?.find((provider) => provider.signIn);
  const signIn = plan?.hasKey ? { plan: plan.plan ?? null } : null;

  // Seeds not on the roster yet. `have` is the whole roster, so counting against
  // its size goes negative the moment a bot nobody seeded is on it.
  const addable = BOT_SEEDS.filter((seed) => !have.has(seed.name));
  const wanted = addable.filter((seed) => !off.has(seed.name));
  const limited = room < addable.length;
  const full = wanted.length >= room;
  const fit = `${room} more ${room === 1 ? "fits" : "fit"}`;

  return {
    isSet,
    signIn,
    adding,
    addable,
    wanted,
    /** Fewer places are left than seeds on offer (BOT_ROSTER.max). */
    limited,
    /** What Add will do, said before the click; near the ceiling, how many fit. */
    note: limited
      ? full
        ? `${fit} · untick one to pick another`
        : `${wanted.length} ticked · ${fit}`
      : wanted.length === 0
        ? "nothing ticked"
        : `${wanted.length} of ${addable.length} ticked`,
    ticked: (seed: BotSeed) => have.has(seed.name) || !off.has(seed.name),
    /** Unticked while every place left is taken: it can be ticked once another is not. */
    blocked: (seed: BotSeed) =>
      !have.has(seed.name) && off.has(seed.name) && full,
    toggle: (name: string) =>
      setOff((was) => {
        const next = new Set(was);
        // Off is the unticked set: ticking one takes a place, unticking gives it back
        if (!next.has(name)) next.add(name);
        else if (!full) next.delete(name);
        return next;
      }),
    submit: () =>
      add(
        wanted.map((seed) => ({
          name: seed.name,
        })),
      ),
  };
}

/** The rows themselves. Both wrappers draw these and supply their own chrome. */
function SeedRows({
  have,
  picks,
}: {
  have: Set<string>;
  picks: ReturnType<typeof useSeedPicks>;
}) {
  return (
    <div className="flex flex-col gap-2">
      {BOT_SEEDS.map((seed) => {
        const owned = have.has(seed.name);
        const on = picks.ticked(seed);
        const blocked = picks.blocked(seed);
        const needs = unmetLine(seed, picks.isSet, picks.signIn);
        return (
          <div
            key={seed.name}
            className={cn(
              "rounded-xl ring-1 transition-colors",
              owned || blocked
                ? "opacity-45 ring-border/60"
                : on
                  ? cn(PICKED_ROW, "ring-brand")
                  : "ring-border/60",
            )}
          >
            <button
              type="button"
              disabled={owned || blocked || picks.adding}
              aria-pressed={on}
              onClick={() => picks.toggle(seed.name)}
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default"
            >
              <BotMark
                size={28}
                {...markProps(seed.name, seed.icon)}
                className={cn(
                  "shrink-0 transition-opacity",
                  !on && "opacity-35",
                )}
              />
              {/* The hint stays on one line: the list grows, and a wrapping
                  sentence per row is what made this read as a page of prose */}
              <span className="min-w-0 flex-1 space-y-px">
                <span className="block text-[14px] leading-[18px] font-medium">
                  {seed.name}
                </span>
                <span className="block truncate text-[12px] leading-[17px] text-muted-foreground">
                  {seed.hint}
                </span>
              </span>
              {owned ? (
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  already added
                </span>
              ) : needs ? (
                <span
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 font-mono text-[11px]",
                    WAITING_INK,
                  )}
                >
                  <CircleAlert className="size-3" />
                  {needs}
                </span>
              ) : null}
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full transition-colors",
                  on
                    ? "bg-brand text-brand-foreground"
                    : "ring-1 ring-border/60 ring-inset",
                )}
              >
                {on && <Check className="size-3" />}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Says what Add will do, so the count is checkable before the click. */
function SeedActions({
  picks,
  onCancel,
}: {
  picks: ReturnType<typeof useSeedPicks>;
  onCancel: () => void;
}) {
  return (
    <>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        loading={picks.adding}
        disabled={picks.wanted.length === 0}
        onClick={picks.submit}
      >
        <Plus />
        {picks.wanted.length === 1
          ? `Add ${picks.wanted[0].name}`
          : `Add ${picks.wanted.length} bots`}
      </Button>
    </>
  );
}

/**
 * The offer as a pane: what an empty roster opens on, because nothing else could
 * be there. A roster with bots on it gets `SeedInvite` and a dialog instead — a
 * row among the bots read as a bot the user already had.
 */
function SeedPackage({
  have,
  onDone,
}: {
  /** Names already on the roster. */
  have: Set<string>;
  onDone: (name: string | null) => void;
}) {
  const picks = useSeedPicks(have, onDone);

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex h-11 shrink-0 items-center border-b border-border/60 px-4 font-mono text-[11px] text-muted-foreground">
        Ready-made
      </div>

      <div className="px-8 pt-7 pb-1">
        <h3 className="text-[17px] font-medium tracking-tight">
          Bots you can add
        </h3>
        <p className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-muted-foreground break-keep wrap-anywhere">
          Each one is a starting point — re-prompt it, give it a model of its
          own. What a bot needs before it can work stands on its row; until then
          it runs on the app default model.
        </p>
      </div>

      {/* pb, not the footer's own: the pane scrolls, so the last row would
          otherwise end hard against the rule above Add */}
      <div className="px-8 pt-4 pb-8">
        <SeedRows have={have} picks={picks} />
      </div>

      <div className="mt-auto flex items-center gap-3 border-t border-border/60 px-8 py-4">
        <span className="flex-1 font-mono text-[11px] text-muted-foreground">
          {picks.note}
        </span>
        <SeedActions picks={picks} onCancel={() => onDone(null)} />
      </div>
    </div>
  );
}

/** The same offer in a dialog, which brings its own padding and its own footer. */
function SeedDialog({
  have,
  onDone,
}: {
  have: Set<string>;
  onDone: (name: string | null) => void;
}) {
  const picks = useSeedPicks(have, onDone);

  return (
    <SettingDialogContent
      title="Bots you can add"
      description="Each one is a starting point — re-prompt it, give it a model of its own. What a bot needs before it can work stands on its row."
      footer={
        <>
          {/* Only near the ceiling: otherwise Add's own label says what it does */}
          {picks.limited && (
            <span className="flex-1 self-center font-mono text-[11px] text-muted-foreground">
              {picks.note}
            </span>
          )}
          <SeedActions picks={picks} onCancel={() => onDone(null)} />
        </>
      }
    >
      <SeedRows have={have} picks={picks} />
    </SettingDialogContent>
  );
}

/**
 * Faces the invite carries before the rest become a count. The line it sits on is
 * the roster's width less New bot, and every seed drawn is a word off that label.
 */
const INVITE_FACES = 3;

/**
 * The invite, on the New bot line rather than in the roster: both are ways to get
 * a bot, and neither is a bot you have. It carries the faces of the ones still on
 * offer, in the colours they would be created with, because a row of names would
 * read as one more list and the faces are what says these are bots.
 */
function SeedInvite({
  missing,
  have,
  onDone,
}: {
  missing: BotSeed[];
  have: Set<string>;
  onDone: (name: string | null) => void;
}) {
  const shown = missing.slice(0, INVITE_FACES);
  const rest = missing.length - shown.length;
  return (
    <button
      type="button"
      title="Ready-made bots"
      aria-label={`Ready-made bots, ${missing.length} on offer`}
      onClick={() =>
        notify.component({
          className: "sm:max-w-xl",
          renderer: ({ close }) => (
            <SeedDialog
              have={have}
              onDone={(name) => {
                close();
                onDone(name);
              }}
            />
          ),
        })
      }
      className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
    >
      {/* Says the same thing the words next to it do, about a different set: these
          are bots to add. It carries the affordance on its own when one seed is
          left and the faces are a single dot */}
      <Plus className="size-3 shrink-0" />
      {shown.map((seed, at) => (
        <span
          key={seed.name}
          className={cn("block", at > 0 && "-ml-1.5")}
          style={{ zIndex: shown.length - at }}
        >
          <BotMark
            size={20}
            {...markProps(seed.name, seed.icon)}
            notify={false}
          />
        </span>
      ))}
      {rest > 0 && (
        <span className="ml-0.5 shrink-0 font-mono text-[11px] tabular-nums">
          +{rest}
        </span>
      )}
    </button>
  );
}

/**
 * The mark seed is the name, not the row id, so a new bot's preview is the face the
 * roster will show. An unpicked colour stays empty and means the theme ink.
 */
function markProps(name: string, icon?: BotIcon | null) {
  return { seed: name || "bot", ...iconProps(icon) };
}

/**
 * One bot's page, or the form for a new one when `bot` is absent. Existing bots save
 * on blur or on pick; a new bot becomes a row on Create. The name is not editable:
 * renaming is delete and recreate (bot.query updateBot).
 */
function BotPage({
  bot,
  jobs,
  desk,
  onDone,
  onDraft,
}: {
  bot?: Bot;
  /** Recent jobs for this bot (RECENT); empty for a new bot. */
  jobs: Thread[];
  /** The jobs its desk is read from (deskOf); none for a new bot. */
  desk?: Desk;
  /** Created or deleted; where the roster should look next. */
  onDone: (name: string | null) => void;
  /** New bot only: where its Create goes, the rail at the foot (BotRail). */
  onDraft?: (draft: DraftCreate | null) => void;
}) {
  // Lazy init so a new bot's icon is not re-rolled per render; the page is keyed per bot.
  const [fields, patch] = useObjectState(() => ({
    name: bot?.name ?? "",
    description: bot?.description ?? "",
    systemPrompt: bot?.systemPrompt ?? "",
    // Stored as a value so every screen draws the same face.
    icon: bot?.icon ?? randomBotIcon(),
    provider: (bot?.provider ?? null) as TextModelProviderId | null,
    model: bot?.model ?? "",
    // In thousands of tokens, the unit the field is typed in
    compactAt: bot?.compactAt ? String(bot.compactAt / 1000) : "",
    effort: (bot?.effort ?? null) as Effort | null,
    toolIds: bot?.tools.map((tool) => tool.id) ?? [],
  }));
  const {
    name,
    description,
    systemPrompt,
    icon,
    provider,
    model,
    compactAt,
    effort,
    toolIds,
  } = fields;
  // Ties each row's label to its field (Row htmlFor)
  const fieldId = useId();
  // Typed by hand; otherwise the field shows what the picked model fills in
  const [compactEdited, setCompactEdited] = useState(Boolean(bot?.compactAt));
  // Read here as well as in the picker: a pick has to fill in from it the moment it happens
  const catalog = useServerRoute<CatalogModel[]>(
    isCatalogProvider(provider) ? queryKey.modelCatalog(provider) : null,
  );
  const windowOf = (of: TextModelProviderId | null, id: string) =>
    of && id.trim() ? contextWindowOf(of, id.trim(), catalog.data) : null;
  const pickedWindow = windowOf(provider, model);
  const filledK =
    provider && model.trim() ? filledTokens(pickedWindow) / 1000 : null;
  const shownK = compactEdited
    ? compactAt
    : filledK === null
      ? ""
      : String(filledK);

  const [save] = useServerAction(updateBotAction, {
    onOk: () => revalidate(queryKey.bot),
  });
  /** Saves now for an existing bot; a new bot holds everything until Create. */
  const commit = (next: Partial<BotForm>) => {
    if (bot) save(bot.name, next);
  };

  const [create, creating, , createError] = useServerAction(createBotAction, {
    errorMessage: false,
    okMessage: "Bot created",
    onOk: (made) => {
      revalidate(queryKey.bot);
      onDone(made.name);
    },
  });
  const [remove, removing] = useServerAction(deleteBotAction, {
    okMessage: "Bot deleted",
    onOk: () => {
      revalidate(queryKey.bot);
      onDone(null);
    },
  });
  const [clearLine, clearingLine] = useServerAction(clearOwnLineAction, {
    onOk: () => revalidate(queryKey.bot),
  });

  // No model picked is the app default model, which the form says it runs on
  const picked = Boolean(provider && model.trim());
  const ready = name.trim() && description.trim() && !creating;
  const missing = [
    !name.trim() && "a name",
    !description.trim() && "a description",
  ].filter((one): one is string => Boolean(one));

  const submit = () => {
    if (!ready) return;
    create({
      name: name.trim(),
      description: description.trim(),
      systemPrompt: systemPrompt.trim() || undefined,
      icon,
      provider: picked ? provider : null,
      model: picked ? model.trim() : null,
      compactAt: compactEdited
        ? tokensFromK(compactAt)
        : picked
          ? filledTokens(pickedWindow)
          : null,
      effort,
      toolIds,
    });
  };

  // The rail draws the Create: told when what it needs changes, never every render
  const submitNow = useRef(submit);
  submitNow.current = submit;
  const lacking = missing.join(",");
  useEffect(() => {
    onDraft?.({
      missing: lacking ? lacking.split(",") : [],
      creating,
      submit: () => submitNow.current(),
    });
  }, [onDraft, lacking, creating]);
  useEffect(() => () => onDraft?.(null), [onDraft]);

  const confirmRemove = async () => {
    if (!bot) return;
    const confirmed = await notify.confirm({
      title: `Delete ${bot.name}?`,
      description:
        "Thursday can no longer hand work to it, and what it kept for itself goes with it: its memory and the skills it installed. What it finished stays in Settings › Files, under its name.",
      okText: "Delete",
      destructive: true,
    });
    if (confirmed) remove(bot.name);
  };

  const confirmClearLine = async () => {
    if (!bot) return;
    const confirmed = await notify.confirm({
      title: `Clear ${bot.name}'s line?`,
      description: `${APP_NAME} and the other bots read your description alone again.`,
      okText: "Clear",
      destructive: true,
    });
    if (confirmed) clearLine(bot.name);
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/60 px-4">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
          {bot ? bot.name : "New bot"}
        </span>
        {bot && (
          <>
            {/* Only when off: on is the resting state and needs no word. */}
            {bot.disabled && (
              <span className="font-mono text-[10px] text-muted-foreground">
                off
              </span>
            )}
            {/* what on means, said where it is switched: the word "on" alone does not */}
            <Tooltip>
              <TooltipTrigger render={<span className="mr-1 flex shrink-0" />}>
                <Switch
                  checked={!bot.disabled}
                  onCheckedChange={(on) => commit({ disabled: !on })}
                  aria-label={`${bot.name} on or off`}
                />
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Thursday can hand it work
              </TooltipContent>
            </Tooltip>
            <Button
              size="icon-sm"
              variant="ghost"
              loading={removing}
              aria-label="Delete this bot"
              onClick={confirmRemove}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 />
            </Button>
          </>
        )}
      </div>

      <div className="flex-1 space-y-5 p-6">
        {bot && desk && <DeskBand bot={{ name: bot.name, icon }} desk={desk} />}
        <MarkPicker
          name={name}
          icon={icon}
          // the desk above draws it, and wears a new pick at once
          shown={!(bot && desk)}
          onChange={(next) => {
            patch({ icon: next });
            commit({ icon: next });
          }}
        />

        <Row label="Name" htmlFor={bot ? undefined : `${fieldId}-name`}>
          {bot ? (
            <p className="truncate text-sm leading-8 font-medium">{bot.name}</p>
          ) : (
            <Input
              id={`${fieldId}-name`}
              value={name}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder="e.g. researcher"
              spellCheck={false}
              maxLength={COMMON_VALIDATE.name.max}
              autoFocus
            />
          )}
          {/* Renaming is delete and recreate (bot.query updateBot), so say it before the name is typed */}
          <p className="text-xs text-muted-foreground">
            {bot
              ? `What ${APP_NAME} calls it when she hands it work. Fixed once the bot is made.`
              : `What ${APP_NAME} calls it when she hands it work. Up to ${COMMON_VALIDATE.name.max} characters, and it can’t be renamed later.`}
          </p>
        </Row>

        <Row label="Description" htmlFor={`${fieldId}-description`}>
          <Input
            id={`${fieldId}-description`}
            value={description}
            onChange={(event) => patch({ description: event.target.value })}
            onBlur={() => {
              const next = description.trim();
              if (bot && next && next !== bot.description) {
                commit({ description: next });
              }
            }}
            placeholder="e.g. Searches the web and answers"
            maxLength={COMMON_VALIDATE.description.max}
          />
          <p className="text-xs text-muted-foreground">
            The one line {APP_NAME} and the other bots read when they decide who
            gets a job.
          </p>
          {/* The bot's own words, read after the description wherever it is
              listed (bot.schema rosterLine): theirs to write, the user's to clear */}
          {bot?.ownLine && (
            <div className="mt-1 flex items-start gap-2 rounded-lg bg-muted/50 py-2 pr-1.5 pl-2.5">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-[13px] leading-[18px]">{bot.ownLine.line}</p>
                <p className="font-mono text-[11px] leading-4 text-muted-foreground">
                  added by {bot.name} · {whenOf(new Date(bot.ownLine.at))} ·{" "}
                  {bot.ownLine.reason}
                </p>
              </div>
              <Button
                size="icon-xs"
                variant="ghost"
                loading={clearingLine}
                aria-label="Clear its line"
                onClick={confirmClearLine}
                className="shrink-0 text-muted-foreground"
              >
                <X />
              </Button>
            </div>
          )}
          {bot && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={!bot.descriptionLocked}
                onCheckedChange={(on) => commit({ descriptionLocked: !on })}
                aria-label={`${bot.name} may add its own line`}
              />
              It may add its own line when its work changes for good
            </label>
          )}
        </Row>

        <Row label="Runs on">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <ModelPicker
                provider={provider}
                model={model}
                onChange={(next) => {
                  patch({ provider: next.provider, model: next.model });
                  // A new model fills in its own point; a number typed for the old one no longer fits
                  setCompactEdited(false);
                  // A provider without a model is not a model; save once both are picked.
                  if (next.model) {
                    commit({
                      ...next,
                      compactAt: filledTokens(
                        windowOf(next.provider, next.model),
                      ),
                    });
                  }
                }}
                onUnset={() => {
                  // Back on the app default model, and on its effort with it: a step belongs to the
                  // ladder it came from, and this bot no longer names a model to read one off.
                  patch({ provider: null, model: "", effort: null });
                  setCompactEdited(false);
                  commit({
                    provider: null,
                    model: null,
                    compactAt: null,
                    effort: null,
                  });
                }}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {model.trim()
              ? "What this bot thinks with. App default puts it back on the one in Settings › Models."
              : "App default model, and its effort with it."}
          </p>
        </Row>

        <Row label="Effort">
          <EffortSwitch
            provider={provider}
            model={model.trim()}
            value={effort}
            onChange={(next) => {
              patch({ effort: next });
              commit({ effort: next });
            }}
          />
          <p className="text-xs text-muted-foreground">
            How hard it thinks, on the steps this model takes. Auto leaves the
            step to the model.
          </p>
        </Row>

        <Row label="Compacts at" htmlFor={`${fieldId}-compact`}>
          <InputGroup>
            <InputGroupInput
              id={`${fieldId}-compact`}
              inputMode="decimal"
              value={shownK}
              placeholder={model.trim() ? "" : "From the app default model"}
              onChange={(event) => {
                setCompactEdited(true);
                patch({ compactAt: event.target.value });
              }}
              onBlur={() => {
                if (!compactEdited) return;
                // Typing is a draft; only a settled field is a value. Emptied, the field goes back to the model's own
                const typed = tokensFromK(compactAt);
                if (typed === null) setCompactEdited(false);
                else patch({ compactAt: String(typed / 1000) });
                commit({
                  compactAt:
                    typed ?? (model.trim() ? filledTokens(pickedWindow) : null),
                });
              }}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>k tokens</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          <p className="text-xs text-muted-foreground">
            {compactNote({
              model: model.trim(),
              window: pickedWindow,
              shown: tokensFromK(shownK),
            })}
          </p>
        </Row>

        <Row label="Tools">
          <ToolPicker
            selected={toolIds}
            onChange={(next) => {
              patch({ toolIds: next });
              commit({ toolIds: next });
            }}
          />
        </Row>

        <Row label="Prompt" htmlFor={`${fieldId}-prompt`}>
          <Textarea
            id={`${fieldId}-prompt`}
            value={systemPrompt}
            onChange={(event) => patch({ systemPrompt: event.target.value })}
            onBlur={() => {
              const next = systemPrompt.trim();
              if (bot && next !== (bot.systemPrompt ?? "")) {
                commit({ systemPrompt: next });
              }
            }}
            placeholder={`How it should work (optional). e.g.\nSearch the web, answer with a short summary and links.`}
            maxLength={COMMON_VALIDATE.prompt.max}
            // field-sizing-content grows with the text; cap it so a long prompt does not push the rest off screen.
            className="max-h-48 min-h-24 resize-none overflow-y-auto text-sm"
          />
          {systemPrompt.length > 0 && (
            <p className="text-right font-mono text-[10px] text-muted-foreground">
              {systemPrompt.length}/{COMMON_VALIDATE.prompt.max}
            </p>
          )}
        </Row>

        {bot && <BotLessons bot={bot.name} />}

        {bot && <Memory bot={bot.name} />}

        {bot && <Recent jobs={jobs} />}

        {createError && (
          <p className="font-mono text-xs text-destructive">{createError}</p>
        )}
      </div>
    </div>
  );
}

/**
 * What this bot keeps for its next jobs (bot.memory), drawn the way Recent is: one
 * line per file, newest first. A row opens in place. Deleting is the one thing done
 * to a file from here — writing one is the bot's.
 */
function Memory({ bot }: { bot: string }) {
  const key = queryKey.botMemoryFiles(bot);
  const { data, isLoading } = useServerRoute<BotMemory>(key);
  const [open, setOpen] = useState<string | null>(null);
  const [reveal] = useServerAction(revealFileAction);
  const [remove, removing] = useServerAction(deleteWorkspaceFileAction, {
    okMessage: "File deleted",
    onOk: () => {
      setOpen(null);
      revalidate(key);
      revalidate(queryKey.workspace);
    },
  });

  const confirmRemove = async (file: BotMemoryFile) => {
    const confirmed = await notify.confirm({
      title: `Delete ${file.file}?`,
      description: `It is deleted from disk for good, and ${bot}'s next job starts without it.`,
      okText: "Delete",
      destructive: true,
    });
    if (confirmed) remove(file.path);
  };

  return (
    <div className="pt-1">
      <div className="flex h-6 items-center">
        <span className="font-mono text-xs text-muted-foreground">Memory</span>
        <span className="flex-1" />
        {data && data.total > 0 && (
          <>
            <span className="pr-1 font-mono text-[11px] text-muted-foreground tabular-nums">
              {data.total === 1 ? "1 file" : `${data.total} files`}
            </span>
            <button
              type="button"
              title="Show in the file manager"
              onClick={() => reveal(data.folder)}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 font-mono text-[11px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <FolderOpen className="size-3" />
              Folder
            </button>
          </>
        )}
      </div>
      {isLoading ? (
        <div className="flex h-9 items-center border-t border-border/60">
          <Skeleton className="h-3 w-56" />
        </div>
      ) : !data?.entries.length ? (
        <p className="py-2 text-[13px] text-muted-foreground">
          Nothing kept yet.
        </p>
      ) : (
        data.entries.map((file) => {
          const isOpen = open === file.path;
          return (
            <div key={file.path} className="border-t border-border/60">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : file.path)}
                className="flex h-9 w-full items-center gap-3 text-left text-[13px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    isOpen && "font-medium",
                  )}
                >
                  {file.line || file.file}
                </span>
                <span className="w-36 shrink-0 truncate font-mono text-[11px] text-muted-foreground">
                  {file.file}
                </span>
                <span className="w-28 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                  {whenOf(file.at)}
                </span>
                <ChevronRight
                  className={cn(
                    "size-3 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-90",
                  )}
                />
              </button>
              {isOpen && (
                <div className="flex items-start gap-3">
                  <div className="max-h-96 min-w-0 flex-1 overflow-y-auto">
                    <MemoryText path={file.path} />
                  </div>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete ${file.file}`}
                    loading={removing}
                    onClick={() => confirmRemove(file)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

/** An opened memory file, read and capped the way Workspace reads one (file-view useFileText). */
function MemoryText({ path }: { path: string }) {
  const { content, failure, truncated } = useFileText(path);
  if (failure) {
    return <p className="pb-3 font-mono text-xs text-destructive">{failure}</p>;
  }
  if (content === null) {
    return (
      <div className="space-y-2 pb-3">
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  const kind = viewKindOf(path);
  return (
    <FileBody
      kind={kind}
      content={kind === "markdown" ? underItsRow(content) : content}
      truncated={truncated}
      where="inline"
    />
  );
}

/**
 * A markdown memory file as it reads under its row: the row already carries the
 * file's first line, so frontmatter and a leading heading are not drawn again.
 */
const underItsRow = (content: string) =>
  content.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/^\s*#[^\n]*\n?/, "");

/**
 * What the roster's pick is, and the setting that is the whole set's rather than any
 * bot's: whether bots keep their own memory.
 */
function BotRail({
  bot,
  draft = null,
}: {
  bot: Bot | null;
  /** A new bot on the page: its Create stands at the end of the rail. */
  draft?: DraftCreate | null;
}) {
  const { data: memoryOn, mutate } = useServerRoute<boolean>(
    queryKey.botMemory,
  );
  const [setMemoryOn] = useServerAction(setBotMemoryOnAction, {
    onOk: () => revalidate(queryKey.botMemory),
    // The switch was moved before the write: one that failed puts it back where it is kept
    onError: () => revalidate(queryKey.botMemory),
  });
  const tokens = bot ? bot.tokens.input + bot.tokens.output : 0;
  return (
    <>
      <SettingRailNote>
        {bot ? (
          <span className="font-mono text-[11px]">
            {bot.name}
            {bot.disabled && (
              <>
                <span className="px-1.5 opacity-50">·</span>off
              </>
            )}
            <span className="px-1.5 opacity-50">·</span>
            <span
              title={`in ${formatCount(bot.tokens.input)} · out ${formatCount(bot.tokens.output)}`}
            >
              {tokens > 0 ? `${formatCount(tokens)} tokens` : "no tokens yet"}
            </span>
            <span className="px-1.5 opacity-50">·</span>
            since {whenOf(bot.createdAt)}
          </span>
        ) : draft?.missing.length ? (
          `Needs ${
            draft.missing.length > 1
              ? `${draft.missing.slice(0, -1).join(", ")} and ${draft.missing.at(-1)}`
              : draft.missing[0]
          }`
        ) : null}
      </SettingRailNote>
      <span className="shrink-0 text-xs text-muted-foreground">
        Bots keep their own memory
      </span>
      <Switch
        checked={memoryOn ?? true}
        disabled={memoryOn === undefined}
        onCheckedChange={(on) => {
          void mutate(on, false);
          setMemoryOn(on);
        }}
        aria-label="Bots keep their own memory"
      />
      {draft && (
        <Button
          size="sm"
          loading={draft.creating}
          disabled={draft.missing.length > 0}
          onClick={draft.submit}
        >
          Create bot
        </Button>
      )}
    </>
  );
}

/** "800", "800k" or "1.2" → tokens (800,000 / 1,200); null when there is no number. */
function tokensFromK(text: string): number | null {
  const k = Number(text.replace(/[^0-9.]/g, ""));
  return Number.isFinite(k) && k > 0 ? Math.round(k * 1000) : null;
}

/** What a model fills in, rounded to the field's unit so the saved number is the one shown (model.schema compactAtFor). */
const filledTokens = (window: number | null) =>
  Math.round(compactAtFor(window) / 1000) * 1000;

/** The line under the field: where the number came from. */
function compactNote(input: {
  model: string;
  window: number | null;
  shown: number | null;
}): string {
  const summarize = "A job summarizes itself here and carries on.";
  // No model of its own: each run works it out from the model it runs on (model.ts compactBudget)
  if (!input.model)
    return input.shown === null
      ? `Worked out from the app default model's context window at each run. ${summarize}`
      : `Set by hand. Emptied, it is worked out from the app default model again. ${summarize}`;
  const filled = filledTokens(input.window);
  if (input.shown !== null && input.shown !== filled) {
    return `Set by hand. Picking a model fills in its own again. ${summarize}`;
  }
  return input.window
    ? `${Math.round(BOT_RUN.compactHeadroom * 100)}% of this model's ${(input.window / 1000).toLocaleString()}k context window. ${summarize}`
    : `This model's context window is unknown, so the default is filled in. ${summarize}`;
}

function Row({
  label,
  htmlFor,
  children,
}: {
  label: string;
  /** The field the label names, so a screen reader reads it and a click focuses it. */
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <label
        htmlFor={htmlFor}
        className="w-20 shrink-0 pt-2 font-mono text-xs text-muted-foreground"
      >
        {label}
      </label>
      <div className="min-w-0 flex-1 space-y-1.5">{children}</div>
    </div>
  );
}

/**
 * The bot alone at its desk across the top of its page, as it stands now, and under it the job
 * it is at or was at last; Open takes the user to that thread in the room.
 */
function DeskBand({ bot, desk }: { bot: BotRef; desk: Desk }) {
  const job = desk.last;
  const open = (id: string) => {
    // The thread opens where threads are read: the room on the call screen
    useSettingsStore.getState().hide();
    roomOpens.open(id);
  };
  return (
    <div className="-mx-6 -mt-6">
      <BotDesk bot={bot} thread={desk.now} className="h-72" />
      <div className="flex h-9 items-center gap-3 px-6 text-[13px]">
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {desk.now ? "Now" : job ? "Last" : "Free"}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {job ? (
            job.label
          ) : (
            <span className="text-muted-foreground">No job yet</span>
          )}
        </span>
        {job && (
          <>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
              {whenOf(job.updatedAt)}
            </span>
            <button
              type="button"
              onClick={() => open(job.id)}
              className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 font-mono text-[11px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Open
              <ArrowUpRight className="size-3" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** This bot's recent jobs; the full list is in Settings > Threads. */
function Recent({ jobs }: { jobs: Thread[] }) {
  return (
    <div className="pt-1">
      <div className="flex h-6 items-center">
        <span className="font-mono text-xs text-muted-foreground">Recent</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => openSettings("threads")}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 font-mono text-[11px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <History className="size-3" />
          History
        </button>
      </div>
      {jobs.length === 0 ? (
        <p className="py-2 text-[13px] text-muted-foreground">
          Nothing handed over yet.
        </p>
      ) : (
        jobs.map((job) => {
          const state = jobState(job);
          return (
            <div
              key={job.id}
              className="flex h-9 items-center gap-3 border-t border-border/60 text-[13px]"
            >
              <span className="min-w-0 flex-1 truncate">{job.label}</span>
              {job.status === "running" ? (
                <ShinyText
                  text={state.text}
                  className="shrink-0 font-mono text-[11px]"
                />
              ) : (
                <span
                  className={cn("shrink-0 font-mono text-[11px]", state.tone)}
                >
                  {state.text}
                </span>
              )}
              <span className="w-28 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                {whenOf(job.updatedAt)}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

function jobState(job: Thread): { text: string; tone: string } {
  switch (job.status) {
    case "waiting":
      return { text: "waiting on you", tone: WAITING_INK };
    case "running":
      return { text: "working", tone: "text-muted-foreground" };
    case "cancelled":
      return { text: "stopped", tone: "text-muted-foreground" };
    default:
      return { text: "done", tone: "text-muted-foreground" };
  }
}

/**
 * The face, with what paints it right under it: the palette, then the
 * silhouette. Laid out like Thursday's own face picker, so both faces are
 * chosen the same way.
 */
function MarkPicker({
  name,
  icon,
  onChange,
  shown = true,
}: {
  name: string;
  icon: BotIcon;
  onChange: (icon: BotIcon) => void;
  /** Draws the face over the palette; not when the bot already stands at its desk above it. */
  shown?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 pt-3 pb-2">
      {shown && (
        <BotMark size={112} {...markProps(name, icon)} className="shrink-0" />
      )}

      {/* MARK_SYSTEM is an explicit "follow the theme ink", distinct from no
          colour; picking the colour already on it goes back to none. A paint
          covers the colour without clearing it; picking a colour takes it off. */}
      <MarkPalette
        color={icon.paint ? undefined : icon.color}
        themePicked={!icon.paint && icon.color === MARK_SYSTEM}
        onTheme={() =>
          onChange({ ...icon, paint: undefined, color: MARK_SYSTEM })
        }
        onPick={(color) =>
          onChange({
            ...icon,
            paint: undefined,
            color: !icon.paint && icon.color === color ? undefined : color,
          })
        }
        paint={icon.paint}
        onPaint={(paint) =>
          onChange({
            ...icon,
            paint: icon.paint === paint ? undefined : paint,
          })
        }
      />

      {/* Every chip is a toggle: unpicked means "whatever the name seeds", not a value */}
      <div className="flex gap-1">
        {MARK_SHAPES.map((shape) => (
          <button
            key={shape}
            type="button"
            onClick={() =>
              onChange({
                ...icon,
                shape: icon.shape === shape ? undefined : shape,
              })
            }
            className={cn(
              "rounded-md px-2 py-1 font-mono text-[11px] capitalize transition-colors",
              icon.shape === shape
                ? "bg-brand text-brand-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {shape}
          </button>
        ))}
        <span className="mx-1 w-px self-stretch bg-border/60" />
        <button
          type="button"
          onClick={() =>
            onChange({ ...icon, outline: icon.outline ? undefined : true })
          }
          className={cn(
            "rounded-md px-2 py-1 font-mono text-[11px] transition-colors",
            icon.outline
              ? "bg-brand text-brand-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          outline
        </button>
      </div>
    </div>
  );
}

type McpToolPick = {
  id: number;
  name: string;
  serverName: string;
  description: string | null;
};

/** Chips beyond this fold into "+N". */
const CHIP_LIMIT = 4;

/**
 * Which MCP tools are loaded from the start; everything else stays searchable, so the
 * cap is a prompt-size budget, not a limit on ability.
 */
function ToolPicker({
  selected,
  onChange,
}: {
  selected: number[];
  onChange: (toolIds: number[]) => void;
}) {
  const { data: loaded } = useServerRoute<McpToolPick[]>(queryKey.mcpTools);
  const tools = loaded ?? [];
  const [open, setOpen] = useState(false);

  const full = selected.length >= MAX_PINNED_TOOLS;
  const servers = [...new Set(tools.map((tool) => tool.serverName))];
  const picked = selected
    .map((id) => tools.find((tool) => tool.id === id))
    .filter((tool): tool is McpToolPick => Boolean(tool));
  const shown = open ? picked : picked.slice(0, CHIP_LIMIT);
  const folded = picked.length - shown.length;

  const toggle = (id: number) =>
    onChange(
      selected.includes(id)
        ? selected.filter((entry) => entry !== id)
        : [...selected, id],
    );

  // Nothing is said until the list has come: read as empty meanwhile, "connect a server
  // first" flashed on every bot page with servers connected
  if (!loaded) return null;
  if (tools.length === 0) {
    return (
      <p className="pt-1.5 text-xs text-muted-foreground">
        Nothing to pin — connect an MCP server first (Settings › Connectors).
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="icon-sm"
          variant={open ? "secondary" : "outline"}
          onClick={() => setOpen(!open)}
          aria-label="Pick tools"
          className="border-dashed"
        >
          <Wrench />
        </Button>

        {shown.map((tool) => (
          <span
            key={tool.id}
            className="flex items-center gap-1 rounded-full bg-muted py-1 pr-1.5 pl-2.5 font-mono text-[11px]"
          >
            {tool.name}
            <button
              type="button"
              aria-label={`Unpin ${tool.name}`}
              onClick={() => toggle(tool.id)}
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}

        {folded > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full bg-muted px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            +{folded}
          </button>
        )}

        {picked.length === 0 && (
          <span className="text-xs text-muted-foreground">
            Loaded from the start — everything else stays searchable
          </span>
        )}

        <span className="flex-1" />
        <span
          className={cn(
            "font-mono text-[11px] text-muted-foreground",
            full && "text-foreground",
          )}
        >
          {selected.length}/{MAX_PINNED_TOOLS}
        </span>
      </div>

      {open && (
        <Command className="rounded-lg border border-input">
          <CommandInput placeholder="Search tools" />
          <CommandList className="max-h-44">
            <CommandEmpty>Nothing matches</CommandEmpty>
            {servers.map((server) => (
              <CommandGroup key={server} heading={server}>
                {tools
                  .filter((tool) => tool.serverName === server)
                  .map((tool) => {
                    const isPicked = selected.includes(tool.id);
                    return (
                      <CommandItem
                        key={tool.id}
                        // Names collide across servers.
                        value={`${tool.serverName}/${tool.name}`}
                        disabled={!isPicked && full}
                        onSelect={() => toggle(tool.id)}
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                          {tool.name}
                        </span>
                        {isPicked && <Check className="size-3.5 shrink-0" />}
                      </CommandItem>
                    );
                  })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      )}
    </div>
  );
}
