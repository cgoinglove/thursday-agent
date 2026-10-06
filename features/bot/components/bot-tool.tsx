"use client";

import {
  AudioLines,
  Camera,
  Captions,
  Check,
  ChevronDown,
  ExternalLink,
  Eye,
  FilePen,
  FileText,
  Globe,
  IdCard,
  Image as ImageIcon,
  KeyRound,
  ListChecks,
  Loader2,
  type LucideIcon,
  Mail,
  MessageSquare,
  PhoneOff,
  Presentation,
  Send,
  Terminal,
  Video,
  Wrench,
} from "lucide-react";
import Image from "next/image";
import { type ComponentType, type ReactNode, useState } from "react";
import { queryKey } from "@/app/api/query-key";
import { ShinyText } from "@/components/ui/shiny-text";
import { SiteIcon } from "@/components/ui/site-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { SourceChips, type SourcePage } from "@/components/ui/source-chips";
import { STUDIO_SERVER } from "@/config";
import { STUDIO_TOOLS, TOOL_NAMES } from "@/features/ai/tools/tool-name";
import type { ResultPart } from "@/features/bot/bot.schema";
import { imagePathsIn } from "@/features/bot/components/attachments";
import { McpMark } from "@/features/connectors/components/mcp-mark";
import { MemoryMark } from "@/features/memory/components/memory-mark";
import { RoutineMark } from "@/features/routine/components/routine-mark";
import { SkillsMark } from "@/features/skills/components/skills-mark";
import { FileThumb } from "@/features/workspace/components/file-thumb";
import { FileLink } from "@/features/workspace/components/file-view";
import { useServerRoute } from "@/lib/protocol/use-server-route";
import { cn, hostOf } from "@/lib/utils";
import type { ToolUse } from "../thread.store";

/*
 * Tool calls rendered per tool: a studio call by what it makes, then TOOL_VIEWS by name,
 * GenericTool for the rest. Results arrive as a glance (thread.query RESULT_LINES, each
 * line clipped); "Everything" fetches the whole output, and only once it is opened.
 */

type ToolProps = {
  tool: ToolUse;
  /** Half of the key for fetching the full result. */
  threadId?: string;
  /** Start folded to the title line; only a press opens it, running or not. */
  collapsed?: boolean;
};

const TOOL_VIEWS: Partial<Record<string, ComponentType<ToolProps>>> = {
  [TOOL_NAMES.web_search]: WebSearchTool,
  [TOOL_NAMES.bash]: ShellTool,
  [TOOL_NAMES.write_file]: FileTool,
};

/** Every studio tool name, for reading one off a call line. */
const STUDIO_NAMES: string[] = Object.values(STUDIO_TOOLS);

/**
 * A studio call read off its line. The studio's tools reach a bot through `tool_call`
 * like a server's, but they are the app's own, so the row says what is being made
 * rather than that a server was called. The line is the app's own too —
 * `<server> <tool> <what it was given>` (thread.query `argumentLine`) — so both names
 * are matched against the vocabulary rather than guessed at.
 */
function studioCall(tool: ToolUse): { name: string; words: string } | null {
  if (tool.name !== TOOL_NAMES.tool_call) return null;
  const [server, called, ...rest] = tool.input.split(" ");
  if (server !== STUDIO_SERVER) return null;
  const name = STUDIO_NAMES.find((one) => one === called);
  return name ? { name, words: rest.join(" ") } : null;
}

/** The studio's tools by what each makes. */
const STUDIO_ICONS: Record<string, LucideIcon> = {
  [STUDIO_TOOLS.generate_image]: ImageIcon,
  [STUDIO_TOOLS.generate_video]: Video,
  [STUDIO_TOOLS.generate_speech]: AudioLines,
  [STUDIO_TOOLS.transcribe]: Captions,
};

/**
 * Icon per tool, for views with room for one glyph. A tool that belongs to a
 * domain draws that domain's own mark, so the pill and the nav never disagree.
 */
