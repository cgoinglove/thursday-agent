import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  readdir,
  realpath,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { appEvents } from "@/app/api/events/app-event.server";
import {
  APP_DIR,
  BROWSER_CLI,
  BROWSER_VIEWPORT,
  DATA_DIR,
  HIDDEN_SECRET_MIN,
  JOB_FOLDER_WALK,
  PATHS,
  TOOL_OUTPUT,
  WORKSPACE_KEEP,
} from "@/config";
import type { BotIcon } from "@/features/bot/bot.schema";
import { markStill } from "@/features/bot/mark.geometry";
import { configSecretValues } from "@/features/config/config.query";
import { connectorSecretValues } from "@/features/connectors/mcp.query";
import { logger } from "@/lib/logger";
import {
  APP_OWN,
  createSandBox,
  type Sandbox,
  SECRET_NAME,
  walkFiles,
} from "@/lib/sandbox";
import { encryptionKeyTexts } from "@/lib/secret";
import { slug } from "@/lib/utils";

/**
 * Where the sandbox is opened. The app's own skills live outside the
 * workspace so nothing running in it can rewrite them; the user's skills are
 * under `.agents/skills`, where the `skills` CLI installs to.
 */

/** The app itself is off limits; not the workspace folder once installed (APP_DIR / DATA_DIR). */
const APP_ROOT = APP_DIR;

/** Everything the agent writes is under here. */
export const WORKSPACE = join(DATA_DIR, PATHS.workspace);

/** The shell's tool path: `THURSDAY_TOOL_PATH`, else the app's own node_modules/.bin (playwright-cli). */
const TOOL_PATH = (
  process.env.THURSDAY_TOOL_PATH?.split(":") ?? [
    join(APP_ROOT, "node_modules", ".bin"),
  ]
).filter(Boolean);

export const ARTIFACTS = join(WORKSPACE, PATHS.artifacts);

/**
 * Created on open, and the only places inside the workspace `write_file`
 * accepts. `.agents` is the skills CLI's install folder.
 */
const BOT_FOLDERS = [
  PATHS.artifacts,
  PATHS.projects,
  PATHS.scratch,
  PATHS.bots,
];
const WRITABLE = new Set([...BOT_FOLDERS, ".agents"]);

/** Where playwright-cli drops a snapshot after every command. Its name, not ours. */
const BROWSER_DIR = ".playwright-cli";

/**
 * A file in the CLI's folder that holds a browser's state (its sign-ins) for the length of
 * one command: the CLI reads and writes state only by path (signins.query, ai/tools/signin.tool).
 */
export const browserStateFile = () =>
  `${BROWSER_DIR}/state-${crypto.randomUUID()}.json`;

/** The command that saves a browser's state to `path`, making the folder no command may have made yet. */
export const saveBrowserState = (path: string) =>
  `mkdir -p ${BROWSER_DIR} && playwright-cli state-save ${path}`;

/**
 * playwright-cli looks upward for the nearest folder of this name and keeps its sessions
 * and browser profiles under a folder named after where it found it; with none, under one
 * named after its own install, which every other tool on the machine that runs the same
 * install shares. Made in the workspace (openWorkspace) so the profiles bots leave are this
 * app's alone, which is what lets a thread take its own with it (forgetBrowserData).
 */
const BROWSER_MARK = ".playwright";

const under = (root: string, path: string) =>
  path === root || path.startsWith(root + sep);

/**
 * Why a file may not be written where the model asked, as one line it can act
 * on, or null when it may. Refused: the workspace root (files belong in one
 * of the folders), a new entry at the top of `artifacts/` other than the
 * bot's own folder, and anything inside the app running the bot. What already
 * sits in `artifacts/` — another bot's folder, an older result — stays editable.
 */
export function writeRefusal(full: string, bot?: string): string | null {
  if (under(WORKSPACE, full)) {
    const rel = relative(WORKSPACE, full);
    const [top, entry] = rel.split(sep);
    if (!top || !WRITABLE.has(top)) {
      return `Not written: ${rel || "the workspace root"} is outside the workspace's folders. Finished work goes under ${bot ? botArtifacts(bot) : PATHS.artifacts}/, code under ${PATHS.projects}/, your own kit under ${PATHS.bots}/, and this job's working material under ${PATHS.scratch}/.`;
    }
    if (
      bot &&
      top === PATHS.artifacts &&
      entry &&
      entry.toLowerCase() !== botFolderName(bot).toLowerCase() &&
      !existsSync(join(ARTIFACTS, entry))
    ) {
      return `Not written: ${rel} would sit loose at the top of ${PATHS.artifacts}/. Your finished work goes in ${botArtifacts(bot)}/.`;
    }
    return null;
  }
  if (under(APP_ROOT, full)) {
    return `Not written: ${full} is inside the app that is running you, not the user's files. Work in ${WORKSPACE}; outside it, write only where the user pointed you.`;
  }
  return null;
}

