import { REACH } from "@/config";
import {
  type Channel,
  ChannelRefusal,
  type Incoming,
  type OutgoingFile,
  waitOut,
} from "./channel";
import { chatPieces } from "./chat-text";

/**
 * Telegram's Bot API as a reach channel: asked for what was written (a long poll, so
 * nothing calls in), told what to send back. Plain `fetch`; no library earns its place for
 * ten methods.
 */

const API = "https://api.telegram.org";
/** Telegram's cap on the pictures one album holds. */
const ALBUM_MAX = 10;
/** Telegram's cap on one message is 4096 characters as it counts them, marks aside; this leaves room. */
const MAX = 4_000;
/**
 * Telegram's caps, in the megabytes it states them in: what a bot may download (past it,
 * Telegram only says "file is too big"), send, and send as a photo.
 */
const MB = 1024 * 1024;
const LIMITS = { take: 20 * MB, file: 50 * MB, picture: 10 * MB };

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramFile = {
  file_id: string;
  file_size?: number;
  /** A voice message's, as its sender's app set it. */
  mime_type?: string;
};

/** Telegram answered, and said no: its words, and the status it answered in. */
class TelegramError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number; type: string };
  text?: string;
  /** What in `text` was bold, a link, code: the marks Telegram drew it with. */
  entities?: unknown[];
  caption?: string;
  /** The same picture at several sizes, smallest first. */
  photo?: (TelegramFile & { width: number })[];
  document?: TelegramFile & { file_name?: string; mime_type?: string };
  voice?: TelegramFile;
  audio?: TelegramFile;
  video?: TelegramFile;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  /** A button under one of our messages was pressed. */
  callback_query?: {
    id: string;
    from: TelegramUser;
    message?: TelegramMessage;
    data?: string;
  };
};