const TOOL_ICONS: Partial<Record<string, LucideIcon>> = {
  [TOOL_NAMES.web_search]: Globe,
  [TOOL_NAMES.bash]: Terminal,
  [TOOL_NAMES.write_file]: FilePen,
  [TOOL_NAMES.memory_recall]: MemoryMark,
  [TOOL_NAMES.memory_create]: MemoryMark,
  [TOOL_NAMES.memory_remember]: MemoryMark,
  [TOOL_NAMES.memory_describe]: MemoryMark,
  [TOOL_NAMES.memory_forget]: MemoryMark,
  [TOOL_NAMES.load_skill]: SkillsMark,
  [TOOL_NAMES.tool_search]: McpMark,
  [TOOL_NAMES.tool_call]: McpMark,
  [TOOL_NAMES.thread_start]: Send,
  [TOOL_NAMES.thread_tell]: Send,
  [TOOL_NAMES.thread_answer]: Send,
  [TOOL_NAMES.thread_status]: ListChecks,
  [TOOL_NAMES.thread_cancel]: ListChecks,
  [TOOL_NAMES.thread_show]: ListChecks,
  [TOOL_NAMES.thread_seen]: ListChecks,
  [TOOL_NAMES.send_message]: MessageSquare,
  [TOOL_NAMES.look_at]: Eye,
  [TOOL_NAMES.make_deck]: Presentation,
  [TOOL_NAMES.describe_self]: IdCard,
  [TOOL_NAMES.sign_in_use]: KeyRound,
  [TOOL_NAMES.sign_in_keep]: KeyRound,
  [TOOL_NAMES.check_mail]: Mail,
  [TOOL_NAMES.end_call]: PhoneOff,
  [TOOL_NAMES.routine]: RoutineMark,
  [TOOL_NAMES.routine_watch]: RoutineMark,
};

export const toolIcon = (name: string): LucideIcon =>
  TOOL_ICONS[name] ?? Wrench;

/**
 * What a step did, read off the call and what it answered with: the glyph that says it,
 * and what stands beside it on its row — the site it opened, the pages a search read,
 * the picture it took or drew, the file or program by name. A row that says `bash` six
 * times says nothing; this is only how a step is drawn, and a command it cannot place
 * is a terminal line.
 */
type StepFace = {
  icon: LucideIcon;
  host?: string;
  pages?: SourcePage[];
  image?: string;
  target?: string;
  /** A picture is on its way: its place is held while the step runs. */
  makes?: boolean;
};

/** Commands that look at files rather than do something to them. */
const READS = new Set([
  "cat",
  "sed",
  "head",
  "tail",
  "grep",
  "rg",
  "ls",
  "find",
  "wc",
  "awk",
  "jq",
]);

const nameOf = (path: string) => path.split("/").pop() ?? path;

/** A search's glance lines are `title — url`; the pages are read back out of them. */
function pagesOf(tool: ToolUse): SourcePage[] {
  return texts(tool.results).flatMap((line) => {
    const url = /https?:\/\/\S+/.exec(line)?.[0];
    if (!url) return [];
    const title = line.slice(0, line.indexOf(url)).replace(/[\s—-]+$/, "");
    return [{ url, ...(title ? { title } : {}) }];
  });
}

/**
 * The pictures a step names — in the call it made, and in what it gave back. A tool
 * that draws answers with the path of what it drew, and so does a script that wrote
 * a chart; either way the step shows it without being opened.
 */
function picturesOf(tool: ToolUse): string[] {
  return imagePathsIn(
    [tool.path ?? "", tool.input, ...texts(tool.results)].join("\n"),
  );
}