const realOrNull = (path: string) => realpath(path).catch(() => null);

export async function insideWorkspace(rel: string): Promise<string | null> {
  const root = (await realOrNull(WORKSPACE)) ?? WORKSPACE;
  const full = resolve(WORKSPACE, rel);
  if (!under(WORKSPACE, full)) return null;

  let probe = full;
  let real = await realOrNull(probe);
  while (real === null && dirname(probe) !== probe) {
    probe = dirname(probe);
    real = await realOrNull(probe);
  }
  if (real === null) return null;

  const rest = relative(probe, full);
  const target = rest ? join(real, rest) : real;
  return under(root, target) ? target : null;
}

/**
 * Where one job keeps what it is still working on. A job has a beginning and an
 * end, which is what makes its working material safe to clear later — and it is
 * the right unit rather than the bot, because several bots work inside one job and
 * one bot runs many jobs.
 *
 * Named for the label so the folder is readable on the Workspace screen, with
 * the head of the id after it so two jobs called the same thing stay apart.
 * Finished work never lands here: that is the bot's own folder in `artifacts/`,
 * and code is `projects/`, which outlives the job that started it.
 */
export function jobScratch(threadId: string, label: string): string {
  return `${PATHS.scratch}/${slug(label) || "job"}-${threadId.slice(0, 6)}`;
}

/**
 * A bot's name as one path segment, the same under `bots/` and `artifacts/`.
 * Two names that give the same segment would share both folders, so creating
 * a bot refuses one (bot.query createBot); compared lowercased, as macOS does.
 */
export const botFolderName = (bot: string): string =>
  bot.replace(/[^\p{L}\p{N}_-]+/gu, "-");

/** Where one bot keeps what it wants on its next job (config PATHS.bots). */
export const botFolder = (bot: string): string =>
  `${PATHS.bots}/${botFolderName(bot)}`;

/**
 * Where one bot's finished work goes. The Artifacts section draws each as that
 * bot's group (features/artifact), so a result is filed by who made it.
 */
export const botArtifacts = (bot: string): string =>
  `${PATHS.artifacts}/${botFolderName(bot)}`;

/** Both of a bot's folders, created so its first write never has to. */
export async function openBotFolders(
  bot: string,
): Promise<{ own: string; artifacts: string }> {
  const own = botFolder(bot);
  const artifacts = botArtifacts(bot);
  await Promise.all(
    [own, artifacts].map((path) =>
      mkdir(join(WORKSPACE, path), { recursive: true }),
    ),
  );
  return { own, artifacts };
}

/** Creates it, so a job never has to and never writes to the shared root by mistake. */
export async function openJobScratch(
  threadId: string,
  label: string,
): Promise<string> {
  const path = jobScratch(threadId, label);
  await mkdir(join(WORKSPACE, path), { recursive: true });
  return path;
}

/** What every job's browser session name starts with, its thread id after it (jobShellEnv). */
const JOB_SESSION_PREFIX = "thread-";

/** The thread a listed browser session belongs to, read off its name; null for any other. */
export function threadOfBrowser(name: string): string | null {
  const id = name.slice(
    JOB_SESSION_PREFIX.length,
    JOB_SESSION_PREFIX.length + 36,
  );
  return name.startsWith(JOB_SESSION_PREFIX) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
    ? id
    : null;
}

/**
 * A job's own browser session. playwright-cli reads the session name from
 * this variable when `-s=` is not given, so the model never picks one and the
 * runner can close exactly this session when the job ends.
 */
export const jobShellEnv = (
  threadId: string | null | undefined,
): Record<string, string> => ({
  // The build ensureBrowser downloads. Unset, playwright-cli launches the user's own
  // Chrome: absent on many machines, and on macOS its window takes the links they open
  PLAYWRIGHT_MCP_BROWSER: "chromium",
  ...(threadId
    ? {
        PLAYWRIGHT_CLI_SESSION: `${JOB_SESSION_PREFIX}${threadId}`,
        // Read by playwright-cli; the window it opens is on the user's screen
        PLAYWRIGHT_MCP_VIEWPORT_SIZE: BROWSER_VIEWPORT,
      }
    : {}),
});

