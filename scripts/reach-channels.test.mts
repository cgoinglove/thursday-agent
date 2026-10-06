import assert from "node:assert/strict";
import { after, test } from "node:test";

// Discord and Slack against a socket and a `fetch` that are only stubs: what each says to
// the service on connecting, what it hands over, what it leaves alone. No network.

type Frame = Record<string, unknown>;
class FakeSocket extends EventTarget {
  static OPEN = 1;
  static last: FakeSocket;
  readyState = 1;
  sent: Frame[] = [];
  constructor(readonly url: string) {
    super();
    FakeSocket.last = this;
  }
  send(data: string) {
    this.sent.push(JSON.parse(data) as Frame);
  }
  close(code = 1000) {
    this.readyState = 3;
    this.dispatchEvent(Object.assign(new Event("close"), { code, reason: "" }));
  }
  /** A frame from the service. */
  receive(frame: Frame) {
    this.dispatchEvent(
      Object.assign(new Event("message"), { data: JSON.stringify(frame) }),
    );
  }
}
const realSocket = globalThis.WebSocket;
const realFetch = globalThis.fetch;
globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;

const calls: { url: string; body: unknown }[] = [];
let uploads = 0;
/** How many sends to turn away as too many, each with a wait of no time at all. */
let limited = 0;
/** What Telegram answers a photo with, when set: 400 refuses the picture, 502 is Telegram unwell. */
let photoStatus = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (photoStatus && url.endsWith("/sendPhoto")) {
    calls.push({ url, body: "refused" });
    return Response.json(
      {
        ok: false,
        error_code: photoStatus,
        description:
          photoStatus === 400
            ? "Bad Request: PHOTO_INVALID_DIMENSIONS"
            : "Bad Gateway",
      },
      { status: photoStatus },
    );
  }
  if (limited > 0 && /sendMessage$|\/channels\/[^/]+\/messages$/.test(url)) {
    limited--;
    calls.push({ url, body: "limited" });
    return url.includes("telegram")
      ? Response.json(
          {
            ok: false,
            error_code: 429,
            description: "Too Many Requests: retry after 0",
            parameters: { retry_after: 0 },
          },
          { status: 429 },
        )
      : Response.json(
          { message: "You are being rate limited.", retry_after: 0 },
          { status: 429 },
        );
  }
  calls.push({
    url,
    // A form is kept as its fields, a file by its name
    body:
      typeof init?.body === "string"
        ? JSON.parse(init.body)
        : init?.body instanceof FormData
          ? Object.fromEntries(
              [...init.body].map(([key, value]) => [
                key,
                typeof value === "string" ? value : value.name,
              ]),
            )
          : null,
  });
  if (url.endsWith("/files.getUploadURLExternal")) {
    uploads++;
    return Response.json({
      ok: true,
      upload_url: `https://files.slack.test/${uploads}`,
      file_id: `F${uploads}`,
    });
  }
  if (url.endsWith("/auth.test"))
    return Response.json({
      ok: true,
      user: "thursday",
      user_id: "U0BOT",
      bot_id: "B0BOT",
    });
  if (url.endsWith("/apps.connections.open"))
    return Response.json({ ok: true, url: "wss://slack.test/socket" });
  if (url.endsWith("/users.info"))
    return Response.json({ ok: true, user: { real_name: "Sam", name: "sam" } });
  return Response.json({ ok: true, id: "m1" });
}) as typeof fetch;