export function stepFace(tool: ToolUse): StepFace {
  const image = picturesOf(tool)[0];
  const studio = studioCall(tool);
  if (studio)
    return {
      icon: STUDIO_ICONS[studio.name] ?? Wrench,
      image,
      makes: studio.name === STUDIO_TOOLS.generate_image,
    };
  if (tool.name === TOOL_NAMES.web_search)
    return { icon: Globe, pages: pagesOf(tool) };
  if (tool.name === TOOL_NAMES.write_file)
    return { icon: FilePen, image, target: nameOf(tool.path ?? tool.input) };
  if (tool.name !== TOOL_NAMES.bash)
    return { icon: toolIcon(tool.name), image };

  // `cd somewhere &&` says where, not what
  const command = tool.input.replace(/^\s*cd\s+\S+\s*&&\s*/, "").trim();
  const [first = ""] = command.split(/\s+/);
  // The browser wherever it stands in the line — behind `npx`, an env assignment, a
  // chain — and its verb past any flags: a step that browsed reads as browsing
  const browsed = /(?:^|[\s;&|(])playwright-cli((?:\s+-\S+)*)\s+([a-z-]+)/.exec(
    command,
  );
  if (browsed) {
    if (browsed[2] === "screenshot") return { icon: Camera, image };
    const url = /https?:\/\/[^\s'"]+/.exec(command)?.[0];
    return { icon: Globe, host: (url && hostOf(url)) || undefined, image };
  }
  if (READS.has(first))
    return {
      icon: FileText,
      image,
      target: tool.path ? nameOf(tool.path) : undefined,
    };
  return { icon: Terminal, image, target: first || undefined };
}

/** A finished step as one tile of a folded run: its picture, its site, or its glyph. */
export function StepTile({
  tool,
  onOpen,
}: {
  tool: ToolUse;
  onOpen: () => void;
}) {
  const face = stepFace(tool);
  const [gone, setGone] = useState(false);
  const Icon = face.icon;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={tool.note ?? tool.input}
      aria-label={tool.note ?? tool.input}
      className="grid size-6 shrink-0 place-items-center overflow-hidden rounded-full bg-background text-muted-foreground outline-none transition-transform hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {face.image && !gone ? (
        <Image
          src={queryKey.file(face.image)}
          alt=""
          width={48}
          height={48}
          loading="lazy"
          decoding="async"
          onError={() => setGone(true)}
          className="size-full object-cover"
        />
      ) : face.host ? (
        <SiteIcon
          host={face.host}
          className="size-3.5 rounded-full"
          fallback={<Icon className="size-3" />}
        />
      ) : (
        <Icon className="size-3" />
      )}
    </button>
  );
}

/** What stands beside a step's words: where it went, what it read, what it touched. */
function StepTarget({ face }: { face: StepFace }) {
  if (face.pages?.length) {
    const hosts = [
      ...new Set(face.pages.flatMap((page) => hostOf(page.url) ?? [])),
    ].slice(0, 3);
    return (
      <span className="flex shrink-0 items-center gap-1">
        {hosts.map((host) => (
          <SiteIcon key={host} host={host} />
        ))}
      </span>
    );
  }
  if (face.host)
    return (
      <span className="flex h-5 shrink-0 items-center gap-1.5 rounded-full bg-muted pr-2 pl-1 text-[11px] text-foreground/80">
        <SiteIcon host={face.host} />
        {face.host}
      </span>
    );
  if (face.target && !face.image)
    return (
      <span className="max-w-40 shrink truncate font-mono text-[10.5px] text-muted-foreground">
        {face.target}
      </span>
    );
  return null;
}

export function BotTool(props: ToolProps) {
  const View = studioCall(props.tool)
    ? StudioTool
    : (TOOL_VIEWS[props.tool.name] ?? GenericTool);
  return <View {...props} />;
}

/** The box what a studio call makes is drawn in, before and after it is there. */
const PICTURE = "size-36 rounded-xl";

/**
 * A studio call: the words it was given, and what it made. The picture's place is
 * held from the first step — a skeleton while the model draws, the picture itself
 * once it is saved — so nothing moves when it lands, and the picture says what the
 * saved path would have said. Anything else it answers with stays a line.
 */
function StudioTool({ tool, threadId, collapsed }: ToolProps) {
  const call = studioCall(tool);
  const [picture] = picturesOf(tool);
  const drawing =
    tool.results === undefined && call?.name === STUDIO_TOOLS.generate_image;

  return (
    <Frame tool={tool} threadId={threadId} collapsed={collapsed}>
      {call?.words && (
        <p className="px-3 pt-1 pb-1.5 text-[13px] leading-snug break-keep wrap-anywhere">
          “{call.words}”
        </p>
      )}
      {picture ? (
        <FileLink
          path={picture}
          from={threadId}
          title={picture}
          className="mx-3 mb-1.5 block w-fit overflow-hidden rounded-xl outline-none ring-1 ring-foreground/5 transition-opacity ring-inset hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <FileThumb path={picture} className={PICTURE} />
        </FileLink>
      ) : drawing ? (
        <Skeleton className={cn("mx-3 mb-1.5", PICTURE)} />
      ) : (
        <Lines lines={texts(tool.results)} />
      )}
    </Frame>
  );
}

