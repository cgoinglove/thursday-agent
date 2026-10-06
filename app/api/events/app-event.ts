/**
 * Every event the server sends the browser. Two kinds: a signal carries no data
 * and the receiver revalidates the matching GET; a data event is the value
 * itself. A new signal must also be added to `SIGNALS` below.
 */
export type AppEvent =
  /**
   * Sent on every connect, so also on every reconnect. Whatever changed while
   * the line was down raised a signal nobody heard, so the receiver re-reads
   * everything — except on the connect the page opens with, where every reader
   * has just read (app-event.client, use-thursday).
   */
  | { type: "hello" }
  /** Signal: a thread changed (every write in thread.query and room.query). */
  | { type: "threads" }
  /** Signal: a bot rewrote its own description (bot.query rewriteBotDescription), or kept or put back a lesson (lesson.query). */
  | { type: "bots" }
  /** Signal: a routine was made, changed, removed, or moved on to its next time. */
  | { type: "routines" }
  /** Signal: a note or fact changed. */
  | { type: "memory" }
  /** Signal: a server was registered, removed, synced, or finished OAuth. */
  | { type: "mcp" }
  /** Signal: a key, sign-in or pick that Settings lists was written or removed (config.query). */
  | { type: "config" }
  /** Signal: who may write from a phone changed, or someone is asking to (features/reach). */
  | { type: "reach" }
  /** Signal: a sign-in was kept, lent, asked for or removed (features/signins). */
  | { type: "signins" }
  /**
   * Signal: a command or a write in a bot's or the call's shell finished, so a file on
   * screen may have changed (workspace.ts openWorkspace). What reads it asks whether its
   * own file did.
   */
  | { type: "files" }
  /**
   * Data: a job finished. `words` opens its answer as plain text; `paths` are the
   * files it named, workspace-relative with the one worth reading first at the
   * head, and empty when it answered in words alone.
   */
  | {
      type: "finished";
      threadId: string;
      label: string;
      bot: string;
      words: string;
      paths: string[];
    }
  /** Data: Thursday puts a job in front of the user (`thread` `open` on a call). */
  | { type: "showThread"; threadId: string }
  /** Data: Thursday puts what a job made in front of the user; `paths` as in `finished`. */
  | { type: "showFile"; paths: string[] };

/**
 * Union members carrying nothing but `type`: a signal names the GET to read
 * again and needs no payload to do it. `hello` has none either and is not one —
 * it belongs to the connection rather than to a key, and asks for every read.
 */
type Signal<E = AppEvent> = E extends AppEvent
  ? E["type"] extends "hello"
    ? never
    : keyof E extends "type"
      ? E["type"]
      : never
  : never;

/**
 * Signals are paced before sending (app-event.server). The `Record` type makes
 * a signal missing here a compile error.
 */
export const SIGNALS: Record<Signal, true> = {
  threads: true,
  bots: true,
  routines: true,
  memory: true,
  mcp: true,
  config: true,
  reach: true,
  signins: true,
  files: true,
};

export const isSignal = (
  event: AppEvent,
): event is Extract<AppEvent, { type: Signal }> => event.type in SIGNALS;
