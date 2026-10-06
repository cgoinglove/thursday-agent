import { spawn } from "node:child_process";
import { createWriteStream, existsSync, type WriteStream } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve as pathResolve, relative, sep } from "node:path";
import type { Readable } from "node:stream";
import { EXEC_KILL_GRACE_MS, EXEC_TIMEOUT_MS } from "@/config";
import { errorToString } from "@/lib/utils";

/**
 * The shell a command runs in: bash where the machine has it, which is what the tool says
 * it runs (ai/tools/workspace.tool). Left to `shell: true`, Node takes /bin/sh, which is dash
 * on Debian and Ubuntu, and a command written for bash failed there. Null means sh alone.
 */
export const BASH =
  ["/bin/bash", "/usr/bin/bash", "/usr/local/bin/bash"].find((path) =>
    existsSync(path),
  ) ?? null;

export type ExecResult = { stdout: string; stderr: string; exitCode: number };

export interface Sandbox {
  /** Absolute. Relative paths resolve from here */
  readonly cwd: string;
  resolve(path: string): string;

  readFile(path: string, encoding: "utf-8"): Promise<string>;
  writeFile(path: string, content: string | Buffer): Promise<void>;
  readdir(
    path: string,
    opts: { withFileTypes: true },
  ): Promise<{ name: string; isDirectory(): boolean }[]>;

  /**
   * Every file under a folder, as paths relative to it: shallowest first and by name
   * within a depth, so a list cut at `limit` still holds what sits at the top.
   * `total` counts them all.
   */
  listFiles(
    path: string,
    opts?: {
      limit?: number;
      /** Folders directly under `path` whose files are left out, and not counted. */
      skip?: string[];
    },
  ): Promise<{ files: string[]; total: number }>;

  exec(
    command: string,
    opts?: {
      cwd?: string;
      timeoutMs?: number;
      signal?: AbortSignal;
      /** Laid over the shell's environment for this one command. */
      env?: Record<string, string>;
    },
  ): Promise<ExecResult>;

  /**
   * Hides the sandbox's secrets, then folds long text to head and tail, writing
   * the whole under the spill dir and naming the path in between. Shell output
   * goes through this on its own; tools that fetch (MCP) call it themselves.
   */
  fold(text: string, name?: string): Promise<string>;
}

const IGNORE = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".venv",
  "__pycache__",
  ".turbo",
  "coverage",
]);

/**
 * Every file under `dir`, skipping dot entries and the folders a build or a
 * package manager fills (IGNORE). A folder that cannot be read yields nothing.
 */
export async function* walkFiles(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (IGNORE.has(e.name) || e.name.startsWith(".")) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walkFiles(full);
    else if (e.isFile()) yield full;
  }
}

/**
 * What the app set in its own environment to run — the CLI (`bin/thursday.mjs`), `pnpm dev`,
 * Next's server, the package manager that started it — rather than the user. A bot's own
 * project reads these as its own: `npm install` skips devDependencies under NODE_ENV, `next`
 * takes Thursday's config from `__NEXT_PRIVATE_STANDALONE_CONFIG`, and a server binds to
 * Thursday's PORT beside it. What the bot is meant to have is laid over again
 * (`jobShellEnv`, `botShellEnv`).
 */
export const APP_OWN =
  /^(PORT|HOSTNAME|NODE_ENV|INIT_CWD|NEXT_MANUAL_SIG_HANDLE)$|^_*NEXT_|^TURBOPACK|^npm_|^THURSDAY_/i;

/** A variable named like a key, a token or a secret: kept out of every shell, and its value out of what one prints. */
export const SECRET_NAME =
  /KEY|TOKEN|SECRET|PASS|_PWD|CREDENTIAL|_AUTH|_DSN|DATABASE_URL/i;

/**
 * Environment for every shell the agent runs: the user's own, less the app's (APP_OWN) and
 * less secrets, which do not travel to children. Nobody watches it, so no pager may stall it.
 * playwright-cli runs from here too and needs only a working PATH.
 */
function shellEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // A compromised npm dependency would read keys straight out of process.env
  for (const name of Object.keys(env)) {
    if (APP_OWN.test(name) || SECRET_NAME.test(name)) {
      delete env[name];
    }
  }

  env.TERM = "dumb";
  env.PAGER = "cat";
  env.GIT_PAGER = "cat";

  return env;
}

export type SpillPolicy = {
  dir: string;
  max: number;
  head: number;
  tail: number;
};

/** What stands where a secret was, in what a command prints. */
export const HIDDEN = "[hidden: a secret Thursday keeps]";

/**
 * Hides `secrets` in a text that arrives in pieces, as a command prints it. A secret can be split
 * across two pieces, so whatever could still be part of one is held back until the next piece,
 * or the end, says what it is: what comes out never holds a secret, whole or in part.
 */