function WebSearchTool({ tool, threadId, collapsed }: ToolProps) {
  const pages = pagesOf(tool);
  // Lines that name no page (a provider's own summary) still read as lines
  const hits = pages.length ? [] : texts(tool.results);
  return (
    <Frame tool={tool} threadId={threadId} collapsed={collapsed}>
      <p className="px-3 pt-1 pb-1.5 text-[13px] leading-snug break-keep wrap-anywhere">
        “{tool.input}”
      </p>
      {pages.length > 0 && (
        <SourceChips sources={pages} className="px-3 pb-2" />
      )}
      {hits.length > 0 && (
        <ol className="space-y-0.5 px-3 pb-2">
          {hits.map((hit, at) => (
            <li
              key={`${at}-${hit}`}
              className="flex gap-2 text-[11.5px] leading-snug text-muted-foreground"
            >
              <span className="mt-1.25 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
              <span className="truncate">{hit}</span>
            </li>
          ))}
        </ol>
      )}
    </Frame>
  );
}

function ShellTool({ tool, threadId, collapsed }: ToolProps) {
  const out = texts(tool.results);
  return (
    <Frame tool={tool} threadId={threadId} collapsed={collapsed}>
      <pre className="mx-3 overflow-x-auto rounded-lg bg-foreground/5 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed scrollbar-none dark:bg-black/25">
        <span className="text-muted-foreground/60">$ </span>
        {tool.input}
        {out.length > 0 && (
          <span className="block text-muted-foreground">{out.join("\n")}</span>
        )}
      </pre>
    </Frame>
  );
}

const OPEN_BUTTON =
  "flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground outline-none transition-colors hover:bg-background hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

/**
 * A file the bot read or wrote, with an Open link. Opens `tool.path`: `input` is folded
 * to one line, and a truncated path is a 404 (thread.query LINE_MAX).
 */
function FileTool({ tool, threadId, collapsed }: ToolProps) {
  const path = tool.path ?? tool.input;
  return (
    <Frame tool={tool} threadId={threadId} collapsed={collapsed}>
      <div className="flex items-center gap-2 px-3 pt-1 pb-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
          {tool.input}
        </span>
        <FileLink
          path={path}
          from={threadId}
          label={`Open ${path}`}
          className={OPEN_BUTTON}
        >
          <ExternalLink className="size-3" />
          Open
        </FileLink>
      </div>
      <Lines lines={texts(tool.results)} mono />
    </Frame>
  );
}

/** Anything without a view of its own, MCP tools included. */
function GenericTool({ tool, threadId, collapsed }: ToolProps) {
  return (
    <Frame tool={tool} threadId={threadId} collapsed={collapsed}>
      <p className="px-3 pt-1 pb-1.5 text-[12px] leading-snug break-keep wrap-anywhere">
        {tool.input}
      </p>
      <Lines lines={texts(tool.results)} />
    </Frame>
  );
}

/**
 * The shell every tool view sits in: a one-line step (what it did, its words, what it touched,
 * state) with the body below it. A step opens only when pressed: one that opened itself while it
 * ran and shut as it finished made the conversation jump at every step of a bot at work, and its
 * line already shines while it runs. A finished one that returned anything gets "Everything" at
 * the bottom.
 */
