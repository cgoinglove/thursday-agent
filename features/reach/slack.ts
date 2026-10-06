import {
  type Channel,
  ChannelRefusal,
  type Incoming,
  waitOut,
} from "./channel";
import { chatPieces } from "./chat-text";
import { runSocket } from "./socket";

/**
 * Slack as a reach channel, in Socket Mode: the app-level token opens a socket Slack sends
 * events down, the bot token speaks through the Web API. Only the direct conversation with
 * the app (its Messages tab) is read. The app itself is made from the manifest in the guide,
 * which asks for exactly the scopes used here.
 */

const API = "https://slack.com/api";
/** Slack's cap on the text of one section block. */
const MAX = 2_900;
/** Slack's cap on one uploaded file. */
const FILE_BYTES = 1024 * 1024 * 1024;
/** Answers that mean a token is wrong or lacks what it needs, not that Slack is unwell. */
const REFUSED = new Set([
  "invalid_auth",
  "not_authed",
  "account_inactive",
  "token_revoked",
  "not_allowed_token_type",
  "missing_scope",
]);

type SlackEvent = {
  type?: string;
  subtype?: string;
  channel_type?: string;
  channel?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  files?: {
    name?: string;
    size?: number;
    mimetype?: string;
    url_private_download?: string;
  }[];
};