/**
 * What a bot's scripts find in its shell rather than a model typing the path.
 */
export const botShellEnv = (
  bot: string,
  icon?: BotIcon | null,
): Record<string, string> => ({
  // Who is writing: the head a page wears when it is opened names them (skills/artifact/runtime/shell)
  THURSDAY_BOT: bot,
  // And shows their face as it is now, kept by the page after the icon changes (shell/wear.mjs)
  THURSDAY_BOT_MARK: JSON.stringify(markStill(bot, icon)),
  // Where a script delivers a file (skills/artifact scripts/document.mjs), whole: a script
  // resolves it against the workspace it finds above the folder it runs in, and run outside
  // the workspace it finds none and would write under that folder instead
  THURSDAY_ARTIFACTS: join(WORKSPACE, botArtifacts(bot)),
  // The shipped skills: a kit script in a bot's folder imports the shared ones from here
  THURSDAY_SKILLS: join(APP_DIR, PATHS.skills.default),
  // How much of one command's output the bot sees: a script that splits a long file into
  // parts splits it to fit (skills/media-digest)
  THURSDAY_TOOL_OUTPUT: String(TOOL_OUTPUT.max),
  // The skills CLI (find-skills) reports every search and install to its maker unless this
  // is set; what a job searches for is the user's, not the registry's
  DISABLE_TELEMETRY: "1",
});

/** A participant's browser belongs to the job and its canonical bot name, across every caller. */
export const botBrowserSession = (threadId: string, bot: string) =>
  `${threadId}-bot-${createHash("sha256").update(bot.trim().toLowerCase()).digest("hex").slice(0, 20)}`;

/** Set by `ensureBrowser`, read by `readMachineTools`; null until it has finished. */
let browserReady: boolean | null = null;

/**
 * What the shell can actually reach. A bot writes a job around what is here —
 * node or python3, which package manager — and the platform does not say: two
 * macs differ. Probed in one `command -v` sweep at the moment it is asked, per
 * job rather than cached, so a job that installs something is not told
 * otherwise on its next run.
 */
const PROBED = {
  runtimes: ["node", "python3", "uv", "bun", "deno"],
  managers: ["pnpm", "npm", "yarn"],
} as const;

export type MachineTools = {
  [K in keyof typeof PROBED]: { found: string[]; missing: string[] };
} & {
  /** Null while `ensureBrowser` is still running; it starts at boot and is not awaited. */
  browser: boolean | null;
};

export async function readMachineTools(
  sandbox: Sandbox,
): Promise<MachineTools> {
  const names = Object.values(PROBED).flat();
  const { stdout } = await sandbox.exec(
    names
      .map(
        (name) => `command -v ${name} >/dev/null 2>&1 && printf '%s ' ${name}`,
      )
      .join("; "),
    { timeoutMs: 10_000 },
  );
  const found = new Set(stdout.trim().split(/\s+/).filter(Boolean));
  const split = (list: readonly string[]) => ({
    found: list.filter((name) => found.has(name)),
    missing: list.filter((name) => !found.has(name)),
  });
  return {
    runtimes: split(PROBED.runtimes),
    managers: split(PROBED.managers),
    browser: browserReady,
  };
}

/**
 * The browser bots drive. It is not in the package — ~280 MB, and its build
 * moves with playwright-core — so it is fetched here instead of from an install
 * script: nothing may stand between `npx` and a running app, and a first run
 * spends its first minute on the intro anyway. Started at boot and not awaited
 * (instrumentation); already installed, it costs about a fifth of a second.
 * A bot that still finds no browser has the same command in the browser skill.
 */
export async function ensureBrowser(): Promise<void> {
  if (process.env.THURSDAY_SKIP_BROWSER) return;

  const sandbox = await openWorkspace();
  // The shell a job would use, so a browser reachable here is reachable there
  const done = await sandbox
    .exec("playwright-cli install-browser chromium")
    .catch((cause: unknown) => ({ exitCode: 1, stderr: String(cause) }));

  browserReady = done.exitCode === 0;
  if (browserReady) return;
  logger.warn(
    `no browser — bots cannot open a page until \`playwright-cli install-browser chromium\` succeeds: ${done.stderr.trim().split("\n").at(-1) ?? ""}`,
  );
}