export function createTelegram(token: string): Channel {
  async function call<T>(
    method: string,
    body?: Record<string, unknown> | FormData,
    signal?: AbortSignal,
  ): Promise<T> {
    const form = body instanceof FormData;
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(`${API}/bot${token}/${method}`, {
        method: "POST",
        signal,
        ...(form
          ? { body }
          : {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body ?? {}),
            }),
      }).catch((cause: unknown) => {
        // A line that is down says where it could not go, not "fetch failed"
        throw new Error(`Could not reach ${new URL(API).host}`, { cause });
      });
      const said = (await response.json().catch(() => null)) as {
        ok?: boolean;
        result?: T;
        description?: string;
        parameters?: { retry_after?: number };
      } | null;
      if (said?.ok) return said.result as T;
      if (
        response.status === 429 &&
        (await waitOut(said?.parameters?.retry_after, attempt))
      )
        continue;
      const why = said?.description ?? `Telegram answered ${response.status}`;
      // 401 is the token itself; everything else may pass
      if (response.status === 401)
        throw new ChannelRefusal(
          `Telegram said “${why}”: this token was revoked or mistyped. Get it again from @BotFather and paste it here.`,
        );
      throw new TelegramError(why, response.status);
    }
  }

  const nameOf = (user?: TelegramUser) =>
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    (user?.username ? `@${user.username}` : "Someone");

  /** A file someone sent, as the bytes and the name it came with. */
  async function fetchFile(
    fileId: string,
    name: string,
    type?: string,
  ): Promise<File> {
    const { file_path: path } = await call<{ file_path?: string }>("getFile", {
      file_id: fileId,
    });
    if (!path) throw new Error("Telegram did not say where the file is");
    const response = await fetch(`${API}/file/bot${token}/${path}`);
    if (!response.ok)
      throw new Error(`Telegram answered ${response.status} for the file`);
    const ext = path.includes(".") ? path.slice(path.lastIndexOf(".")) : "";
    return new File(
      [await response.arrayBuffer()],
      name.includes(".") ? name : `${name}${ext}`,
      type ? { type } : undefined,
    );
  }

  function read(update: TelegramUpdate): Incoming | null {
    const pressed = update.callback_query;
    if (pressed) {
      // Ends the spinner on the button, whatever comes of the press
      void call("answerCallbackQuery", { callback_query_id: pressed.id }).catch(
        () => {},
      );
      return {
        kind: "press",
        chat: String(pressed.from.id),
        data: pressed.data ?? "",
        under: pressed.message?.text
          ? {
              id: String(pressed.message.message_id),
              text: pressed.message.text,
              keep: pressed.message.entities,
            }
          : null,
      };
    }
    const message = update.message;
    if (!message?.from || message.chat.type !== "private") return null;
    const photo = message.photo?.at(-1);
    // Bot API Message.voice: "Message is a voice message"
    const voice = message.voice;
    const sent = message.document
      ? {
          id: message.document.file_id,
          name: message.document.file_name ?? "file",
          type: message.document.mime_type,
          size: message.document.file_size,
        }
      : photo
        ? {
            id: photo.file_id,
            name: `photo-${message.message_id}`,
            type: "",
            size: photo.file_size,
          }
        : null;
    return {
      kind: "message",
      chat: String(message.chat.id),
      name: nameOf(message.from),
      handle: message.from.username ? `@${message.from.username}` : null,
      words: (message.text ?? message.caption ?? "").trim(),
      files: sent
        ? [
            {
              name: sent.name,
              size: sent.size,
              fetch: () => fetchFile(sent.id, sent.name, sent.type),
            },
          ]
        : [],
      voice: voice
        ? {
            name: `voice-${message.message_id}.ogg`,
            size: voice.file_size,
            fetch: () =>
              fetchFile(
                voice.file_id,
                `voice-${message.message_id}.ogg`,
                voice.mime_type ?? "audio/ogg",
              ),
          }
        : null,
      unreadable: Boolean(message.audio || message.video),
    };
  }

  /**
   * Past the last update handed over. Kept across connections: asked from 0 again, Telegram
   * hands back whatever it was not yet told was read, and a message would be answered twice.
   */
  let offset = 0;

  /** Pictures as one photo or one album, whichever the count makes them. */
  async function sendPictures(chat: string, some: OutgoingFile[]) {
    const form = new FormData();
    form.set("chat_id", chat);
    // An album holds two to ALBUM_MAX pictures; one alone is a photo of its own
    if (some.length === 1) {
      form.set("photo", new Blob([some[0].bytes as BlobPart]), some[0].name);
      await call("sendPhoto", form);
      return;
    }
    form.set(
      "media",
      JSON.stringify(
        some.map((_, n) => ({ type: "photo", media: `attach://p${n}` })),
      ),
    );
    for (const [n, file] of some.entries())
      form.set(`p${n}`, new Blob([file.bytes as BlobPart]), file.name);
    await call("sendMediaGroup", form);
  }

  return {
    limits: LIMITS,

    async listen(on, signal) {
      const me = await call<{
        id: number;
        username?: string;
        first_name?: string;
      }>("getMe", undefined, signal);
      on.ready(
        me.username ? `@${me.username}` : (me.first_name ?? "the bot"),
        // The chat with this bot, which a phone opens straight from its camera
        me.username ? `https://t.me/${me.username}` : null,
        String(me.id),
      );

      while (!signal.aborted) {
        const updates = await call<TelegramUpdate[]>(
          "getUpdates",
          {
            offset,
            timeout: REACH.pollSeconds,
            allowed_updates: ["message", "callback_query"],
          },
          // Past the wait itself, the connection is taken for dead
          AbortSignal.any([
            signal,
            AbortSignal.timeout((REACH.pollSeconds + 15) * 1000),
          ]),
        );
        for (const update of updates) {
          offset = update.update_id + 1;
          const incoming = read(update);
          if (incoming) on.incoming(incoming);
        }
      }
    },

    async say(chat, text, buttons) {
      const pieces = chatPieces(text, "telegram", MAX);
      for (const [at, piece] of pieces.entries())
        await call("sendMessage", {
          chat_id: chat,
          text: piece,
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
          ...(buttons?.length && at === pieces.length - 1
            ? {
                reply_markup: {
                  inline_keyboard: buttons.map((button) => [
                    { text: button.text, callback_data: button.data },
                  ]),
                },
              }
            : {}),
        });
    },

    async typing(chat) {
      await call("sendChatAction", { chat_id: chat, action: "typing" }).catch(
        () => {},
      );
    },

    async settle(chat, under, answer) {
      // Its words as Telegram gave them back, with the marks they carried, and the answer after
      await call("editMessageText", {
        chat_id: chat,
        message_id: Number(under.id),
        text: `${under.text}\n\n→ ${answer}`,
        entities: under.keep,
        link_preview_options: { is_disabled: true },
      }).catch(() => {});
    },

    async sendFiles(chat, files) {
      const pictures = files.filter((file) => file.picture);
      const documents = files.filter((file) => !file.picture);
      for (let at = 0; at < pictures.length; at += ALBUM_MAX) {
        const some = pictures.slice(at, at + ALBUM_MAX);
        // A picture Telegram refuses to draw as a photo (past its size, too long or too narrow:
        // a 400) still goes, as a file; anything else is a failure, and is said as one
        await sendPictures(chat, some).catch((cause: unknown) => {
          if (!(cause instanceof TelegramError && cause.status === 400))
            throw cause;
          documents.unshift(...some);
        });
      }
      for (const file of documents) {
        const form = new FormData();
        form.set("chat_id", chat);
        form.set("document", new Blob([file.bytes as BlobPart]), file.name);
        await call("sendDocument", form);
      }
    },
  };
}