function Frame({
  tool,
  threadId,
  collapsed = false,
  children,
}: ToolProps & { children: ReactNode }) {
  const running = tool.results === undefined;
  const face = stepFace(tool);
  const Did = face.icon;
  const [open, setOpen] = useState(!collapsed);
  const shown = open;
  // The glance is text only and clipped, so any output can be opened whole
  const whole =
    threadId && tool.callId && ((tool.results?.length ?? 0) > 0 || tool.more);

  return (
    <div
      className={cn(
        "@container w-full overflow-hidden rounded-xl transition-colors",
        shown ? "bg-background/80 dark:bg-white/4" : "hover:bg-foreground/4",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={shown}
        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="grid size-5 shrink-0 place-items-center rounded-[7px] bg-foreground/8 text-muted-foreground">
          {running ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Did className="size-3" />
          )}
        </span>

        {tool.note ? (
          <>
            {running ? (
              <ShinyText
                text={tool.note}
                speed={2.4}
                className="min-w-0 flex-1 truncate text-[12px] leading-4 break-keep"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate text-[12px] leading-4 break-keep">
                {tool.note}
              </span>
            )}
            {/* The raw call beside the label, only where there is room for both. */}
            <span className="hidden min-w-0 flex-1 truncate font-mono text-[11px] leading-4 text-muted-foreground @lg:block">
              {tool.input}
            </span>
          </>
        ) : running ? (
          // No label from the model, so the raw call is the live line.
          <ShinyText
            text={tool.input}
            speed={2.4}
            className="min-w-0 flex-1 truncate font-mono text-[11px] leading-4"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-4 text-foreground/80">
            {tool.input}
          </span>
        )}

        <StepShots paths={picturesOf(tool)} waiting={running && face.makes} />
        <StepTarget face={face} />
        {!running && (
          <Check className="size-3 shrink-0 text-muted-foreground/50" />
        )}
        <ChevronDown
          className={cn(
            "size-3 shrink-0 text-muted-foreground/50 transition-transform",
            shown && "rotate-180",
          )}
        />
      </button>
      {shown && (
        <div className="pb-1.5 pl-[1.625rem]">
          {children}
          {whole && (
            <Everything threadId={threadId} callId={tool.callId as string} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The pictures a step names, tucked on its row: what it drew or captured shows without
 * opening it. The file may not be there — a path in a command is no promise — so one
 * that does not load drops out rather than asking the server. `waiting` holds the box
 * of a picture still being drawn, so the row does not change shape when it lands.
 */
function StepShots({ paths, waiting }: { paths: string[]; waiting?: boolean }) {
  const [gone, setGone] = useState<string[]>([]);
  const shown = paths.filter((path) => !gone.includes(path)).slice(0, SHOTS);
  if (!shown.length)
    return waiting ? <Skeleton className="size-6 shrink-0 rounded-md" /> : null;

  return (
    <span className="flex shrink-0 items-center">
      {shown.map((path, at) => (
        <Image
          key={path}
          src={queryKey.file(path)}
          alt=""
          width={48}
          height={48}
          loading="lazy"
          decoding="async"
          onError={() => setGone((was) => [...was, path])}
          className={cn(
            "size-6 rounded-md bg-muted object-cover ring-2 ring-background",
            at > 0 && "-ml-1.5",
          )}
        />
      ))}
    </span>
  );
}

/** Thumbnails on one step row. Past three the row's own words lose their place. */
const SHOTS = 3;

/** The rest of a truncated result, fetched only when opened. */
function Everything({
  threadId,
  callId,
}: {
  threadId: string;
  callId: string;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useServerRoute<ResultPart[]>(
    open ? queryKey.toolResult(threadId, callId) : null,
  );

  return (
    <div className="px-3 pb-1">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        className="flex items-center gap-1 rounded-md py-0.5 font-mono text-[10px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronDown className={cn("size-3", open && "rotate-180")} />
        {open ? "Less" : "Everything"}
      </button>

      {open &&
        (isLoading || !data ? (
          <Skeleton className="mt-1.5 h-12 w-full rounded-lg" />
        ) : (
          <div className="mt-1.5 space-y-1.5">
            {images(data).map((shot, at) => (
              <Shot key={`${at}-${shot.length}`} src={shot} />
            ))}
            {texts(data).length > 0 && (
              <pre className="max-h-72 overflow-auto rounded-lg bg-foreground/5 px-2.5 py-2 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap dark:bg-black/25">
                {texts(data).join("\n")}
              </pre>
            )}
          </div>
        ))}
    </div>
  );
}

/**
 * One picture in an opened result. The row keeps the path, not the bytes
 * (tools/look.tool), so a picture whose file is gone — a job's scratch is swept
 * WORKSPACE_KEEP after it ends — draws as nothing and leaves its path below.
 */
function Shot({ src }: { src: string }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    // biome-ignore lint/performance/noImgElement: tool screenshot, not an asset
    <img
      src={src}
      alt=""
      onError={() => setGone(true)}
      className="block w-full rounded-lg bg-muted object-contain"
    />
  );
}

function Lines({ lines, mono }: { lines: string[]; mono?: boolean }) {
  if (lines.length === 0) return null;
  return (
    <ul className="px-3 pb-1.5">
      {/* Position is the identity here: two results can read the same and
          the list only ever arrives whole. */}
      {lines.map((line, at) => (
        <li
          key={`${at}-${line}`}
          className={cn(
            "truncate text-[11px] leading-relaxed text-muted-foreground",
            mono && "font-mono",
          )}
        >
          {line}
        </li>
      ))}
    </ul>
  );
}

const texts = (parts?: ResultPart[]) =>
  parts?.flatMap((part) => (part.type === "text" ? [part.text] : [])) ?? [];

const images = (parts?: ResultPart[]) =>
  parts?.flatMap((part) => (part.type === "image" ? [part.src] : [])) ?? [];