/** What a job leaves on disk: stale browser snapshots and spilled tool output. */
export async function pruneJobFiles(): Promise<void> {
  await pruneBrowserFiles();
  await pruneOutputFiles();
}

export type ListedBrowser = {
  name: string;
  headed?: boolean;
  attached?: boolean;
};

/**
 * The browsers `list --json` names for `env`. A CLI that printed nothing lists none; one that
 * failed — timed out under load, or is not there — or printed anything but its JSON throws,
 * and each caller decides what that means: a list that did not run is not an empty one.
 */
export async function listBrowsers(
  sandbox: Sandbox,
  env: Record<string, string>,
): Promise<ListedBrowser[]> {
  const listed = await sandbox.exec("playwright-cli list --json", {
    env,
    timeoutMs: BROWSER_CLI.readMs,
  });
  if (listed.exitCode !== 0)
    throw new Error(
      `playwright-cli list failed (${listed.exitCode}): ${listed.stderr.trim()}`,
    );
  const { browsers } = JSON.parse(listed.stdout || "{}") as {
    browsers?: ListedBrowser[];
  };
  return browsers ?? [];
}

/**
 * An expired job's workspace closes browsers nobody can see. Headless is the bot's
 * working copy; `--headed` is the bot putting a window on their screen on
 * purpose — an order at checkout, a map with a pin, a sign-in — and that one is
 * theirs to close (`skills/browser`). A session attached to their own Chrome is
 * never touched. Anything unreadable — no playwright, a failed or folded `list`
 * — leaves the browser as it is.
 */
export async function closeHiddenBrowser(threadId: string): Promise<void> {
  // The job's files have aged out, and so have its profiles, but for a window still up
  await forgetUnlessUnread(threadId, await closeBrowsers(threadId, false));
}

/**
 * Profiles go only when it is known which browsers are still running. With a list that
 * could not be read, removing them would take the profile from under a browser that is
 * up, and with its thread gone nothing would ever close it.
 */
async function forgetUnlessUnread(threadId: string, open: string[] | null) {
  if (open) return forgetBrowserData(threadId, open);
  logger.warn(
    `thread ${threadId}: its browsers could not be listed, so they and their profiles are left as they are`,
  );
}

/** A cancel closes every participant's window, but never an attached personal browser. The thread can still be picked back up, so its profiles stay. */
export async function closeJobShell(threadId: string): Promise<void> {
  await closeBrowsers(threadId, true);
}

/**
 * A job that finished, or that has sat without a step for BROWSER_IDLE, closes the browsers
 * nobody can see. Each holds hundreds of megabytes while it is up (351–706 MB measured on a
 * Mac), and left until the folder expired a day of jobs held gigabytes. A window it put on
 * their screen and an attached browser of theirs stay (closeBrowsers), and so do the
 * profiles: a job picked back up opens its browser again on them.
 */
export async function closeIdleBrowser(
  threadId: string,
  listed?: ListedBrowser[],
): Promise<void> {
  await closeBrowsers(threadId, false, listed);
}

/**
 * Every job's browser nobody can see, as the server stops: they belong to playwright-cli's own
 * daemon, which outlives the server, so nothing else would close them. Read once and closed
 * side by side, since a stop has seconds. A list that cannot be read closes nothing.
 */
export async function closeHiddenBrowsers(): Promise<void> {
  const sandbox = await openWorkspace();
  const env = jobShellEnv(null);
  const all = await listBrowsers(sandbox, env).catch(() => null);
  if (!all) return;
  await Promise.all(
    all
      .filter(
        (b) =>
          b.name.startsWith(JOB_SESSION_PREFIX) &&
          !b.attached &&
          b.headed === false,
      )
      .map((b) =>
        sandbox
          .exec("playwright-cli close", {
            env: { ...env, PLAYWRIGHT_CLI_SESSION: b.name },
            timeoutMs: BROWSER_CLI.readMs,
          })
          .catch(() => {}),
      ),
  );
}

/**
 * A removed thread takes its browsers and what they kept with it. `listed` is the workspace's
 * browsers as a batch already read them (listJobBrowsers): with it nothing is listed or
 * pruned here, and the batch prunes once when it is done.
 */
