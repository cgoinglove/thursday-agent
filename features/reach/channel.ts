import { REACH } from "@/config";
import type { ChatText } from "./chat-text";

/**
 * What reach needs from a chat service, and nothing more: hear one person, answer them, put
 * buttons under a question. Each service is one file that returns this (telegram, discord,
 * slack, email); reach itself never learns which one it is talking through. Every one of them
 * connects outward — a long poll, a socket or a mailbox the app opens — so nothing calls in.
 */

/**
 * A file someone sent, fetched only when it is wanted. `size` is what the service says it
 * weighs, where it says, so one past `limits.take` is never asked for.
 */
export type IncomingFile = {
  name: string;
  size?: number;
  fetch(): Promise<File>;
};

export type Incoming =
  | {
      kind: "message";
      /** Where to answer: the one-to-one conversation with this person. */
      chat: string;
      /** Who wrote, as the service names them. */
      name: string;
      /** The name the service gives them that nobody else holds (an @username), where it has one. */
      handle: string | null;
      words: string;
      files: IncomingFile[];
      /**
       * A voice message: what they said aloud, read as words by the transcription model the user
       * picked (reach voiceWords). Only where the service marks one as spoken.
       */
      voice: IncomingFile | null;
      /** It carried something reach cannot read yet (a video). */
      unreadable: boolean;
      /**
       * Why the service cannot vouch that it came from `chat` (a mail its sender's domain
       * does not stand behind), in words for them. Such a message never reaches her: it is
       * only answered with this, and only to the one who may write, since it came in their name.
       */
      unproven?: string;
    }
  | {
      kind: "press";
      chat: string;
      /** The pressed button's own `data`, as it was sent. */
      data: string;
      /** The message the buttons were under, to be settled once the press is taken. */
      under: Pressed | null;
    };

/**
 * A message a button was pressed under, as the service handed it back: its words, and `keep`,
 * whatever the service needs to draw it again as it was, which reach passes back untouched.
 */
export type Pressed = { id: string; text: string; keep?: unknown };

export type Button = { text: string; data: string };

/** A file of ours. A picture goes as a picture where the service draws one. */
export type OutgoingFile = {
  bytes: Uint8Array;
  name: string;
  picture: boolean;
};

export type Channel = {
  /**
   * Who may write is named on the screen (NAMED_CHANNELS), not let in from a first message:
   * anyone else who writes is neither answered nor asked about. A mailbox takes mail from
   * anyone, and an answer to a stranger would go to whoever they claimed to be.
   */
  named?: true;
  /**
   * One message carries words and files together (a mail): the files an answer names go
   * with it, in its `say`, rather than after it in `sendFiles`.
   */
  attaches?: true;
  /**
   * Connects, reports the bot's own name once known, then hands over what arrives until
   * `signal` aborts. Only one-to-one conversations are handed over: her answers are one
   * person's. Throws `ChannelRefusal` when the service turns the token away — asking again
   * would not change that — and anything else for trouble worth another try.
   *
   * `link` is the address that takes someone to this bot on the service, which only the
   * service's own file can name — a chat to open on Telegram, an invite to accept on
   * Discord — or null where the service has none. The screen draws it for a phone to read,
   * so nothing about a service is worked out from its bot's name.
   *
   * `id` is the bot's own id on the service, the same under every token it is given: what
   * tells a token replaced for this bot from a token for another one.
   *
   * `wanted` says whether reach would hear someone at all, for a service that can skip the
   * work of reading a stranger's message (a mail's sender checked in DNS). Reach still decides.
   */
  listen(
    on: {
      ready(bot: string, link: string | null, id: string): void;
      incoming(incoming: Incoming): void;
      wanted?(chat: string): Promise<boolean>;
      /**
       * What arrived is held, not read yet, while the connection stands (a mail whose
       * sender cannot be checked yet): said on the screen, apart from trouble connecting,
       * and taken back with null once it is read or refused.
       */
      holding?(why: string | null): void;
    },
    signal: AbortSignal,
  ): Promise<void>;
  /**
   * A text drawn in the service's own marks (chat-text), in as many messages as its length
   * takes; `buttons` go under the last, one to a row. `files` go only to a service that
   * `attaches` them.
   */
  say(
    chat: string,
    text: ChatText,
    buttons?: Button[],
    files?: OutgoingFile[],
  ): Promise<void>;
  /** "typing…", for a few seconds. */
  typing(chat: string): Promise<void>;
  /** Takes the buttons off a message once one was pressed, and writes the answer under it. */
  settle(chat: string, under: Pressed, answer: string): Promise<void>;
  /**
   * Files of ours, in as few messages as the service takes them: the pictures together,
   * drawn as pictures, and the rest as files.
   */
  sendFiles(chat: string, files: OutgoingFile[]): Promise<void>;
  /**
   * In bytes: the largest file the service hands a bot (`take`), the largest of ours it takes
   * (`file`), and the largest it draws as a picture (`picture`). A picture past `picture` goes
   * as a file; a file past either of the others is named in the chat instead.
   */
  limits: { take: number; file: number; picture: number };
};

/** The service answered, and refused: its words are the user's to act on (a wrong token, a missing permission). */
export class ChannelRefusal extends Error {
  /** Which of the service's tokens it turned away, in the order its maker takes them (REACH_KEYS). */
  readonly token: number;
  constructor(message: string, token = 0) {
    super(message);
    this.token = token;
  }
}

/**
 * Waits out a service's "too many requests" for as long as it says, so an answer that goes as
 * several messages is not cut off halfway. False when it names no wait, asks for longer than
 * REACH.rateWaitMs, or has asked REACH.rateRetries times already: its refusal then stands.
 */
export async function waitOut(
  seconds: number | null | undefined,
  attempt: number,
): Promise<boolean> {
  if (seconds == null || !Number.isFinite(seconds)) return false;
  const ms = Math.max(0, seconds * 1000);
  if (attempt >= REACH.rateRetries || ms > REACH.rateWaitMs) return false;
  await new Promise((resolve) => setTimeout(resolve, ms));
  return true;
}