after(() => {
  globalThis.WebSocket = realSocket;
  globalThis.fetch = realFetch;
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
const { createDiscord } = await import("../features/reach/discord.ts");
const { createSlack } = await import("../features/reach/slack.ts");
const { createTelegram } = await import("../features/reach/telegram.ts");
const { ChannelRefusal } = await import("../features/reach/channel.ts");
const { chatPieces, inPieces } = await import("../features/reach/chat-text.ts");

test("discord identifies after hello, hands over a direct message, leaves a server's alone, and acknowledges a press", async () => {
  const stop = new AbortController();
  const got: unknown[] = [];
  let bot = "";
  let link: string | null = null;
  let id = "";
  const listening = createDiscord("bot-token").listen(
    {
      ready: (name, where, own) => {
        bot = name;
        link = where;
        id = own;
      },
      incoming: (one) => got.push(one),
    },
    stop.signal,
  );
  await tick();
  const socket = FakeSocket.last;
  socket.receive({
    op: 10,
    d: { heartbeat_interval: 60_000 },
    s: null,
    t: null,
  });
  const identify = socket.sent.find((frame) => frame.op === 2) as {
    d: { token: string; intents: number };
  };
  assert.equal(identify.d.token, "bot-token");
  assert.equal(identify.d.intents, 1 << 12, "direct messages only");

  socket.receive({
    op: 0,
    t: "READY",
    s: 1,
    d: { user: { id: "b", username: "thursday" }, application: { id: "app1" } },
  });
  assert.equal(bot, "thursday");
  // The bot's own id, the same under every token it is given
  assert.equal(id, "b");
  // The invite is the step nothing else can do for the user: Discord delivers a direct
  // message only to a bot you share a server with, and READY names the application
  assert.equal(
    link,
    "https://discord.com/oauth2/authorize?client_id=app1&scope=bot&permissions=0",
  );

  const author = { id: "u1", username: "sam", global_name: "Sam" };
  socket.receive({
    op: 0,
    t: "MESSAGE_CREATE",
    s: 2,
    d: { id: "1", channel_id: "dm1", author, content: " hello " },
  });
  socket.receive({
    op: 0,
    t: "MESSAGE_CREATE",
    s: 3,
    d: {
      id: "2",
      channel_id: "c9",
      guild_id: "g1",
      author,
      content: "in a server",
    },
  });
  socket.receive({
    op: 0,
    t: "MESSAGE_CREATE",
    s: 4,
    d: {
      id: "3",
      channel_id: "dm1",
      author: { ...author, bot: true },
      content: "a bot",
    },
  });
  assert.deepEqual(
    got.map((one) => ({ ...(one as object), files: undefined })),
    [
      {
        kind: "message",
        chat: "dm1",
        name: "Sam",
        // The name shown can be anyone's; the username is this person's alone
        handle: "@sam",
        words: "hello",
        files: undefined,
        voice: null,
        unreadable: false,
      },
    ],
  );

  // A voice message (flag IS_VOICE_MESSAGE): its audio is what they said, not a file
  const attachment = {
    filename: "voice-message.ogg",
    url: "https://cdn.discordapp.com/voice.ogg",
    size: 4,
    content_type: "audio/ogg",
  };
  socket.receive({
    op: 0,
    t: "MESSAGE_CREATE",
    s: 5,
    d: {
      id: "4",
      channel_id: "dm1",
      author,
      content: "",
      flags: 1 << 13,
      attachments: [attachment],
    },
  });
  // The same audio sent as a file stays a file
  socket.receive({
    op: 0,
    t: "MESSAGE_CREATE",
    s: 6,
    d: {
      id: "5",
      channel_id: "dm1",
      author,
      content: "",
      attachments: [attachment],
    },
  });
  const [spoken, filed] = got.splice(1, 2) as {
    files: { name: string }[];
    voice: { name: string } | null;
  }[];
  assert.equal(spoken?.voice?.name, "voice-message.ogg");
  assert.deepEqual(spoken?.files, []);
  assert.equal(filed?.voice, null);
  assert.deepEqual(
    filed?.files.map((file) => file.name),
    ["voice-message.ogg"],
  );

  socket.receive({
    op: 0,
    t: "INTERACTION_CREATE",
    s: 5,
    d: {
      id: "i1",
      token: "tok",
      type: 3,
      channel_id: "dm1",
      data: { custom_id: "q-1:0" },
      message: { id: "m7", content: "Which?" },
    },
  });
  await tick();
  assert.deepEqual(got[1], {
    kind: "press",
    chat: "dm1",
    data: "q-1:0",
    under: { id: "m7", text: "Which?" },
  });
  assert.ok(
    calls.some((call) => call.url.endsWith("/interactions/i1/tok/callback")),
    "the press is acknowledged",
  );

  // Discord saying the token is wrong is the user's to fix, not something to try again
  socket.close(4004);
  await assert.rejects(listening, ChannelRefusal);
});

test("slack acknowledges every envelope and hands over only the direct conversation", async () => {
  const stop = new AbortController();
  const got: unknown[] = [];
  let bot = "";
  let id = "";
  const listening = createSlack("xapp-1", "xoxb-1").listen(
    {
      ready: (name, _, own) => {
        bot = name;
        id = own;
      },
      incoming: (one) => got.push(one),
    },
    stop.signal,
  );
  await tick();
  await tick();
  assert.equal(bot, "@thursday");
  // The app's bot, not the person whose token installed it
  assert.equal(id, "B0BOT");
  const socket = FakeSocket.last;
  assert.equal(socket.url, "wss://slack.test/socket");

  const event = (extra: Frame) => ({
    type: "events_api",
    envelope_id: `e${socket.sent.length}`,
    payload: {
      event: {
        type: "message",
        user: "U1",
        text: "hi",
        channel: "D1",
        channel_type: "im",
        ...extra,
      },
    },
  });
  socket.receive(event({}));
  socket.receive(event({ channel_type: "channel", channel: "C1" }));
  socket.receive(event({ bot_id: "B1" }));
  socket.receive(event({ subtype: "message_changed" }));
  await tick();
  assert.equal(socket.sent.length, 4, "each envelope is acknowledged");
  assert.deepEqual(
    got.map((one) => ({ ...(one as object), files: undefined })),
    [
      {
        kind: "message",
        chat: "D1",
        name: "Sam",
        handle: "@sam",
        words: "hi",
        files: undefined,
        voice: null,
        unreadable: false,
      },
    ],
  );

  socket.receive({
    type: "interactive",
    envelope_id: "e9",
    payload: {
      type: "block_actions",
      channel: { id: "D1" },
      message: { ts: "17.1", text: "Which?" },
      actions: [{ value: "q-1:1" }],
    },
  });
  await tick();
  assert.deepEqual(got[1], {
    kind: "press",
    chat: "D1",
    data: "q-1:1",
    under: { id: "17.1", text: "Which?" },
  });

  stop.abort();
  await listening;
});

const pictures = (count: number) =>
  Array.from({ length: count }, (_, n) => ({
    bytes: new Uint8Array([n]),
    name: `page-${n + 1}.png`,
    picture: true,
  }));

test("discord sends files ten to a message, each named as it is", async () => {
  const from = calls.length;
  await createDiscord("bot-token").sendFiles("dm1", [
    ...pictures(11),
    { bytes: new Uint8Array([1]), name: "page.html", picture: false },
  ]);
  const posted = calls.slice(from) as {
    url: string;
    body: Record<string, string>;
  }[];
  assert.deepEqual(
    posted.map((call) => call.url),
    [1, 2].map(() => "https://discord.com/api/v10/channels/dm1/messages"),
  );
  const named = posted.map((call) =>
    (
      JSON.parse(call.body.payload_json) as {
        attachments: { id: number; filename: string }[];
      }
    ).attachments.map(
      (attachment) =>
        `${attachment.filename}=${call.body[`files[${attachment.id}]`]}`,
    ),
  );
  assert.deepEqual(named, [
    pictures(10).map((file) => `${file.name}=${file.name}`),
    ["page-11.png=page-11.png", "page.html=page.html"],
  ]);
});

test("slack uploads each file and posts them all as one message", async () => {
  const from = calls.length;
  await createSlack("xapp-1", "xoxb-1").sendFiles("D1", [
    ...pictures(2),
    { bytes: new Uint8Array([1]), name: "page.html", picture: false },
  ]);
  const completed = calls
    .slice(from)
    .filter((call) => call.url.endsWith("/files.completeUploadExternal"));
  assert.equal(completed.length, 1, "one message");
  assert.deepEqual(completed[0].body, {
    files: [
      { id: `F${uploads - 2}`, title: "page-1.png" },
      { id: `F${uploads - 1}`, title: "page-2.png" },
      { id: `F${uploads}`, title: "page.html" },
    ],
    channel_id: "D1",
  });
});

test("discord drops a line whose beat went unanswered, to be dialled again", async () => {
  const stop = new AbortController();
  const listening = createDiscord("bot-token").listen(
    { ready: () => {}, incoming: () => {} },
    stop.signal,
  );
  await tick();
  const socket = FakeSocket.last;
  socket.receive({ op: 10, d: { heartbeat_interval: 10 }, s: null, t: null });
  // The first beat goes out, nothing answers it, and the next finds it unanswered
  const dropped = await listening.then(
    () => null,
    (cause: unknown) => cause,
  );
  assert.ok(
    socket.sent.some((frame) => frame.op === 1),
    "a beat went out",
  );
  assert.ok(dropped instanceof Error, "the line is given up");
  assert.ok(
    !(dropped instanceof ChannelRefusal),
    "as trouble worth another try, not a refused token",
  );
  assert.equal(dropped.message, "Discord stopped answering");
});

test("a service's too-many-requests is waited out, and the message still goes", async () => {
  limited = 1;
  const from = calls.length;
  await createTelegram("123:token").say("7", { plain: "hello" });
  const telegram = calls.slice(from).map((call) => call.body);
  assert.equal(telegram.length, 2, "asked twice");
  assert.equal(telegram[0], "limited");

  limited = 1;
  const next = calls.length;
  await createDiscord("bot-token").say("dm1", { plain: "hello" });
  assert.equal(calls.length - next, 2, "Discord too");
});

test("a long answer is cut where the reading breaks", () => {
  // A paragraph in the back half wins over a line after it
  const paragraph = `${"x".repeat(700)}\n\n${"y".repeat(60)}\n${"z".repeat(400)}`;
  assert.equal(inPieces(paragraph, 1_000)[0], "x".repeat(700));
  // With no break at all, a space; never mid-word while one is near
  const words = `${"word ".repeat(300)}`.trim();
  const [first] = inPieces(words, 1_000);
  assert.ok(first.endsWith("word"), first.slice(-12));
  // Cut hard only when it must, and never between the halves of one character
  const emoji = `${"a".repeat(999)}😀${"b".repeat(10)}`;
  const [head, tail] = inPieces(emoji, 1_000);
  assert.equal(head, "a".repeat(999));
  assert.ok(tail.startsWith("😀"));
});

test("her words are drawn in each service's own marks", () => {
  const markdown =
    "## Posted\n\n- **Post:** [the carousel](https://example.com/p/1), `4:5`\n- the file [report](artifacts/Jarvis/report.html)\n\nAT&amp;T < 3 & *so*";
  const drawn = (marks: "telegram" | "discord" | "slack" | "plain") =>
    chatPieces({ markdown }, marks, 4_000);
  assert.deepEqual(drawn("telegram"), [
    '<b>Posted</b>\n\n• <b>Post:</b> <a href="https://example.com/p/1">the carousel</a>, <code>4:5</code>\n• the file report\n\nAT&amp;T &lt; 3 &amp; <i>so</i>',
  ]);
  assert.deepEqual(drawn("discord"), [
    "## Posted\n\n- **Post:** [the carousel](https://example.com/p/1), `4:5`\n- the file report\n\nAT&T < 3 & *so*",
  ]);
  assert.deepEqual(drawn("slack"), [
    "*Posted*\n\n• *Post:* <https://example.com/p/1|the carousel>, `4:5`\n• the file report\n\nAT&amp;T &lt; 3 &amp; _so_",
  ]);
  // A path is words on a phone: the file itself goes along with the answer
  assert.deepEqual(drawn("plain"), [
    "Posted\n\n• Post: the carousel https://example.com/p/1, 4:5\n• the file report\n\nAT&T < 3 & so",
  ]);
});

test("a picture or a file link with no words of its own is drawn by its file's name", () => {
  // Left empty, a row of them came out as a line of commas
  const markdown =
    "Made: ![](/api/file/artifacts/Designer/poster-1.png), [![](/api/file/artifacts/Designer/poster-2.png)](/api/file/artifacts/Designer/poster-2.png), [](artifacts/Designer/poster-3.png)";
  assert.deepEqual(chatPieces({ markdown }, "plain", 4_000), [
    "Made: poster-1.png, poster-2.png, poster-3.png",
  ]);
});

test("code reaches every service as written", () => {
  const markdown =
    "Run:\n\n```bash\n# once\nnpm i -g thing\n- not a list\n```\n\nThen `**not bold**`.";
  assert.deepEqual(chatPieces({ markdown }, "telegram", 4_000), [
    'Run:\n\n<pre><code class="language-bash"># once\nnpm i -g thing\n- not a list</code></pre>\n\nThen <code>**not bold**</code>.',
  ]);
  assert.deepEqual(chatPieces({ markdown }, "discord", 4_000), [
    "Run:\n\n```bash\n# once\nnpm i -g thing\n- not a list\n```\n\nThen `**not bold**`.",
  ]);
  assert.deepEqual(chatPieces({ markdown }, "plain", 4_000), [
    "Run:\n\n# once\nnpm i -g thing\n- not a list\n\nThen **not bold**.",
  ]);
});

test("a long answer is cut between blocks, a code block closed and opened around each cut, and no mark cut open", () => {
  const code = Array.from({ length: 30 }, (_, n) => `line ${n}`).join("\n");
  const markdown = `**First** part.\n\n\`\`\`\n${code}\n\`\`\`\n\n${"word ".repeat(80).trim()}`;
  const pieces = chatPieces({ markdown }, "telegram", 120);
  for (const piece of pieces) {
    assert.ok(piece.length <= 120, `${piece.length}: ${piece}`);
    for (const tag of ["b", "pre"])
      assert.equal(
        piece.split(`<${tag}>`).length,
        piece.split(`</${tag}>`).length,
        `every <${tag}> closes in its own piece: ${piece}`,
      );
  }
  assert.equal(pieces[0], "<b>First</b> part.");
  // The code comes back whole, line for line, across the pieces it was cut into
  const lines = [
    ...pieces.join("\n").matchAll(/<pre>([\s\S]*?)<\/pre>/g),
  ].flatMap((found) => found[1].split("\n"));
  assert.deepEqual(lines, code.split("\n"));
  // A paragraph longer than a piece goes as its words
  assert.equal(pieces.join(" ").match(/\bword\b/g)?.length, 80);
});

test("the app's own lines are words in every service, whatever they hold", () => {
  const plain = "report_final_*v2*.md <draft> & more";
  assert.deepEqual(chatPieces({ plain }, "telegram", 4_000), [
    "report_final_*v2*.md &lt;draft&gt; &amp; more",
  ]);
  assert.deepEqual(chatPieces({ plain }, "discord", 4_000), [
    "report\\_final\\_\\*v2\\*.md <draft\\> & more",
  ]);
  assert.deepEqual(chatPieces({ plain }, "slack", 4_000), [
    "report_final_*v2*.md &lt;draft&gt; &amp; more",
  ]);
});

test("telegram sends a picture it refuses as a photo as a file, and any other failure is said", async () => {
  const telegram = createTelegram("123:token");
  const picture = [
    { bytes: new Uint8Array([1]), name: "tall.png", picture: true },
  ];
  photoStatus = 400;
  const from = calls.length;
  await telegram.sendFiles("7", picture);
  assert.deepEqual(
    calls.slice(from).map((call) => call.url.split("/").pop()),
    ["sendPhoto", "sendDocument"],
  );
  photoStatus = 502;
  await assert.rejects(telegram.sendFiles("7", picture), /Bad Gateway/);
  photoStatus = 0;
});