export async function removeJobBrowsers(
  threadId: string,
  listed?: ListedBrowser[],
): Promise<void> {
  await forgetUnlessUnread(
    threadId,
    await closeBrowsers(threadId, true, listed),
  );
}

/**
 * Every browser the CLI lists in this workspace, for a batch that removes many threads: one
 * `list` a thread is a process each, a quarter of a second, and a thousand finished threads
 * cleared at once waited minutes on them. Null when the list cannot be read, and each
 * thread then asks for itself as before. Only for threads that are over: nothing opens a
 * browser for one after the list is read.
 */
export async function listJobBrowsers(): Promise<ListedBrowser[] | null> {
  const sandbox = await openWorkspace();
  // Any session's environment lists them all: the list is the workspace's
  return listBrowsers(sandbox, jobShellEnv(null)).catch(() => null);
}

/**
 * Removes what a thread's browsers kept on disk — profiles with their cookies and caches,
 * tens of megabytes a session. Nothing of the CLI's does it once a browser has closed
 * (`delete-data` needs the open session's entry), so the entries are removed here: every
 * one in the CLI's folder for this workspace that carries the thread's session name, which
 * holds the thread's id and so is nobody else's. The folder is found the way the CLI names
 * it (the first 16 of sha1 over the marked workspace, under the platform's cache); a CLI
 * that names it otherwise leaves nothing found and nothing removed. `open` are the sessions
 * still running, left as they are.
 */
async function forgetBrowserData(
  threadId: string,
  open: string[],
): Promise<void> {
  const folder = await browserDataFolder();
  const session = jobShellEnv(threadId).PLAYWRIGHT_CLI_SESSION;
  const entries = await readdir(folder).catch(() => []);
  for (const entry of entries) {
    const name = entry.startsWith("ud-") ? entry.slice(3) : entry;
    if (
      name !== session &&
      !name.startsWith(`${session}-`) &&
      !name.startsWith(`${session}.`)
    )
      continue;
    if (
      open.some(
        (one) =>
          name === one ||
          name.startsWith(`${one}-`) ||
          name.startsWith(`${one}.`),
      )
    )
      continue;
    await rm(join(folder, entry), { recursive: true, force: true }).catch(
      (cause) => logger.warn(`browser data ${entry}: ${String(cause)}`),
    );
  }
}

/** Where the CLI keeps this workspace's sessions and profiles, named as its 0.1.x names it. */
async function browserDataFolder(): Promise<string> {
  const cache =
    process.platform === "darwin"
      ? join(homedir(), "Library", "Caches")
      : process.platform === "win32"
        ? process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local")
        : process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  const marked = await realpath(WORKSPACE).catch(() => WORKSPACE);
  return join(
    cache,
    "ms-playwright",
    "daemon",
    createHash("sha1").update(marked).digest("hex").slice(0, 16),
  );
}

/**
 * Closes the thread's browsers and answers with the sessions it left running; null when the
 * list could not be read, which closes nothing (closeHiddenBrowser).
 */
async function closeBrowsers(
  threadId: string,
  visible: boolean,
  listed?: ListedBrowser[],
): Promise<string[] | null> {
  const sandbox = await openWorkspace();
  const env = jobShellEnv(threadId);
  const all = listed ?? (await listBrowsers(sandbox, env).catch(() => null));
  if (!all) return null;
  const sessions = all.filter(
    (b) =>
      b.name === env.PLAYWRIGHT_CLI_SESSION ||
      b.name.startsWith(`${env.PLAYWRIGHT_CLI_SESSION}-`),
  );
  // A running session always has its entry in the CLI's folder: none there means the CLI
  // names it otherwise now, and a removed thread would leave its profiles on disk unseen
  const folder = sessions.length ? await browserDataFolder() : "";
  if (folder && !existsSync(folder))
    logger.warn(
      `playwright-cli keeps this workspace's browsers somewhere other than ${folder}: removing a thread will leave its browser profiles on disk`,
    );
  const left: string[] = [];
  for (const session of sessions) {
    if (session.attached || (!visible && session.headed !== false)) {
      left.push(session.name);
      continue;
    }
    await sandbox
      .exec("playwright-cli close", {
        env: { ...env, PLAYWRIGHT_CLI_SESSION: session.name },
        timeoutMs: BROWSER_CLI.readMs,
      })
      .catch(() => {});
  }
  if (!listed) await pruneJobFiles();
  return left;
}