export function createSlack(appToken: string, botToken: string): Channel {
  async function api<T>(
    method: string,
    body: Record<string, unknown>,
    token = botToken,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(`${API}/${method}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(body),
      }).catch((cause: unknown) => {
        // A line that is down says where it could not go, not "fetch failed"
        throw new Error(`Could not reach ${new URL(API).host}`, { cause });
      });
      // Slack names the wait in a header, in seconds
      const after = response.headers.get("retry-after");
      if (
        response.status === 429 &&
        (await waitOut(after === null ? null : Number(after), attempt))
      )
        continue;
      const said = (await response.json().catch(() => null)) as
        | ({ ok?: boolean; error?: string; needed?: string } & T)
        | null;
      if (said?.ok) return said;
      const code = said?.error ?? `http_${response.status}`;
      if (!REFUSED.has(code))
        throw new Error(`Slack answered ${code} to ${method}`);
      // The app token opens the socket and the bot token does the rest, so which one a
      // refusal names is known here, and the screen opens that step (REACH_KEYS order)
      const app = token === appToken;
      const needed = said?.needed ?? "a scope";
      throw new ChannelRefusal(
        code === "missing_scope"
          ? app
            ? `Slack says this app-level token lacks ${needed} — generate one with it under Basic Information › App-Level Tokens and paste it here.`
            : `Slack says the app lacks a permission (${needed}) — make it from the manifest in the guide.`
          : app
            ? `Slack turned the app-level token away (${code}). Generate a new one under Basic Information › App-Level Tokens and paste it here.`
            : `Slack turned the bot token away (${code}). Copy the Bot User OAuth Token again from Install App and paste it here.`,
        app ? 0 : 1,
      );
    }
  }

  /**
   * A person as Slack shows them, and their handle; their id alone when the app may not read
   * it.
   */
  const people = new Map<string, { name: string; handle: string | null }>();
  async function whoIs(user: string) {
    const known = people.get(user);
    if (known) return known;
    const who = await api<{ user?: { real_name?: string; name?: string } }>(
      "users.info",
      { user },
    )
      .then((said) => ({
        name: said.user?.real_name || said.user?.name || user,
        handle: said.user?.name ? `@${said.user.name}` : null,
      }))
      .catch(() => ({ name: user, handle: null }));
    people.set(user, who);
    return who;
  }

  async function read(
    type: string,
    payload: Record<string, unknown>,
  ): Promise<Incoming | null> {
    if (type === "events_api") {
      const event = (payload.event ?? {}) as SlackEvent;
      const plain = !event.subtype || event.subtype === "file_share";
      if (event.type !== "message" || event.channel_type !== "im") return null;
      if (!plain || event.bot_id || !event.user || !event.channel) return null;
      const who = await whoIs(event.user);
      return {
        kind: "message",
        chat: event.channel,
        name: who.name,
        handle: who.handle,
        words: (event.text ?? "").trim(),
        files: (event.files ?? []).flatMap((file) => {
          const url = file.url_private_download;
          if (!url) return [];
          const name = file.name ?? "file";
          return [
            {
              name,
              size: file.size,
              fetch: async () => {
                const response = await fetch(url, {
                  headers: { authorization: `Bearer ${botToken}` },
                });
                if (!response.ok)
                  throw new Error(
                    `Slack answered ${response.status} for the file`,
                  );
                return new File([await response.arrayBuffer()], name, {
                  type: file.mimetype ?? "",
                });
              },
            },
          ];
        }),
        voice: null,
        unreadable: false,
      };
    }
    if (type === "interactive" && payload.type === "block_actions") {
      const pressed = payload as {
        channel?: { id?: string };
        message?: { ts?: string; text?: string };
        actions?: { value?: string }[];
      };
      if (!pressed.channel?.id) return null;
      return {
        kind: "press",
        chat: pressed.channel.id,
        data: pressed.actions?.[0]?.value ?? "",
        under:
          pressed.message?.ts && pressed.message.text
            ? { id: pressed.message.ts, text: pressed.message.text }
            : null,
      };
    }
    return null;
  }

  return {
    // What someone sends is handed over whole, whatever it weighs
    limits: { take: Infinity, file: FILE_BYTES, picture: FILE_BYTES },

    async listen(on, signal) {
      const me = await api<{
        user?: string;
        user_id?: string;
        bot_id?: string;
      }>("auth.test", {});
      const { url } = await api<{ url: string }>(
        "apps.connections.open",
        {},
        appToken,
      );
      // Slack names no address for an app, which is opened from inside the workspace, and its
      // bot is the app's own, the same however often the app is installed again
      on.ready(
        me.user ? `@${me.user}` : "the app",
        null,
        me.bot_id ?? me.user_id ?? "",
      );

      const closed = await runSocket(
        url,
        {
          message(frame, send) {
            const {
              type,
              envelope_id: envelope,
              payload,
            } = frame as {
              type?: string;
              envelope_id?: string;
              payload?: Record<string, unknown>;
            };
            // Acknowledged first: Slack sends again what is not, and a turn takes longer than it waits
            if (envelope) send({ envelope_id: envelope });
            if (!type || !payload) return;
            void read(type, payload).then((incoming) => {
              if (incoming) on.incoming(incoming);
            });
          },
        },
        signal,
      );
      // Slack closes every socket after a few hours and says so beforehand: reach connects again
      if (!signal.aborted)
        throw new Error(`Slack closed the connection (${closed.code})`);
    },

    async say(chat, text, buttons) {
      const pieces = chatPieces(text, "slack", MAX);
      for (const [at, piece] of pieces.entries()) {
        const last = buttons?.length && at === pieces.length - 1;
        await api("chat.postMessage", {
          channel: chat,
          text: piece,
          unfurl_links: false,
          unfurl_media: false,
          ...(last
            ? {
                blocks: [
                  {
                    type: "section",
                    text: { type: "mrkdwn", text: piece },
                  },
                  {
                    type: "actions",
                    elements: buttons.slice(0, 25).map((button, index) => ({
                      type: "button",
                      action_id: `choice_${index}`,
                      text: {
                        type: "plain_text",
                        text: button.text.slice(0, 75),
                      },
                      value: button.data,
                    })),
                  },
                ],
              }
            : {}),
        });
      }
    },

    // Slack gives an app no way to say it is typing
    async typing() {},

    async settle(chat, under, answer) {
      // Its words are the mrkdwn it was sent in, so they are drawn as they were
      const after = `\n\n→ ${chatPieces({ plain: answer }, "slack", MAX)[0]}`;
      await api("chat.update", {
        channel: chat,
        ts: under.id,
        text: `${under.text.slice(0, MAX - after.length)}${after}`,
        blocks: [],
      }).catch(() => {});
    },

    // Each file is uploaded on its own, and one completion posts them all as one message
    async sendFiles(chat, files) {
      const uploaded: { id: string; title: string }[] = [];
      for (const { bytes, name } of files) {
        const form = new URLSearchParams({
          filename: name,
          length: String(bytes.byteLength),
        });
        const asked = await fetch(`${API}/files.getUploadURLExternal`, {
          method: "POST",
          headers: { authorization: `Bearer ${botToken}` },
          body: form,
        });
        const slot = (await asked.json()) as {
          ok?: boolean;
          error?: string;
          upload_url?: string;
          file_id?: string;
        };
        if (!slot.ok || !slot.upload_url || !slot.file_id)
          throw new Error(
            `Slack answered ${slot.error ?? asked.status} to the upload`,
          );
        const put = await fetch(slot.upload_url, {
          method: "POST",
          body: new Blob([bytes as BlobPart]),
        });
        // Completed anyway, it would post a file with nothing in it
        if (!put.ok)
          throw new Error(`Slack answered ${put.status} to the upload`);
        uploaded.push({ id: slot.file_id, title: name });
      }
      if (uploaded.length)
        await api("files.completeUploadExternal", {
          files: uploaded,
          channel_id: chat,
        });
    },
  };
}
