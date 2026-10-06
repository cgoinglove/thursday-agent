import { ROUTINE } from "@/config";
import { openWorkspace } from "@/features/workspace/workspace";

/**
 * A routine's watch: a shell command its bot wrote (routine_watch) that prints what the routine
 * waits on — a price, the free slots, a page's version — and the same while nothing worth a
 * run changed. The clock runs it at each start and opens a run only on a change or a failure
 * (routine.clock), so a start that finds nothing new calls no model. It runs in the workspace
 * shell, as a bot's commands do, with the app's secrets hidden from what it prints.
 */

export type Watched = { saw: string } | { failed: string };

/** Runs a watch once: what it printed, or why it failed. */
export async function runWatch(command: string): Promise<Watched> {
  const shell = await openWorkspace();
  const ran = await shell.exec(command, { timeoutMs: ROUTINE.watchMs });
  if (ran.exitCode !== 0) {
    const said = (ran.stderr.trim() || ran.stdout.trim()).slice(
      -ROUTINE.watchChars,
    );
    return { failed: `exit ${ran.exitCode}${said ? `: ${said}` : ""}` };
  }
  return { saw: ran.stdout.trim().slice(0, ROUTINE.watchChars) };
}