const pruneOutputFiles = () => pruneOldFiles(PATHS.output);

const pruneBrowserFiles = () => pruneOldFiles(BROWSER_DIR);

/** Files directly in a workspace folder that have not changed for WORKSPACE_KEEP.forMs. */
async function pruneOldFiles(folder: string): Promise<void> {
  const dir = join(WORKSPACE, folder);
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const cutoff = Date.now() - WORKSPACE_KEEP.forMs;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const file = join(dir, entry.name);
    const info = await stat(file).catch(() => null);
    if (info && info.mtimeMs < cutoff) await unlink(file).catch(() => {});
  }
}

/** Every folder under `scratch/`, workspace-relative, as jobScratch names them. */
export async function listScratchFolders(): Promise<string[]> {
  const entries = await readdir(join(WORKSPACE, PATHS.scratch), {
    withFileTypes: true,
  }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${PATHS.scratch}/${entry.name}`);
}

/**
 * Removes the workspace folders among `folders` that have not changed for
 * WORKSPACE_KEEP.forMs, judged by the folder itself. Only for folders no job owns
 * (bot.runner sweepJobFiles): a job that has just made its folder is never old
 * enough to be caught. Returns what went.
 */
export async function removeUnchangedFolders(
  folders: string[],
): Promise<string[]> {
  const cutoff = Date.now() - WORKSPACE_KEEP.forMs;
  const removed: string[] = [];
  for (const folder of folders) {
    const full = join(WORKSPACE, folder);
    const info = await stat(full).catch(() => null);
    if (!info?.isDirectory() || info.mtimeMs >= cutoff) continue;
    await rm(full, { recursive: true, force: true }).catch(() => {});
    removed.push(folder);
  }
  return removed;
}

/**
 * pnpm looks upward for the nearest `pnpm-workspace.yaml`; without one here a
 * `pnpm install` inside a bot project would join the app's workspace and
 * rewrite the app's lockfile. Neither `.npmrc` nor an env var prevents that.
 * `recursive-install=false` keeps one project's install from installing all.
 * Written only when missing; the agent may edit them afterwards.
 */
const FENCE: Record<string, string> = {
  "pnpm-workspace.yaml": "packages:\n  - '**'\n",
  ".npmrc": "recursive-install=false\n",
};

type Pinned = typeof globalThis & {
  __storedSecrets?: { values: Promise<string[]> | null };
};

/**
 * The secrets Settings and the connectors keep, read once and again only after one of them
 * changes: every write of a key, a sign-in or a connector raises `config` or `mcp`, and the next
 * command reads them anew. On globalThis, as every server-lifetime cache is, so a reload of this
 * module neither reads twice nor subscribes twice.
 */
const stored = ((globalThis as Pinned).__storedSecrets ??= (() => {
  const cache = { values: null as Promise<string[]> | null };
  appEvents.subscribe((event) => {
    if (event.type === "config" || event.type === "mcp") cache.values = null;
  });
  return cache;
})());

function storedSecrets(): Promise<string[]> {
  stored.values ??= Promise.all([
    configSecretValues(),
    connectorSecretValues(),
  ]).then(
    ([config, connectors]) => [...config, ...connectors],
    (cause) => {
      stored.values = null;
      throw cause;
    },
  );
  return stored.values;
}

/**
 * The secrets the app holds, as a command could print them, for every shell to hide from what it
 * prints: the key `local.db`'s secrets are sealed with, which sits in plain text in the data
 * folder's `.env`; every key, token and sign-in Settings and the connectors keep; and what the
 * environment holds under a secret's name, which no shell is given (lib/sandbox SECRET_NAME) and
 * a command could still read from the file that set it — but for the app's own (APP_OWN). Not a
 * value shorter than HIDDEN_SECRET_MIN, nor one naming a path that exists on this machine, which
 * no credential does: a connector's folder or a tool's socket is shown as it is.
 */
async function heldSecrets(): Promise<string[]> {
  const fromEnv = Object.entries(process.env).flatMap(([name, value]) =>
    SECRET_NAME.test(name) && !APP_OWN.test(name) && value ? [value] : [],
  );
  const all = [...encryptionKeyTexts(), ...(await storedSecrets()), ...fromEnv];
  return all
    .map((value) => value.trim())
    .filter(
      (value) =>
        value.length >= HIDDEN_SECRET_MIN &&
        !(isAbsolute(value) && existsSync(value)),
    );
}

export async function openWorkspace(): Promise<Sandbox> {
  for (const folder of [...BOT_FOLDERS, BROWSER_MARK]) {
    await mkdir(join(WORKSPACE, folder), { recursive: true });
  }
  for (const [name, content] of Object.entries(FENCE)) {
    // `wx`: create only if absent, never overwrite
    await writeFile(join(WORKSPACE, name), content, { flag: "wx" }).catch(
      () => {},
    );
  }
  const sandbox = createSandBox({
    workingDirectory: WORKSPACE,
    spill: { dir: PATHS.output, ...TOOL_OUTPUT },
    toolPath: TOOL_PATH,
    secrets: heldSecrets,
  });
  // Every write a bot or the call makes passes here, whatever made it: a file open on
  // screen is asked again whether it changed (app-event `files`), a failed command too,
  // since it may have written part of one
  const touched = () => appEvents.emit({ type: "files" });
  return {
    ...sandbox,
    exec: (command, opts) => sandbox.exec(command, opts).finally(touched),
    writeFile: (path, content) =>
      sandbox.writeFile(path, content).finally(touched),
  };
}

/**
 * What of a job's files is on disk: the paths it gave `write_file` that still exist,
 * and every file under its own folder however it got there — a shell command, a
 * download, a screenshot. Workspace-relative where inside the workspace, each once,
 * the most recently changed last (bot.run filesUnder).
 */
export async function filesOnDisk(
  written: string[],
  folder: string | null,
): Promise<string[]> {
  const candidates = written.map((path) => resolve(WORKSPACE, path));
  if (folder) {
    let walked = 0;
    for await (const full of walkFiles(join(WORKSPACE, folder))) {
      candidates.push(full);
      walked += 1;
      if (walked >= JOB_FOLDER_WALK) break;
    }
  }
  const found = new Map<string, number>();
  for (const full of candidates) {
    const info = await stat(full).catch(() => null);
    if (!info?.isFile()) continue;
    const rel = relative(WORKSPACE, full);
    found.set(rel && !rel.startsWith("..") ? rel : full, info.mtimeMs);
  }
  return [...found].sort((a, b) => a[1] - b[1]).map(([path]) => path);
}

/**
 * Removes a job's working folder. Its lifetime is the thread's: when the row goes,
 * so does what it was working with (features/bot/bot.runner). Never touches
 * `artifacts` or `projects` — those are the user's and outlive every job.
 */
export async function removeJobScratch(
  threadId: string,
  label: string,
): Promise<void> {
  const folder = jobScratch(threadId, label);
  // `force` already passes over one that is gone; what reaches here is a real refusal
  await rm(join(WORKSPACE, folder), { recursive: true, force: true }).catch(
    (cause) => logger.warn(`job folder ${folder}: ${String(cause)}`),
  );
}

/**
 * Removes a bot's own folder — its memory, the skills it installed, the scripts
 * it wrote itself. Its lifetime is the bot's (config PATHS), so it goes when the
 * bot does (bot.action deleteBot). The folder is named from the bot's name alone,
 * so one left behind is inherited whole by the next bot given that name.
 * `artifacts/<bot>` stays: finished work is the user's, not the bot's.
 */
export async function removeBotFolder(bot: string): Promise<void> {
  const folder = botFolder(bot);
  // `force` already passes over one that is gone; what reaches here is a real refusal
  await rm(join(WORKSPACE, folder), { recursive: true, force: true }).catch(
    (cause) => logger.warn(`bot folder ${folder}: ${String(cause)}`),
  );
  // Its finished work keeps saying whose it was: with no bot of that name left, the shelf
  // would read the folder as one set of the files at its top (features/artifact)
  const finished = join(WORKSPACE, botArtifacts(bot));
  if (existsSync(finished))
    await writeFile(
      join(finished, DELETED_BOT_MARK),
      `${JSON.stringify({ bot })}\n`,
    ).catch((cause) =>
      logger.warn(
        `${botArtifacts(bot)}: not marked as ${bot}'s — ${String(cause)}`,
      ),
    );
}

/**
 * Left in `artifacts/<bot>/` when its bot is deleted (removeBotFolder): the bot's name, so
 * Settings › Files still shows that folder as its shelf. A dotfile, so no list shows it.
 */
export const DELETED_BOT_MARK = ".deleted-bot.json";