function hider(secrets: readonly string[]) {
  const list = [...new Set(secrets.filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  const longest = list[0]?.length ?? 0;
  let held = "";

  const hide = (text: string) => {
    let out = text;
    // Longest first, so a secret that holds a shorter one is hidden whole
    for (const secret of list) out = out.split(secret).join(HIDDEN);
    return out;
  };

  /** Where `text` can be cut at or before `at` with no secret across the cut. */
  const cutBefore = (text: string, at: number) => {
    let cut = at;
    for (let moved = true; moved; ) {
      moved = false;
      for (const secret of list) {
        const from = text.indexOf(secret, Math.max(0, cut - secret.length + 1));
        if (from !== -1 && from < cut) {
          cut = from;
          moved = true;
        }
      }
    }
    return cut;
  };

  return {
    hide,
    /** What of `held` and `piece` can go out now. */
    push(piece: string): string {
      if (!longest) return piece;
      const text = held + piece;
      // A secret not yet whole starts within its own length of the end
      const cut = cutBefore(text, Math.max(0, text.length - longest + 1));
      held = text.slice(cut);
      return hide(text.slice(0, cut));
    },
    /** What is still held, once nothing more is coming. */
    end(): string {
      const rest = hide(held);
      held = "";
      return rest;
    },
  };
}

export const createSandBox = ({
  workingDirectory,
  spill,
  toolPath,
  secrets,
}: {
  workingDirectory: string;
  spill: SpillPolicy;
  /**
   * Directories appended to the shell's PATH for tools the app ships with.
   * Appended, not prepended, so a copy the user installed wins.
   */
  toolPath?: string[];
  /**
   * Values never shown in what a command prints or `fold` folds, read again for each: each is
   * replaced by HIDDEN before anything else sees the output — the result, and the file a long
   * one spills to.
   */
  secrets?: () => Promise<readonly string[]>;
}): Sandbox => {
  const cwd = pathResolve(workingDirectory);
  const extraPath = (toolPath ?? []).filter(Boolean).join(":");
  const res = (p: string) =>
    p.startsWith("/") || /^[A-Za-z]:/.test(p) ? p : pathResolve(cwd, p);

  return {
    cwd,
    resolve: res,

    readFile: (p, enc) => readFile(res(p), enc),

    async writeFile(p, content) {
      const full = res(p);
      await mkdir(join(full, ".."), { recursive: true });
      await writeFile(full, content);
    },

    readdir: (p, opts) => readdir(res(p), opts),

    fold: async (text, name = "output") =>
      foldLong(hider((await secrets?.()) ?? []).hide(text), name, cwd, spill),

    async listFiles(path, { limit = 200, skip = [] } = {}) {
      const root = res(path);
      const all: string[] = [];
      for await (const f of walkFiles(root)) {
        const rel = relative(root, f).split(sep).join("/");
        if (!skip.includes(rel.split("/")[0] ?? "")) all.push(rel);
      }
      const depth = (p: string) => p.split("/").length;
      all.sort((a, b) => depth(a) - depth(b) || (a < b ? -1 : a > b ? 1 : 0));
      return { files: all.slice(0, limit), total: all.length };
    },

    async exec(
      command,
      { cwd: c, timeoutMs = EXEC_TIMEOUT_MS, signal, env } = {},
    ) {
      let hidden: readonly string[];
      try {
        hidden = (await secrets?.()) ?? [];
      } catch (cause) {
        // Run without them, and what it prints could carry one to the model
        return {
          exitCode: -1,
          stdout: "",
          stderr: `Not run: the secrets to hide from what it prints could not be read (${errorToString(cause)}).`,
        };
      }
      return new Promise((resolve) => {
        const base = shellEnv();
        if (extraPath) base.PATH = `${base.PATH ?? ""}:${extraPath}`;
        const child = spawn(command, {
          shell: BASH ?? true,
          cwd: c ? res(c) : cwd,
          env: { ...base, ...env },
          // Own process group: the real work is a child of the shell, and
          // signalling only the shell leaves it running
          detached: true,
        });
        const stdout = collect(
          child.stdout,
          "stdout",
          cwd,
          spill,
          hider(hidden),
        );
        const stderr = collect(
          child.stderr,
          "stderr",
          cwd,
          spill,
          hider(hidden),
        );

        const group = (name: NodeJS.Signals) => {
          try {
            // A negative pid means the group: the shell and everything under it
            if (child.pid) process.kill(-child.pid, name);
          } catch {
            // Already gone, or no process groups on this platform
            child.kill(name);
          }
        };

        let settled = false;
        let killing: ReturnType<typeof setTimeout> | undefined;
        let letGo: ReturnType<typeof setTimeout> | undefined;

        const done = async (result: { exitCode: number }) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          clearTimeout(killing);
          clearTimeout(letGo);
          signal?.removeEventListener("abort", onAbort);
          resolve({
            exitCode: result.exitCode,
            stdout: await stdout.text(),
            stderr: await stderr.text(),
          });
        };

        const stop = (why: string) => {
          if (killing || settled) return;
          stderr.add(`\n[${why}]`);
          group("SIGTERM");
          // A command that ignores SIGTERM would hold its step, and everything
          // waiting on the job, for good (config EXEC_KILL_GRACE_MS)
          killing = setTimeout(() => {
            stderr.add("\n[Killed: it did not exit on SIGTERM]");
            group("SIGKILL");
            // Output held open by a process that left the group never closes;
            // what arrived by now is the result
            letGo = setTimeout(() => {
              child.stdout?.destroy();
              child.stderr?.destroy();
              void done({ exitCode: -1 });
            }, 1_000);
          }, EXEC_KILL_GRACE_MS);
        };

        const timer = setTimeout(
          () => stop(`Timed out after ${timeoutMs}ms`),
          timeoutMs,
        );

        const onAbort = () => stop("Aborted");
        if (signal?.aborted) onAbort();
        else signal?.addEventListener("abort", onAbort, { once: true });

        child.on("close", (code) => done({ exitCode: code ?? -1 }));
        child.on("error", (error) => {
          stderr.add(String(error));
          void done({ exitCode: -1 });
        });
      });
    },
  };
};

const spillFile = (name: string, workspace: string, policy: SpillPolicy) =>
  join(
    workspace,
    policy.dir,
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${name.replace(/[^a-zA-Z0-9_-]+/g, "_")}.txt`,
  );

const folded = (
  name: string,
  policy: SpillPolicy,
  at: { head: string; tail: string; lines: number; where: string },
) =>
  `${at.head.trimEnd()}\n\n[${name} cut at ${policy.max.toLocaleString("en")} chars — the whole thing (${at.lines} lines) is at ${at.where}. Read the part you need with \`sed -n\`.]\n\n${at.tail.trimStart()}`;

/**
 * A command's output as it arrives, folded the way `foldLong` folds a text: whole while it
 * fits in `policy.max`, and past that a head, a tail and a file holding all of it. Folded
 * as it comes rather than once the command has exited: held whole until then, one command
 * that prints without end (`base64` of a film, a log, a recursive grep) grows one string
 * until the process runs out of memory, which takes every job and call with it. Secrets are
 * hidden as it arrives (`hider`), so neither the text nor the file ever holds one.
 */
function collect(
  source: Readable | null,
  name: string,
  workspace: string,
  policy: SpillPolicy,
  secrets: ReturnType<typeof hider>,
) {
  /** All of it while it fits; its first `head` characters once it does not. */
  let kept = "";
  let tail = "";
  let newlines = 0;
  let file: WriteStream | null = null;
  let path = "";
  let failed = false;
  /** The file opened, and everything handed to it so far written. */
  let written: Promise<void> = Promise.resolve();

  const write = (text: string) => {
    if (failed || !file) return;
    // A disk slower than the command would have the text wait in memory instead
    if (!file.write(text) && source) {
      source.pause();
      file.once("drain", () => source.resume());
    }
  };
  const keep = (chunk: string) => {
    if (!chunk) return;
    if (path) {
      newlines += chunk.match(/\n/g)?.length ?? 0;
      tail = (tail + chunk).slice(-policy.tail);
      written = written.then(() => write(chunk));
      return;
    }
    if (kept.length + chunk.length <= policy.max) {
      kept += chunk;
      return;
    }
    // Past what fits: all of it goes to the file, and only the two ends stay here
    path = spillFile(name, workspace, policy);
    const to = path;
    const so = kept + chunk;
    kept = so.slice(0, policy.head);
    tail = so.slice(-policy.tail);
    newlines = so.match(/\n/g)?.length ?? 0;
    written = mkdir(join(workspace, policy.dir), { recursive: true }).then(
      () => {
        file = createWriteStream(to);
        file.on("error", () => {
          // The text is still cut; a source paused for this file is let go on
          failed = true;
          source?.resume();
        });
        write(so);
      },
      () => {
        failed = true;
      },
    );
  };

  const add = (chunk: string) => keep(secrets.push(chunk));

  source?.setEncoding("utf8");
  source?.on("data", add);

  return {
    /** Words of the app's own, after whatever the command wrote. */
    add,
    async text(): Promise<string> {
      keep(secrets.end());
      if (!path) return kept;
      await written;
      const out = file as WriteStream | null;
      if (out && !failed)
        await new Promise<void>((resolve) => out.end(() => resolve()));
      return folded(name, policy, {
        head: kept,
        tail,
        lines: newlines + 1,
        where: failed
          ? "(could not be written to a file)"
          : relative(workspace, path) || path,
      });
    },
  };
}

/** Head, a line saying where the rest went, tail. The model reads the file with `sed -n`. */
async function foldLong(
  text: string,
  name: string,
  workspace: string,
  policy: SpillPolicy,
): Promise<string> {
  if (text.length <= policy.max) return text;

  const file = spillFile(name, workspace, policy);
  let where = file;
  try {
    await mkdir(join(workspace, policy.dir), { recursive: true });
    await writeFile(file, text);
    where = relative(workspace, file) || file;
  } catch {
    // Spill failed; the text is still cut
    where = "(could not be written to a file)";
  }

  return folded(name, policy, {
    head: text.slice(0, policy.head),
    tail: text.slice(-policy.tail),
    lines: (text.match(/\n/g)?.length ?? 0) + 1,
    where,
  });
}
