import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { HERE, LIVE_CALL } from "../config.ts";
import type {
  LiveActivity,
  LiveReasoning,
  LiveSearch,
  LiveSource,
  LiveToolCall,
  LiveTurn,
} from "../lib/live/live.session.ts";

let wire: {
  on: {
    event(event: Record<string, unknown>): void;
    dropped(message: string): void;
  };
  negotiate(sdp: string): Promise<string>;
};
let sent: Record<string, unknown>[] = [];
let released = false;
/** Whether the caller's microphone was stopped while the line stayed up. */
let hushed = false;
/** A message the data channel throws on, as it does on one past its limit. */
let refuses: ((event: Record<string, unknown>) => boolean) | null = null;
/** The largest message the connection says it carries, as `limit` answers; null before it says. */
let messageBytes: number | null = 262_144;
mock.module("../lib/live/live.transport.ts", {
  namedExports: {
    createWebRtcTransport: (options: typeof wire) => {
      wire = options;
      return {
        connect: async () => {
          assert.equal(await wire.negotiate("offer"), "answer");
          wire.on.event({ type: "session.started" });
        },
        send: (event: Record<string, unknown>) => {
          if (refuses?.(event)) throw new TypeError("Message too large");
          sent.push(event);
        },
        limit: () => messageBytes,
        // A key's call: its events ride the media connection
        relayed: () => false,
        hush: () => {
          hushed = true;
        },
        close: () => {
          released = true;
        },
      };
    },
  },
});
const { appendChunks, createLiveSession } = await import(
  "../lib/live/live.session.ts"
);
const { acceptedReasoning, createLiveCall } = await import(
  "../lib/live/live.server.ts"
);

const sessions: ReturnType<typeof createLiveSession>[] = [];
afterEach(async () => {
  for (const session of sessions.splice(0)) {
    const closed = session.close();
    wire.on.event({
      type: "session.closed",
      reason: "close_requested",
      usage: { seconds: 1 },
    });
    await closed;
  }
  refuses = null;
  messageBytes = 262_144;
  mock.restoreAll();
});

async function connect({
  runTool = async () => "ok",
}: {
  runTool?: (call: LiveToolCall) => Promise<string>;
} = {}) {
  sent = [];
  released = false;
  const levels = { output: 0 };
  const turns: LiveTurn[] = [];
  const warnings: string[] = [];
  const failures: string[] = [];
  const activities: LiveActivity[] = [];
  const reasonings: LiveReasoning[] = [];
  const searches: LiveSearch[] = [];
  const citations: [string, LiveSource[]][] = [];
  const closes: { reason: string; seconds: number | null }[] = [];
  const session = createLiveSession({
    initialize: async (sdp) => {
      assert.equal(sdp, "offer");
      return "answer";
    },
    audio: {
      element: { muted: false } as HTMLAudioElement,
      listen() {},
      levels: () => levels,
    },
    on: {
      runTool,
      reasoning: (part) => reasonings.push(part),
      search: (search) => searches.push(search),
      cited: (responseId, sources) => citations.push([responseId, sources]),
      turn: (turn) => turns.push(turn),
      warn: (message) => warnings.push(message),
      failed: (message) => failures.push(message),
      activity: (activity) => activities.push(activity),
      finalized: (close) => closes.push(close),
    },
  });
  sessions.push(session);
  await session.connect();
  return {
    session,
    levels,
    turns,
    warnings,
    failures,
    activities,
    reasonings,
    searches,
    citations,
    closes,
  };
}

function nested(event: Record<string, unknown>) {
  wire.on.event({
    type: "response.event",
    delegation_id: "delegation-a",
    event,
  });
}
const functionCall = (call_id: string, status?: string) =>
  nested({
    type: "response.output_item.done",
    item: {
      type: "function_call",
      id: `item-${call_id}`,
      call_id,
      name: "lookup",
      arguments: "{}",
      ...(status ? { status } : {}),
    },
  });
const count = (type: string) =>
  sent.filter((event) => event.type === type).length;
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("the backend waits for every function output and continues once, using the envelope's response", async () => {
  const pending = new Map<string, (value: string) => void>();
  const { activities } = await connect({
    runTool: (call) => new Promise((resolve) => pending.set(call.id, resolve)),
  });
  nested({ type: "response.created", response: { id: "r1" } });
  nested({ type: "response.function_call_arguments.done", arguments: "{}" });
  functionCall("a");
  functionCall("b");
  await tick();
  assert.equal(pending.size, 2);
  assert.equal(activities.at(-1)?.working, true);
  nested({ type: "response.completed", response: { id: "r1", output: [] } });
  pending.get("a")?.("first");
  await tick();
  assert.equal(count("response.item.create"), 1);
  assert.equal(count("response.create"), 0);
  pending.get("b")?.("second");
  await tick();
  assert.equal(count("response.item.create"), 2);
  assert.equal(count("response.create"), 1);
  // A repeated terminal snapshot and a repeated item run nothing twice
  nested({ type: "response.completed", response: { id: "r1" } });
  functionCall("a");
  await tick();
  assert.equal(count("response.create"), 1);
  assert.equal(count("response.item.create"), 2);
});

/** What went out for the backend, in order: an item's type (a message's role), or continue. */
const backendOrder = () =>
  sent
    .filter(
      (event) =>
        event.type === "response.item.create" ||
        event.type === "response.create",
    )
    .map((event) => {
      if (event.type === "response.create") return "continue";
      const item = event.item as {
        type: string;
        role?: string;
        call_id?: string;
      };
      return item.type === "message"
        ? `message:${item.role}`
        : `${item.type}:${item.call_id}`;
    });

for (const [first, second] of [
  ["a", "b"],
  ["b", "a"],
] as const) {
  test(`with two tools in one turn, a picture put down waits until both outputs are in, whichever finishes first: ${first} first`, async () => {
    const pending = new Map<string, (value: string) => void>();
    const { session } = await connect({
      runTool: (call) =>
        new Promise((resolve) => pending.set(call.id, resolve)),
    });
    nested({ type: "response.created", response: { id: "r1" } });
    functionCall("a");
    functionCall("b");
    nested({ type: "response.completed", response: { id: "r1", output: [] } });
    await tick();
    session.picture("data:image/jpeg;base64,AAAA", "inbox/photo.png");
    pending.get(first)?.("done");
    await tick();
    assert.deepEqual(backendOrder(), [`function_call_output:${first}`]);
    pending.get(second)?.("done");
    await tick();
    assert.deepEqual(backendOrder(), [
      `function_call_output:${first}`,
      `function_call_output:${second}`,
      "message:user",
      "continue",
    ]);
  });
}

test("a picture put down while the backend is quiet goes in at once, named by its path, and starts no turn", async () => {
  const image = "data:image/jpeg;base64,BBBB";
  const { session } = await connect();
  session.picture(image, "inbox/photo.png");
  assert.deepEqual(backendOrder(), ["message:user"]);
  assert.deepEqual(sent.at(-1)?.item, {
    type: "message",
    role: "user",
    content: [
      { type: "input_text", text: "inbox/photo.png, as an image:" },
      { type: "input_image", image_url: image },
    ],
  });
});

test("the room a picture has is the connection's limit less the event around it, the words naming it and its path in bytes", async () => {
  const { session } = await connect();
  // The mock's limit of 262,144, less 1,024 for the event, 64 for the words, 15 for the path
  assert.equal(session.pictureRoom("inbox/photo.png"), 261_041);
  // A path takes its UTF-8 bytes, not its characters: here 2, 3 and 4 to a character
  const wide = "inbox/\u{e9}\u{4e2d}\u{1F642}.png";
  assert.equal(new TextEncoder().encode(wide).length, 19);
  assert.equal(session.pictureRoom(wide), 261_037);
});

test("a limit no picture can be held to is taken as the smallest one every end takes", async () => {
  const { session } = await connect();
  // None yet, none, no bound at all, and one too small to hold an event with a picture in it:
  // the 65,536 of a data channel's default, less 1,024, 64 and the path's 15
  for (const limit of [null, 0, Number.POSITIVE_INFINITY, 2_048]) {
    messageBytes = limit;
    assert.equal(session.pictureRoom("inbox/photo.png"), 64_433, String(limit));
  }
  // Past that the limit is the connection's own
  messageBytes = 2_049;
  assert.equal(session.pictureRoom("inbox/photo.png"), 946);
});

test("a picture as long as its room goes in one message no larger than the limit it was made for", async () => {
  const { session } = await connect();
  const head = "data:image/jpeg;base64,";
  const size = (event: unknown) =>
    new TextEncoder().encode(JSON.stringify(event)).length;
  const paths = [
    "inbox/photo.png",
    // 2, 3 and 4 bytes to a character, a long run of them
    `inbox/${"\u{e9}\u{4e2d}\u{1F642}".repeat(40)}.png`,
    // Characters JSON writes as two
    'inbox/a "quoted" \\ name.png',
  ];
  // What the message is made to fit, and the limit it must then be under: the connection's own,
  // or, where it names none a picture can be held to, the default every end takes
  for (const [limit, under] of [
    [262_144, 262_144],
    [null, 65_536],
    [0, 65_536],
    [Number.POSITIVE_INFINITY, 65_536],
  ] as const) {
    messageBytes = limit;
    for (const path of paths) {
      sent = [];
      const room = session.pictureRoom(path);
      const image = head + "A".repeat(room - head.length);
      assert.equal(image.length, room);
      session.picture(image, path);
      assert.deepEqual(backendOrder(), ["message:user"]);
      const bytes = size(sent[0]);
      assert.ok(bytes <= under, `${path} in ${limit}: ${bytes} > ${under}`);
    }
  }
});

test("a picture put down while the backend waits on its tools goes in after their outputs, before it goes on", async () => {
  const pending = new Map<string, (value: string) => void>();
  const { session } = await connect({
    runTool: (call) => new Promise((resolve) => pending.set(call.id, resolve)),
  });
  nested({ type: "response.created", response: { id: "r1" } });
  functionCall("a");
  nested({ type: "response.completed", response: { id: "r1", output: [] } });
  await tick();
  session.picture("data:image/jpeg;base64,BBBB", "inbox/photo.png");
  assert.deepEqual(backendOrder(), []);
  pending.get("a")?.("done");
  await tick();
  assert.deepEqual(backendOrder(), [
    "function_call_output:a",
    "message:user",
    "continue",
  ]);
});

test("a picture put down while the backend answers goes in once that answer ends, however it ends", async () => {
  const { session } = await connect();
  // Answered without a tool: nothing to go on with, so the picture waits for the next hand-over
  nested({ type: "response.created", response: { id: "r1" } });
  session.picture("data:image/jpeg;base64,BBBB", "inbox/one.png");
  assert.deepEqual(backendOrder(), []);
  nested({ type: "response.completed", response: { id: "r1", output: [] } });
  await tick();
  assert.deepEqual(backendOrder(), ["message:user"]);
  // Failed: what waited on it still goes in
  nested({ type: "response.created", response: { id: "r2" } });
  session.picture("data:image/jpeg;base64,CCCC", "inbox/two.png");
  assert.deepEqual(backendOrder(), ["message:user"]);
  nested({
    type: "response.failed",
    response: { id: "r2", error: { message: "Backend failed." } },
  });
  await tick();
  assert.deepEqual(backendOrder(), ["message:user", "message:user"]);
  // Ended by a top-level error that named no end for it
  nested({ type: "response.created", response: { id: "r3" } });
  session.picture("data:image/jpeg;base64,DDDD", "inbox/three.png");
  wire.on.event({ type: "error", error: { message: "Handoff ended." } });
  await tick();
  assert.deepEqual(backendOrder(), [
    "message:user",
    "message:user",
    "message:user",
  ]);
});

test("a run asked for on what was put down goes at once while the backend is quiet, and after a running turn once, never twice", async () => {
  const pending = new Map<string, (value: string) => void>();
  const { session } = await connect({
    runTool: (call) => new Promise((resolve) => pending.set(call.id, resolve)),
  });
  // Quiet: the picture, then the run on it
  session.picture("data:image/jpeg;base64,BBBB", "inbox/drawing.png");
  session.run();
  assert.deepEqual(backendOrder(), ["message:user", "continue"]);
  // While it answers: the picture and the run wait for its end, then go in that order
  sent = [];
  nested({ type: "response.created", response: { id: "r1" } });
  session.picture("data:image/jpeg;base64,CCCC", "inbox/drawing-2.png");
  session.run();
  assert.deepEqual(backendOrder(), []);
  nested({ type: "response.completed", response: { id: "r1", output: [] } });
  await tick();
  assert.deepEqual(backendOrder(), ["message:user", "continue"]);
  // While it waits on its tools: it goes on with the picture itself, and nothing more is asked
  sent = [];
  nested({ type: "response.created", response: { id: "r2" } });
  functionCall("a");
  nested({ type: "response.completed", response: { id: "r2", output: [] } });
  await tick();
  session.picture("data:image/jpeg;base64,DDDD", "inbox/drawing-3.png");
  session.run();
  assert.deepEqual(backendOrder(), []);
  pending.get("a")?.("done");
  await tick();
  assert.deepEqual(backendOrder(), [
    "function_call_output:a",
    "message:user",
    "continue",
  ]);
});

test("what is put down or run after a turn is asked for and before it starts waits for that turn, and runs once after it", async () => {
  const pending = new Map<string, (value: string) => void>();
  const { session } = await connect({
    runTool: (call) => new Promise((resolve) => pending.set(call.id, resolve)),
  });
  nested({ type: "response.created", response: { id: "r1" } });
  functionCall("a");
  nested({ type: "response.completed", response: { id: "r1", output: [] } });
  await tick();
  pending.get("a")?.("done");
  await tick();
  assert.deepEqual(backendOrder(), ["function_call_output:a", "continue"]);
  // Asked to go on, not yet started: a second run here met the first
  sent = [];
  session.picture("data:image/jpeg;base64,BBBB", "inbox/drawing.png");
  session.run();
  assert.deepEqual(backendOrder(), []);
  nested({ type: "response.created", response: { id: "r2" } });
  assert.deepEqual(backendOrder(), []);
  nested({ type: "response.completed", response: { id: "r2", output: [] } });
  await tick();
  assert.deepEqual(backendOrder(), ["message:user", "continue"]);
  // The voice handing over is a turn asked for the same way
  nested({ type: "response.created", response: { id: "r3" } });
  nested({ type: "response.completed", response: { id: "r3", output: [] } });
  await tick();
  sent = [];
  wire.on.event({ type: "session.delegation.created" });
  session.picture("data:image/jpeg;base64,CCCC", "inbox/drawing-2.png");
  session.run();
  assert.deepEqual(backendOrder(), []);
  nested({ type: "response.created", response: { id: "r4" } });
  nested({ type: "response.completed", response: { id: "r4", output: [] } });
  await tick();
  assert.deepEqual(backendOrder(), ["message:user", "continue"]);
});

test("a turn asked for that never starts leaves what waited on it to go in, and the run, once the gap is past", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const { session } = await connect();
  wire.on.event({ type: "session.delegation.created" });
  session.picture("data:image/jpeg;base64,BBBB", "inbox/drawing.png");
  session.run();
  assert.deepEqual(backendOrder(), []);
  // well past the gap a response.create is still counted as work for
  context.mock.timers.tick(60_000);
  assert.deepEqual(backendOrder(), ["message:user", "continue"]);
});

test("a picture put down that the connection will not carry is said by its path, to the backend and the user", async () => {
  refuses = (event) => JSON.stringify(event).includes('"type":"input_image"');
  const { session, warnings } = await connect();
  session.picture("data:image/jpeg;base64,BBBB", "inbox/photo.png");
  assert.deepEqual(backendOrder(), ["message:developer"]);
  const note = (sent.at(-1)?.item as { content: { text: string }[] }).content[0]
    .text;
  assert.match(
    note,
    /picture of inbox\/photo\.png did not go through.*Message too large/,
  );
  assert.match(warnings.at(-1) ?? "", /inbox\/photo\.png did not go through/);
});

test("a picture held behind a tool turn that the connection will not carry is said by its path, to the backend and the user, and the turn still goes on", async () => {
  refuses = (event) => JSON.stringify(event).includes('"type":"input_image"');
  const pending = new Map<string, (value: string) => void>();
  const { session, warnings } = await connect({
    runTool: (call) => new Promise((resolve) => pending.set(call.id, resolve)),
  });
  nested({ type: "response.created", response: { id: "r1" } });
  functionCall("a");
  nested({ type: "response.completed", response: { id: "r1", output: [] } });
  await tick();
  session.picture("data:image/jpeg;base64,AAAA", "inbox/photo.png");
  assert.deepEqual(backendOrder(), []);
  pending.get("a")?.("done");
  await tick();
  // Refused as it is let go: said in its place, and the turn goes on after it
  assert.deepEqual(backendOrder(), [
    "function_call_output:a",
    "message:developer",
    "continue",
  ]);
  const note = (
    sent.find(
      (event) =>
        (event.item as { role?: string } | undefined)?.role === "developer",
    )?.item as { content: { text: string }[] }
  ).content[0].text;
  assert.match(
    note,
    /picture of inbox\/photo\.png did not go through.*Message too large/,
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /inbox\/photo\.png did not go through/);
});

test("a tool result the connection will not carry is answered in its place, and the turn still goes on", async () => {
  const long = "x".repeat(5_000);
  refuses = (event) => JSON.stringify(event).includes(long);
  await connect({ runTool: async () => long });
  nested({ type: "response.created", response: { id: "r1" } });
  functionCall("a");
  nested({ type: "response.completed", response: { id: "r1", output: [] } });
  await tick();
  // The call has its output, and the backend is asked to go on from it
  assert.deepEqual(backendOrder(), ["function_call_output:a", "continue"]);
  const answered = sent.find((event) => event.type === "response.item.create")
    ?.item as { output: string };
  assert.match(
    answered.output,
    /^Error: the result was too large to return \(5,000 characters: Message too large\)/,
  );
});

test("a fact put down while the backend waits on its tools goes in after their outputs, in order with the picture it names", async () => {
  const pending = new Map<string, (value: string) => void>();
  const { session } = await connect({
    runTool: (call) => new Promise((resolve) => pending.set(call.id, resolve)),
  });
  nested({ type: "response.created", response: { id: "r1" } });
  functionCall("a");
  nested({ type: "response.completed", response: { id: "r1", output: [] } });
  await tick();
  session.brief("The user put a file down, kept at inbox/photo.png.");
  session.picture("data:image/jpeg;base64,BBBB", "inbox/photo.png");
  assert.deepEqual(backendOrder(), []);
  pending.get("a")?.("done");
  await tick();
  assert.deepEqual(backendOrder(), [
    "function_call_output:a",
    "message:developer",
    "message:user",
    "continue",
  ]);
});

test("a turn heard from again after an error took it for ended holds what is put down until its outputs are in", async () => {
  const pending = new Map<string, (value: string) => void>();
  const { session } = await connect({
    runTool: (call) => new Promise((resolve) => pending.set(call.id, resolve)),
  });
  nested({ type: "response.created", response: { id: "r1" } });
  wire.on.event({ type: "error", error: { message: "Handoff ended." } });
  await tick();
  // It goes on after all, and asks for a tool
  functionCall("a");
  await tick();
  session.picture("data:image/jpeg;base64,BBBB", "inbox/photo.png");
  assert.deepEqual(backendOrder(), []);
  nested({ type: "response.completed", response: { id: "r1", output: [] } });
  pending.get("a")?.("done");
  await tick();
  assert.deepEqual(backendOrder(), [
    "function_call_output:a",
    "message:user",
    "continue",
  ]);
});

test("what waited on a turn an error cut off after its tools ran goes in with the next turn", async () => {
  const { session } = await connect({ runTool: async () => "done" });
  nested({ type: "response.created", response: { id: "r1" } });
  functionCall("a");
  await tick();
  // Its handoff ends on an error, with no end named for it: it is left waiting
  wire.on.event({ type: "error", error: { message: "Handoff ended." } });
  session.picture("data:image/jpeg;base64,BBBB", "inbox/photo.png");
  assert.deepEqual(backendOrder(), ["function_call_output:a"]);
  // The next hand-over is a new turn: the picture waits on it, and goes in as it ends
  nested({ type: "response.created", response: { id: "r2" } });
  nested({ type: "response.completed", response: { id: "r2", output: [] } });
  await tick();
  assert.deepEqual(backendOrder(), ["function_call_output:a", "message:user"]);
  // Nothing waits any more: the next goes in at once
  session.picture("data:image/jpeg;base64,CCCC", "inbox/two.png");
  assert.deepEqual(backendOrder(), [
    "function_call_output:a",
    "message:user",
    "message:user",
  ]);
});

test("an incomplete response that asked for tools is continued once, and a second in a row only warns", async () => {
  const { warnings } = await connect();
  nested({ type: "response.created", response: { id: "r1" } });
  functionCall("a");
  nested({ type: "response.incomplete", response: { id: "r1" } });
  await tick();
  assert.equal(count("response.item.create"), 1);
  assert.equal(count("response.create"), 1);
  assert.equal(warnings.length, 0);
  // The continuation runs out again: its output still goes in, and nothing continues it
  nested({ type: "response.created", response: { id: "r2" } });
  functionCall("b");
  nested({ type: "response.incomplete", response: { id: "r2" } });
  await tick();
  assert.equal(count("response.item.create"), 2);
  assert.equal(count("response.create"), 1);
  assert.equal(warnings.length, 1);
  // A failed response is never continued
  nested({ type: "response.created", response: { id: "r3" } });
  functionCall("c");
  nested({ type: "response.failed", response: { id: "r3" } });
  await tick();
  assert.equal(count("response.item.create"), 3);
  assert.equal(count("response.create"), 1);
});

test("a call completed before one the output cap cut off still has its result continued", async () => {
  let ran = 0;
  await connect({
    runTool: async () => {
      ran += 1;
      return "ok";
    },
  });
  nested({ type: "response.created", response: { id: "r1" } });
  functionCall("a");
  nested({
    type: "response.output_item.done",
    item: {
      type: "function_call",
      id: "item-cut",
      call_id: "cut",
      name: "thread_start",
      arguments: '{"bot":"Ana',
      status: "incomplete",
    },
  });
  await tick();
  await tick();
  assert.equal(ran, 1);
  assert.equal(count("response.item.create"), 1);
  assert.equal(count("response.create"), 1);
  // The continuation is cut off the same way: its result goes in, nothing continues it
  nested({ type: "response.created", response: { id: "r2" } });
  functionCall("b");
  nested({
    type: "response.output_item.done",
    item: {
      type: "function_call",
      id: "item-cut-again",
      call_id: "cut-again",
      name: "thread_start",
      arguments: '{"bot":"Ana',
      status: "incomplete",
    },
  });
  await tick();
  await tick();
  assert.equal(ran, 2);
  assert.equal(count("response.item.create"), 2);
  assert.equal(count("response.create"), 1);
});

test("a turn cut off after two in a row were is continued once, as the first was", async () => {
  await connect();
  const cutOff = (call_id: string) =>
    nested({
      type: "response.output_item.done",
      item: {
        type: "function_call",
        id: `item-${call_id}`,
        call_id,
        name: "thread_start",
        arguments: '{"bot":"Ana',
        status: "incomplete",
      },
    });
  nested({ type: "response.created", response: { id: "r1" } });
  functionCall("a");
  cutOff("cut-1");
  await tick();
  await tick();
  nested({ type: "response.created", response: { id: "r2" } });
  functionCall("b");
  cutOff("cut-2");
  await tick();
  await tick();
  assert.equal(count("response.create"), 1);
  // The next turn cut off the same way: the bound is once in a row, so it is continued again,
  // or its result goes in and nothing answers the hand-over
  nested({ type: "response.created", response: { id: "r3" } });
  functionCall("c");
  cutOff("cut-3");
  await tick();
  await tick();
  assert.equal(count("response.item.create"), 3);
  assert.equal(count("response.create"), 2);
});

/** What the page puts down for a drawing shown to her: its fact, the picture, then the run (put-down). */
function showDrawing(session: ReturnType<typeof createLiveSession>) {
  session.brief("The user showed you a drawing, kept at inbox/drawing.png.");
  session.picture("data:image/png;base64,AAAA", "inbox/drawing.png");
  session.run();
}

for (const end of ["response.failed", "response.cancelled"]) {
  test(`a ${end.slice(9)} turn whose tools still run holds what is put down until every output is in, then sends it and the run`, async () => {
    const pending = new Map<string, (value: string) => void>();
    const { session } = await connect({
      runTool: (call) =>
        new Promise((resolve) => pending.set(call.id, resolve)),
    });
    nested({ type: "response.created", response: { id: "r1" } });
    functionCall("a");
    functionCall("b");
    await tick();
    showDrawing(session);
    assert.deepEqual(backendOrder(), []);
    nested({ type: end, response: { id: "r1" } });
    await tick();
    assert.deepEqual(backendOrder(), []);
    // The turn is over and its tools are not: what is put down now waits on them too
    session.brief("The user put a file down, kept at inbox/photo.png.");
    assert.deepEqual(backendOrder(), []);
    // The one called last finishes first: what waits does not go in on that output
    pending.get("b")?.("done");
    await tick();
    assert.deepEqual(backendOrder(), ["function_call_output:b"]);
    pending.get("a")?.("done");
    await tick();
    assert.deepEqual(backendOrder(), [
      "function_call_output:b",
      "function_call_output:a",
      "message:developer",
      "message:user",
      "message:developer",
      "continue",
    ]);
  });
}

test("a second incomplete turn in a row, its tool still running, holds what is put down and the run until that output is in", async () => {
  const pending = new Map<string, (value: string) => void>();
  const { session, warnings } = await connect({
    runTool: (call) => new Promise((resolve) => pending.set(call.id, resolve)),
  });
  // The first is continued once, after its tool's output
  nested({ type: "response.created", response: { id: "r1" } });
  functionCall("a");
  nested({ type: "response.incomplete", response: { id: "r1" } });
  await tick();
  pending.get("a")?.("done");
  await tick();
  assert.deepEqual(backendOrder(), ["function_call_output:a", "continue"]);
  sent = [];
  // The one after it runs out again, and its tool has not finished
  nested({ type: "response.created", response: { id: "r2" } });
  functionCall("b");
  await tick();
  showDrawing(session);
  nested({ type: "response.incomplete", response: { id: "r2" } });
  await tick();
  assert.deepEqual(backendOrder(), []);
  pending.get("b")?.("done");
  await tick();
  assert.deepEqual(backendOrder(), [
    "function_call_output:b",
    "message:developer",
    "message:user",
    "continue",
  ]);
  assert.equal(warnings.length, 1);
});

test("a call cut off after one was continued, another call of its turn still running, holds what is put down and the run until that output is in", async () => {
  const pending = new Map<string, (value: string) => void>();
  const { session } = await connect({
    runTool: (call) => new Promise((resolve) => pending.set(call.id, resolve)),
  });
  nested({ type: "response.created", response: { id: "r1" } });
  functionCall("a");
  functionCall("cut", "incomplete");
  await tick();
  pending.get("a")?.("done");
  await tick();
  assert.deepEqual(backendOrder(), ["function_call_output:a", "continue"]);
  sent = [];
  // Cut off again, once one was continued: not continued, and its other call still runs
  nested({ type: "response.created", response: { id: "r2" } });
  functionCall("b");
  await tick();
  showDrawing(session);
  functionCall("cut-again", "incomplete");
  await tick();
  assert.deepEqual(backendOrder(), []);
  pending.get("b")?.("done");
  await tick();
  assert.deepEqual(backendOrder(), [
    "function_call_output:b",
    "message:developer",
    "message:user",
    "continue",
  ]);
});

test("a turn that ended while its tool ran sends nothing once the call is closing", async () => {
  const pending = new Map<string, (value: string) => void>();
  const { session } = await connect({
    runTool: (call) => new Promise((resolve) => pending.set(call.id, resolve)),
  });
  nested({ type: "response.created", response: { id: "r1" } });
  functionCall("a");
  await tick();
  showDrawing(session);
  nested({ type: "response.failed", response: { id: "r1" } });
  const closing = session.close();
  pending.get("a")?.("done");
  await tick();
  assert.deepEqual(backendOrder(), []);
  wire.on.event({
    type: "session.closed",
    reason: "close_requested",
    usage: { seconds: 1 },
  });
  await closing;
});

test("a finished reasoning summary part is reported once, whole, with its place in the call", async () => {
  const { reasonings } = await connect();
  nested({ type: "response.created", response: { id: "r1" } });
  const part = (event: Record<string, unknown>) =>
    nested({ item_id: "rs_1", output_index: 0, ...event });
  part({
    type: "response.reasoning_summary_text.delta",
    summary_index: 0,
    delta: "**Comparing",
  });
  part({
    type: "response.reasoning_summary_text.done",
    summary_index: 0,
    text: "**Comparing markets**\n\nRates first.",
  });
  part({
    type: "response.reasoning_summary_text.done",
    summary_index: 1,
    text: "**Handing over**",
  });
  await tick();
  assert.deepEqual(
    reasonings.map(({ id, text }) => [id, text]),
    [
      ["rs_1:0", "**Comparing markets**\n\nRates first."],
      ["rs_1:1", "**Handing over**"],
    ],
  );
  assert.ok(reasonings.every((part) => part.seq >= 0));
});

test("the backend's own web search is reported as it starts and ends, with the pages it and the answer name", async () => {
  const { searches, citations, turns } = await connect();
  nested({ type: "response.created", response: { id: "r1" } });
  nested({
    type: "response.output_item.added",
    item: {
      type: "web_search_call",
      id: "ws_1",
      status: "in_progress",
      action: { type: "search", query: " tokyo weather tomorrow " },
    },
  });
  nested({
    type: "response.output_item.done",
    item: {
      type: "web_search_call",
      id: "ws_1",
      status: "completed",
      action: {
        type: "search",
        query: "tokyo weather tomorrow",
        sources: [
          { type: "url", url: "https://tenki.jp/a" },
          { type: "url", url: "https://tenki.jp/a" },
        ],
      },
    },
  });
  nested({
    type: "response.output_item.done",
    item: {
      type: "message",
      id: "msg_1",
      content: [
        {
          type: "output_text",
          text: "Rain from the afternoon.",
          annotations: [
            { type: "url_citation", url: "https://tenki.jp/a", title: "Tokyo" },
            { type: "url_citation", url: "https://jma.go.jp/b", title: "JMA" },
            { type: "url_citation", url: "https://jma.go.jp/b", title: "JMA" },
          ],
        },
      ],
    },
  });
  await tick();
  assert.deepEqual(
    searches.map((search) => [
      search.id,
      search.responseId,
      search.query,
      search.done,
      search.sources.map((source) => source.url),
    ]),
    [
      ["ws_1", "r1", "tokyo weather tomorrow", false, []],
      ["ws_1", "r1", "tokyo weather tomorrow", true, ["https://tenki.jp/a"]],
    ],
  );
  assert.deepEqual(citations, [
    [
      "r1",
      [
        { url: "https://tenki.jp/a", title: "Tokyo" },
        { url: "https://jma.go.jp/b", title: "JMA" },
      ],
    ],
  ]);
  // A search action may list its queries instead of naming one
  nested({
    type: "response.output_item.added",
    item: {
      type: "web_search_call",
      id: "ws_2",
      action: { type: "search", queries: ["tokyo rain", "tokyo umbrella"] },
    },
  });
  await tick();
  assert.equal(searches.at(-1)?.query, "tokyo rain · tokyo umbrella");
  // The search is the backend's own: nothing is run, sent back or saved by the seam
  assert.equal(count("response.item.create"), 0);
  assert.equal(turns.filter((turn) => turn.role === "tool").length, 0);
});

test("a function call cut off by the output cap is never run, and its response stops counting as work", async () => {
  let ran = 0;
  const { activities, turns } = await connect({
    runTool: async () => {
      ran += 1;
      return "ok";
    },
  });
  nested({ type: "response.created", response: { id: "r1" } });
  await tick();
  assert.equal(activities.at(-1)?.working, true);
  nested({
    type: "response.output_item.done",
    item: {
      type: "function_call",
      id: "item-cut",
      call_id: "cut",
      name: "thread_start",
      arguments: '{"bot":"Analyst',
      status: "incomplete",
    },
  });
  // What Live sends instead of a terminal event for that response
  wire.on.event({
    type: "error",
    error: { message: "Responses handoff incomplete." },
  });
  await tick();
  assert.equal(ran, 0);
  assert.equal(turns.filter((turn) => turn.role === "tool").length, 0);
  assert.equal(count("response.item.create"), 0);
  assert.equal(count("response.create"), 0);
  assert.equal(activities.at(-1)?.working, false);
});

test("captions keep exact fragments through overlap and late delivery, and never show backend text", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const { session, turns } = await connect();
  const fragment = (
    type: string,
    id: string,
    start: number,
    end: number,
    delta: string,
  ) =>
    wire.on.event({ type, event_id: id, start_ms: start, end_ms: end, delta });
  fragment("session.input_transcript.delta", "u1", 100, 200, "Please ");
  fragment("session.output_transcript.delta", "a1", 150, 250, "Sure.");
  fragment("session.input_transcript.delta", "u3", 400, 500, "it.");
  fragment("session.input_transcript.delta", "u2", 250, 350, "find ");
  fragment("session.input_transcript.delta", "u2", 250, 350, "find ");
  nested({ type: "response.output_text.delta", delta: "private backend text" });
  context.mock.timers.tick(LIVE_CALL.transcriptSaveMs);

  const saved = turns.filter((turn) => turn.done);
  assert.deepEqual(
    saved.map((turn) => turn.text),
    ["Please find it.", "Sure."],
  );
  assert.equal(saved[0].seq, 100);
  assert.equal(saved[1].seq, 150);
  assert.deepEqual(saved[0].fragments, [
    { start: 100, end: 200, text: "Please " },
    { start: 250, end: 350, text: "find " },
    { start: 400, end: 500, text: "it." },
  ]);

  // A fragment after the checkpoint revises the same group, originals included
  fragment("session.input_transcript.delta", "u4", 520, 600, " Now.");
  context.mock.timers.tick(LIVE_CALL.transcriptSaveMs);
  const revised = turns
    .filter((turn) => turn.done && turn.id === saved[0].id)
    .at(-1);
  assert.equal(revised?.text, "Please find it. Now.");
  assert.equal(revised?.fragments?.length, 4);
  assert.equal(
    turns.some((turn) => turn.text.includes("private backend text")),
    false,
  );

  const close = session.close();
  assert.equal(released, false);
  wire.on.event({
    type: "session.closed",
    reason: "close_requested",
    usage: { seconds: 12 },
  });
  await close;
  assert.equal(released, true);
});

test("her answer after their words is a turn of its own, however soon it follows her last one", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const { turns } = await connect();
  const fragment = (
    type: string,
    id: string,
    start: number,
    end: number,
    delta: string,
  ) =>
    wire.on.event({ type, event_id: id, start_ms: start, end_ms: end, delta });
  fragment("session.output_transcript.delta", "a1", 0, 900, "Morning.");
  fragment("session.input_transcript.delta", "u1", 1000, 1600, "Book it.");
  // within the grouping gap of her first words, but after theirs
  fragment("session.output_transcript.delta", "a2", 1800, 2400, "Done.");
  context.mock.timers.tick(LIVE_CALL.transcriptSaveMs);

  const saved = turns.filter((turn) => turn.done);
  assert.deepEqual(
    saved.map((turn) => [turn.role, turn.text]),
    [
      ["assistant", "Morning."],
      ["user", "Book it."],
      ["assistant", "Done."],
    ],
  );
});

test("closing never starts a late tool", async () => {
  let executed = 0;
  const { session, failures } = await connect({
    runTool: async () => {
      executed++;
      return "ok";
    },
  });
  const closing = session.close();
  nested({ type: "response.created", response: { id: "r" } });
  functionCall("late");
  wire.on.event({ type: "session.closed", reason: "close_requested" });
  await closing;
  assert.equal(executed, 0);
  assert.equal(failures.length, 0);
});

test("closing waits for session.closed and reports the reason and billed seconds", async () => {
  const { session, closes, failures } = await connect();
  hushed = false;
  const closing = session.close();
  assert.equal(sent.at(-1)?.type, "session.close");
  // The microphone stops at the press; the line stays up for the confirmation
  assert.equal(hushed, true);
  assert.equal(released, false);
  wire.on.event({
    type: "session.closed",
    reason: "close_requested",
    usage: { seconds: 42 },
  });
  await closing;
  assert.deepEqual(closes, [{ reason: "close_requested", seconds: 42 }]);
  assert.equal(failures.length, 0);
  assert.equal(released, true);
});

test("a session the provider closes fails the call and still reports usage", async () => {
  const { closes, failures } = await connect();
  wire.on.event({ type: "session.closed", reason: "idle_timeout" });
  assert.deepEqual(closes, [{ reason: "idle_timeout", seconds: null }]);
  assert.match(failures[0], /idle_timeout/);
  assert.equal(released, true);
});

test("a close with no confirmation times out, says so, and releases media", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { session, warnings, closes } = await connect();
  const closing = session.close();
  context.mock.timers.tick(LIVE_CALL.closeMs);
  await closing;
  assert.equal(released, true);
  assert.equal(closes.length, 0);
  assert.match(warnings[0], /final session usage/);
});

test("activity keeps reporting while she speaks, and names the tools while they run", async (context) => {
  context.mock.timers.enable({ apis: ["setInterval"] });
  const pending: ((value: string) => void)[] = [];
  const { activities, levels } = await connect({
    runTool: () => new Promise((resolve) => pending.push(resolve)),
  });
  levels.output = 0.2;
  const before = activities.length;
  context.mock.timers.tick(100);
  context.mock.timers.tick(100);
  context.mock.timers.tick(100);
  assert.ok(
    activities.slice(before).filter((activity) => activity.speaking).length >=
      3,
  );

  nested({ type: "response.created", response: { id: "r1" } });
  functionCall("a");
  await tick();
  assert.equal(activities.at(-1)?.working, true);
  assert.deepEqual(activities.at(-1)?.tools, ["lookup"]);
  pending[0]("done");
  await tick();
});

test("updates go out one at a time by kind, settle on their own acknowledgement, and are never replayed", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const { session, warnings } = await connect();
  const first = session.append("instructions", "Greet the user.");
  const second = session.append("commentary", "Scout found three flights.");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "session.instructions.append");
  assert.equal(sent[0].delegation_id, null);
  assert.equal(sent[0].content, "Greet the user.");

  context.mock.timers.tick(LIVE_CALL.appendMs);
  assert.equal(await first, false);
  assert.match(warnings[0], /delivery is unknown/);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].type, "session.commentary.append");

  // A late acknowledgement for the first sends nothing more
  wire.on.event({
    type: "session.instructions.appended",
    client_event_id: sent[0].event_id,
  });
  assert.equal(sent.length, 2);
  wire.on.event({
    type: "session.commentary.appended",
    client_event_id: sent[1].event_id,
  });
  assert.equal(await second, true);
  assert.equal(sent.length, 2);
});

const herWords = (delta: string, start_ms: number) =>
  wire.on.event({
    type: "session.output_transcript.delta",
    delta,
    start_ms,
    end_ms: start_ms + 200,
  });

test("the caller's input is held off for her opening and let go at her first words, once", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const { session } = await connect();
  session.holdInput(LIVE_CALL.openingHoldMs);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "session.input_audio.mute");

  herWords("Hey", 0);
  herWords(" there", 200);
  assert.equal(count("session.input_audio.unmute"), 1);
  wire.on.event({
    type: "session.input_audio.unmuted",
    client_event_id: sent.find(
      (event) => event.type === "session.input_audio.unmute",
    )?.event_id,
  });
  // The hold's own clock was stopped with it
  context.mock.timers.tick(LIVE_CALL.openingHoldMs);
  assert.equal(count("session.input_audio.unmute"), 1);
});

test("a hold she never speaks into runs out by itself", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const { session } = await connect();
  session.holdInput(LIVE_CALL.openingHoldMs);
  context.mock.timers.tick(LIVE_CALL.openingHoldMs - 1);
  assert.equal(count("session.input_audio.unmute"), 0);
  context.mock.timers.tick(1);
  assert.equal(count("session.input_audio.unmute"), 1);
});

test("a mute Live refuses left the input open: nothing is unmuted after it", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const { session, failures } = await connect();
  session.holdInput(LIVE_CALL.openingHoldMs);
  wire.on.event({
    type: "error",
    error: { message: "Not allowed.", client_event_id: sent[0].event_id },
  });
  context.mock.timers.tick(LIVE_CALL.openingHoldMs);
  herWords("Hey", 0);
  assert.equal(count("session.input_audio.unmute"), 0);
  assert.deepEqual(failures, []);
});

test("an unmute Live refuses ends the call with why, rather than going on deaf to the caller", async () => {
  const { session, failures } = await connect();
  session.holdInput(LIVE_CALL.openingHoldMs);
  herWords("Hey", 0);
  wire.on.event({
    type: "error",
    error: {
      message: "Not allowed.",
      client_event_id: sent.find(
        (event) => event.type === "session.input_audio.unmute",
      )?.event_id,
    },
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /could not hear the microphone again/);
});

test("a fact for the backend alone goes as an item of its own: no append the voice would read, and no turn started", async () => {
  const { session } = await connect();
  session.brief(
    '  [The threads as this call opened.]\n- "Flights" (t1) — Scout — done  ',
  );
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "response.item.create");
  assert.deepEqual(sent[0].item, {
    type: "message",
    role: "developer",
    content: [
      {
        type: "input_text",
        text: '[The threads as this call opened.]\n- "Flights" (t1) — Scout — done',
      },
    ],
  });
  // Nothing to say is nothing sent
  session.brief("   ");
  assert.equal(sent.length, 1);
});

test("a long update goes chunk by chunk, and a rejected chunk drops the rest of it", async () => {
  const { session, warnings } = await connect();
  const long = "word ".repeat(200);
  const whole = session.append("commentary", long);
  const parts: string[] = [];
  while (sent.length > parts.length) {
    const chunk = sent[parts.length];
    parts.push(String(chunk.content));
    wire.on.event({
      type: "session.commentary.appended",
      client_event_id: chunk.event_id,
    });
  }
  assert.equal(await whole, true);
  assert.ok(parts.length > 1);
  assert.equal(parts.join(""), long);

  const before = sent.length;
  const rejected = session.append("commentary", long);
  wire.on.event({
    type: "error",
    error: {
      message: "Update refused",
      client_event_id: sent[before].event_id,
    },
  });
  assert.equal(await rejected, false);
  assert.equal(sent.length, before + 1);
  assert.match(warnings.at(-1) ?? "", /Update refused/);

  const next = session.append(
    "thinking",
    "The user stopped a thread on screen.",
  );
  assert.equal(sent.at(-1)?.type, "session.thinking.append");
  wire.on.event({
    type: "session.thinking.appended",
    client_event_id: sent.at(-1)?.event_id,
  });
  assert.equal(await next, true);
});

test("update chunks stay within the byte bound for any script and keep words whole", () => {
  const encoder = new TextEncoder();
  // Three UTF-8 bytes each, with spaces between words
  const symbols = "\u2600\u2601\u2602\u2603 ".repeat(80);
  const emoji = "🙂".repeat(300);
  const english = "The flight leaves at nine. ".repeat(60);
  for (const text of [symbols, emoji, english]) {
    const chunks = appendChunks(text);
    assert.ok(chunks.length > 1);
    assert.equal(chunks.join(""), text);
    for (const chunk of chunks) assert.ok(encoder.encode(chunk).length <= 480);
  }
  for (const chunk of appendChunks(english).slice(0, -1)) {
    assert.match(chunk, /\s$/);
  }
  assert.deepEqual(appendChunks(""), []);
});

const backend = (overrides: Record<string, unknown> = {}) => ({
  model: "gpt-5.6-luna",
  instructions: "Tools only",
  tools: [
    {
      name: "lookup",
      description: "Look up an item",
      parameters: { type: "object" as const, properties: {} },
    },
  ],
  reasoning: null,
  hosted: [],
  ...overrides,
});

function captureFetch() {
  const requests: Record<string, any>[] = [];
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.openai.com/v1/live/sessions");
    requests.push(JSON.parse(init.body as string));
    return Response.json(
      {
        session: { id: "live-example" },
        transport: { type: "webrtc", sdp: "answer" },
      },
      { status: 201 },
    );
  });
  return requests;
}

test("startup sends voice and backend apart, seeds no history, and keeps the key on the server", async () => {
  const requests = captureFetch();
  const connection = await createLiveCall({
    apiKey: "test-key",
    sdp: "offer",
    voice: "marin",
    instructions: "Conversation only",
    backend: backend(),
  });
  const [request] = requests;
  assert.equal(request.session.model, "gpt-live-1");
  assert.equal(request.session.instructions, "Conversation only");
  // Earlier calls are the backend's to read; the voice opens on nothing but its instructions
  assert.equal("input" in request.session, false);
  assert.equal(request.session.audio.output.voice, "marin");
  assert.equal(request.session.store, false);
  assert.equal(request.session.delegation.type, "responses");
  const responses = request.session.delegation.responses;
  assert.equal(responses.model, "gpt-5.6-luna");
  assert.equal(responses.instructions, "Tools only");
  assert.equal(responses.tools.length, 1);
  assert.equal("strict" in responses.tools[0], false);
  assert.equal("reasoning" in responses, false);
  assert.equal(
    responses.tools.some(
      (tool: { type: string }) => tool.type === "web_search",
    ),
    false,
  );
  assert.equal(JSON.stringify(connection).includes("test-key"), false);
});

test("reasoning and web search are sent only when given", async () => {
  const requests = captureFetch();
  await createLiveCall({
    apiKey: "test-key",
    sdp: "offer",
    voice: "cedar",
    instructions: "Talk",
    backend: backend({
      model: "gpt-4.1",
      reasoning: { effort: "low", summary: "auto" },
      hosted: ["webSearch"],
    }),
  });
  const responses = requests[0].session.delegation.responses;
  assert.equal(responses.model, "gpt-4.1");
  assert.deepEqual(responses.reasoning, { effort: "low", summary: "auto" });
  assert.deepEqual(responses.tools.at(-1), { type: "web_search" });
});

test("a provider refusal reaches the caller unchanged", async () => {
  mock.method(globalThis, "fetch", async () =>
    Response.json(
      { error: { message: "This project cannot access gpt-live-1" } },
      { status: 403 },
    ),
  );
  await assert.rejects(
    createLiveCall({
      apiKey: "test",
      sdp: "offer",
      voice: "marin",
      instructions: "Talk",
      backend: backend(),
    }),
    /This project cannot access gpt-live-1/,
  );
});

/** A token-count endpoint whose models refuse the reasoning settings they are given. */
function refusingFetch(refuses: Record<string, string[]>) {
  const asked: string[] = [];
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.openai.com/v1/responses/input_tokens");
    const body = JSON.parse(init.body as string);
    asked.push(`${body.model} ${JSON.stringify(body.reasoning)}`);
    const refused = (refuses[body.model] ?? []).find(
      (setting) => setting in body.reasoning,
    );
    return refused
      ? Response.json(
          {
            error: {
              message: `Unsupported parameter: 'reasoning.${refused}' is not supported with this model.`,
              param: `reasoning.${refused}`,
              code: "unsupported_parameter",
            },
          },
          { status: 400 },
        )
      : Response.json({ input_tokens: 7 });
  });
  return asked;
}

test("a reasoning setting the backend model refuses is dropped before the call, and the answer is kept", async () => {
  const asked = refusingFetch({ "gpt-4.1": ["effort"], legacy: ["summary"] });
  const check = (model: string, effort: string | null) =>
    acceptedReasoning({ apiKey: "test", model, effort });

  assert.deepEqual(await check("gpt-4.1", "low"), { summary: "auto" });
  assert.deepEqual(await check("gpt-4.1", "low"), { summary: "auto" });
  assert.deepEqual(await check("gpt-5.6-luna", "low"), {
    effort: "low",
    summary: "auto",
  });
  assert.deepEqual(await check("gpt-5.6-luna", null), { summary: "auto" });
  assert.equal(await check("gpt-4.1", "none"), null);
  assert.deepEqual(await check("legacy", "high"), { effort: "high" });
  assert.deepEqual(asked, [
    'gpt-4.1 {"effort":"low","summary":"auto"}',
    'gpt-4.1 {"summary":"auto"}',
    'gpt-5.6-luna {"effort":"low","summary":"auto"}',
    'gpt-5.6-luna {"summary":"auto"}',
    'gpt-4.1 {"effort":"none"}',
    'legacy {"effort":"high","summary":"auto"}',
    'legacy {"effort":"high"}',
  ]);
});

test("any other answer keeps the chosen settings and is asked again next call", async () => {
  let asked = 0;
  mock.method(globalThis, "fetch", async () => {
    asked += 1;
    return asked === 1
      ? Response.json(
          { error: { message: "Incorrect API key provided", param: null } },
          { status: 401 },
        )
      : Promise.reject(new TypeError("fetch failed"));
  });
  const check = () =>
    acceptedReasoning({ apiKey: "test", model: "gpt-5.6-sol", effort: "high" });

  assert.deepEqual(await check(), { effort: "high", summary: "auto" });
  assert.deepEqual(await check(), { effort: "high", summary: "auto" });
  assert.equal(asked, 2);
});

test("stored settings keep OpenAI choices and the shared instruction, drop a Grok voice, and recover field by field", async () => {
  const { LIVE_DEFAULTS, migrateLiveSettings } = await import(
    "../features/ai/live.schema.ts"
  );
  const openai = migrateLiveSettings({
    model: {
      provider: "openai",
      voice: "cedar",
      model: "gpt-live-1",
      backendModel: "gpt-5.6-sol",
    },
    systemPrompt: "Call me Sam.",
    captionView: "sides",
  });
  assert.equal(openai.voice, "cedar");
  assert.equal(openai.backendModel, "gpt-5.6-sol");
  assert.equal(openai.stylePrompt, "Call me Sam.");
  assert.equal(openai.backendPrompt, "Call me Sam.");
  assert.equal(openai.captionView, "sides");
  assert.equal(openai.reasoningEffort, LIVE_DEFAULTS.reasoningEffort);
  // Nothing stored, so the default: on
  assert.equal(openai.webSearch, LIVE_DEFAULTS.webSearch);
  assert.equal(LIVE_DEFAULTS.webSearch, true);
  assert.equal("model" in openai, false);
  assert.equal("systemPrompt" in openai, false);

  // What `stylePrompt` was called while only the voice read it
  assert.equal(
    migrateLiveSettings({ voicePrompt: "Quieter." }).stylePrompt,
    "Quieter.",
  );

  const grok = migrateLiveSettings({
    model: { provider: "xai", voice: "Ara", model: "grok-voice" },
  });
  assert.equal(grok.voice, LIVE_DEFAULTS.voice);
  assert.equal(grok.backendModel, LIVE_DEFAULTS.backendModel);

  const broken = migrateLiveSettings({
    voice: 42,
    backendModel: "gpt-4.1",
    reasoningEffort: "extreme",
    webSearch: true,
  });
  assert.equal(broken.voice, LIVE_DEFAULTS.voice);
  assert.equal(broken.backendModel, "gpt-4.1");
  assert.equal(broken.reasoningEffort, LIVE_DEFAULTS.reasoningEffort);
  assert.equal(broken.webSearch, true);

  // A stored choice survives a change of default: auto stays auto
  assert.equal(
    migrateLiveSettings({ reasoningEffort: null }).reasoningEffort,
    null,
  );

  assert.deepEqual(migrateLiveSettings(null), LIVE_DEFAULTS);
});

test("both call prompts open as one Thursday: the voice gets the guide's delegation policy, memory and the last calls as reading, the backend carries work on in threads, and every call has an opening", async () => {
  let profileFacts = 200;
  let samFacts = 2;
  const botMock = mock.module("../features/bot/bot.query.ts", {
    namedExports: {
      listJobBots: async () => [
        { name: "Scout", description: "Finds things out on the web" },
      ],
      readBotMemoryOn: async () => true,
    },
  });
  const skillsMock = mock.module("../features/skills/skills.discover.ts", {
    namedExports: {
      loadSkills: async () => [
        { name: "browser", description: "Any browser.", path: "/browser" },
      ],
    },
  });
  const connectedMock = mock.module("../features/ai/tools/connected.ts", {
    namedExports: {
      listConnectedToolNames: async () => [
        { server: "studio", name: "generate_image" },
        { server: "github", name: "create_issue" },
      ],
    },
  });
  const workspaceMock = mock.module("../features/workspace/workspace.ts", {
    namedExports: { openWorkspace: async () => ({ cwd: "/workspace" }) },
  });
  const memoryMock = mock.module("../features/memory/memory.query.ts", {
    namedExports: {
      readNotes: async () => ({
        notes: [
          {
            path: "profile",
            description: "The user themselves",
            facts: Array.from({ length: profileFacts }, (_, index) => ({
              id: index + 1,
              text: index === 0 ? "Prefer brief replies." : `Fact ${index}`,
            })),
          },
        ],
      }),
      listNoteIndex: async () => [
        {
          path: "people/sam",
          description: "Their brother, Sam",
          factCount: samFacts,
          lastSeenAt: new Date(),
        },
      ],
    },
  });
  let spoken = true;
  const callMock = mock.module("../features/thursday/thursday.query.ts", {
    namedExports: {
      listRecentTurns: async () =>
        spoken
          ? [
              {
                callId: "c1",
                startedAt: new Date("2026-09-13T10:00:00Z"),
                turns: [
                  {
                    role: "user",
                    tool: null,
                    text: "Book the dentist.",
                    seq: 1,
                  },
                  {
                    role: "tool",
                    tool: "thread_start",
                    text: '{"bot":"Scout"}',
                    seq: 2,
                  },
                  {
                    role: "assistant",
                    tool: null,
                    text: "Scout has it.",
                    seq: 3,
                  },
                ],
              },
            ]
          : [],
      readCallSkillsOn: async () => false,
    },
  });
  const threadMock = mock.module("../features/bot/thread.query.ts", {
    namedExports: { listCallJobs: async () => [] },
  });
  try {
    const { loadLivePrompt } = await import(
      "../features/ai/prompts/live.prompt.ts"
    );
    const { loadThursdayPrompt } = await import(
      "../features/ai/prompts/thursday.prompt.ts"
    );
    const on = await loadLivePrompt({
      stylePrompt: "Use a calm voice.",
    });
    assert.match(on.text, /their friend first, and their assistant second/);
    assert.match(on.text, /Prefer brief replies/);
    assert.match(
      on.text,
      /\n\n## Always\n\nBackchannel policy: Use moderate backchannels\. .*\n\nInterruption policy: Stop speaking when the user interrupts\. Listen to what they say\.\n\nSpeak the language the user is speaking, [^\n]+\n\nDelegation policy:\nBackend tools:\n- Ending the call: hangs up the line — only the backend can, so a goodbye, or a hang-up they ask for, is handed over rather than answered\.\n(- [^\n]+\n){4}\nDelegate to the backend when:\n- They say goodbye or good night, in whatever words, or want the call to end\.\n(- [^\n]+\n)+\nDo not delegate to the backend when:\n- They say hello, [^\n]+\n(- [^\n]+\n)+\nDelegate before giving an answer that depends on backend work\. Do not guess the result while waiting\.\n\n## Your bots\n\nWho background work goes to:\n- Scout — Finds things out on the web\n\n## What you know about them\n/,
    );
    // Who she is to talk to sits right under the identity, character only: no stamp, no rule
    assert.match(
      on.text,
      /a name, not a day of the week\. \*\*Now\*\*: [^\n]+\n\nWhat they tell you is kept, [^\n]+\n\nWarm and quick to laugh, [^\n]+\n\nYou are their friend, not their interviewer: [^\n]+\n\n## Always\n/,
    );
    assert.equal(on.text.includes("IMPORTANT"), false);
    assert.match(
      on.text,
      /Backchannel policy: Use moderate backchannels\. Acknowledge naturally without competing with the main response\./,
    );
    // What the backend can do, never how: no skills or connected tools; the bots are named
    // only so she can ask which one takes work she talks through
    assert.equal(/What bots can reach for|- Web:/.test(on.text), false);
    assert.match(
      on.text,
      /- They want work a bot would do and have not said yes to your proposal for it, even when they name the bot: [^\n]+\n/,
    );
    // Stopping her voice is hers, stopping a job the backend's
    assert.match(on.text, /or only want you to stop talking/);
    assert.match(on.text, /- people\/sam — Their brother, Sam \(2\)/);
    assert.match(on.text, /What is in these notes, the backend recalls\./);
    // Profile and preferences are whole on both sides: the oldest line is the one
    // about how to speak to them, and a count in its place hid it first
    assert.match(on.text, /- Fact 199\n/);
    assert.equal(/more in this note|older not shown/.test(on.text), false);
    // What was said on earlier calls is hers to read, as reading under the past's own
    // heading: the spoken lines, each call under when it was, and never a tool line
    assert.match(
      on.text,
      /\n\n## Earlier calls\n\nWhat was said on the last calls, newest last, each under when it was\. They are over, and this call is a new one: [^\n]+\n\n### [^\n]+\nuser: Book the dentist\.\nyou: Scout has it\.\n\n## Who they want you to be\n/,
    );
    // The threads stay the backend's
    assert.equal(
      /thread|you → |\bseen\b|works beside you/.test(on.text),
      false,
    );
    assert.equal("input" in on, false);
    assert.equal(/memory_|generate_|load_skill|`/.test(on.text), false);
    // The voice holds no tool and hears no tool's name: ending the call is on the
    // delegation list like everything else the backend does
    assert.equal(on.text.includes("end_call"), false);
    assert.equal(on.text.endsWith("Use a calm voice."), true);
    assert.match(
      on.opening,
      /^The call has just started\. It is [^\n]+ for them\. Speak first: greet the user naturally, in one line\. You may pick up one thing from what you know about them — never a list, never work\.$/,
    );

    // Where they are sits beside the hour in both prompts, and the opening stays as it was
    const lisbon = {
      place: "Lisbon, Portugal",
      weather: {
        code: 3,
        temperature: 22.4,
        low: 20.6,
        high: 27.9,
        sunrise: "07:28",
        sunset: "19:25",
      },
    };
    const placed = await loadLivePrompt({ where: lisbon });
    const whereAt =
      /\*\*Now\*\*: [^\n]+\n\*\*Where they are\*\*: Lisbon, Portugal — overcast, 22°C \(today 21–28°C\), sunrise 07:28, sunset 19:25\n\nWhat they tell you is kept/;
    assert.match(placed.text, whereAt);
    assert.equal(placed.opening.includes("Lisbon"), false);
    assert.equal(placed.here, false);
    // Once a day the page shows where they are as the call opens (here-globe): asked for,
    // the greeting is the weather it shows, which the prompt already holds
    const shown = await loadLivePrompt({ where: lisbon, here: true });
    assert.equal(shown.here, true);
    assert.match(
      shown.opening,
      /^The call has just started\. It is [^\n]+ for them\. Speak first: greet the user in one line, with the weather there — never work\.$/,
    );
    assert.equal(shown.opening.includes("Lisbon"), false);
    // Never without the weather to greet them with, and never over a call-back's reason
    const noSky = await loadLivePrompt({
      where: { place: "Lisbon, Portugal", weather: null },
      here: true,
    });
    assert.equal(noSky.here, false);
    assert.match(noSky.opening, /You may pick up one thing/);
    const rungHere = await loadLivePrompt({
      where: lisbon,
      here: true,
      calledBack: true,
    });
    assert.equal(rungHere.here, false);
    assert.match(rungHere.opening, /You placed this call/);
    assert.match(await loadThursdayPrompt({ where: lisbon }), whereAt);
    assert.equal(on.text.includes("Where they are"), false);
    // Found nothing is no line, not an empty one
    const nowhere = await loadLivePrompt({
      where: { place: null, weather: null },
    });
    assert.match(
      nowhere.text,
      /\*\*Now\*\*: [^\n]+\n\nWhat they tell you is kept/,
    );

    // One Thursday: the backend opens with the voice's own identity and is never told it is a
    // part. On a spoken call it does not talk, so the persona is the voice's alone; on a call
    // in writing it is the one talking, and reads the same persona
    const backend = await loadThursdayPrompt({});
    const withoutClock = (text: string) =>
      text.replace(/\*\*Now\*\*: [^\n]+/, "");
    const identity = on.text.slice(0, on.text.indexOf("\n\nWarm and quick"));
    assert.equal(
      withoutClock(backend).startsWith(
        `${withoutClock(identity)}\n\n## Memory\n`,
      ),
      true,
    );
    assert.equal(backend.includes("Warm and quick to laugh"), false);
    assert.equal(backend.includes("IMPORTANT"), false);
    const written = await loadThursdayPrompt({ written: true });
    assert.match(
      written,
      /\n\nWarm and quick to laugh, [^\n]+\n\nYou are their friend, not their interviewer: [^\n]+\n\n## Memory\n/,
    );
    assert.match(
      backend,
      /\*\*Keep memory clean as you write\.\*\* A fact that repeats, narrows or changes one already in the note replaces it/,
    );
    assert.match(backend, /- Prefer brief replies\. #1\n/);
    assert.match(backend, /- Fact 199 #200\n/);
    // The three writes are named where each is acted on; the trial tool that opened a call is gone
    assert.match(backend, /gets a note of its own with `memory_create`/);
    assert.match(backend, /`memory_describe` puts it right/);
    assert.equal(backend.includes("memory_conversation"), false);
    for (const heading of [
      "## Memory",
      "## Background work",
      "## This computer",
      "## Return the result",
      "## Earlier calls",
    ])
      assert.equal(backend.includes(`\n${heading}\n`), true, heading);
    assert.equal(backend.includes("## Voice conversation context"), false);
    assert.equal(/backend of Thursday|voice model/.test(backend), false);
    // No tool is named for ending: the tool's own description says what it does
    assert.equal(backend.includes("end_call"), false);
    // A thread, not a bot, is what work carries on in; asking is for a real fork only
    assert.match(
      backend,
      /\*\*Work lives in threads\.\*\* A thread's bot remembers that thread and nothing else/,
    );
    assert.match(
      backend,
      /Ask the user which it is only when the request could be either/,
    );
    // Where the app's own guide sits, for a question about Thursday itself
    assert.match(
      backend,
      /is written under `\.guide\/` here, `index\.md` first/,
    );
    assert.match(
      backend,
      /Each bot keeps its own memory from thread to thread/,
    );
    assert.match(backend, /they come from bots, not the user/);
    assert.match(backend, /Book the dentist\./);
    assert.equal(backend.includes("grown past what it holds well"), false);

    // Tidying memory is the backend's: the voice neither reads it nor opens with it
    samFacts = 60;
    const heavy = await loadLivePrompt({});
    assert.equal(/tidying|grown past/.test(heavy.text), false);
    assert.match(heavy.opening, /The call has just started/);
    assert.match(
      await loadThursdayPrompt({}),
      /grown past what it holds well \(people\/sam\): say so once in what you return/,
    );
    samFacts = 2;

    profileFacts = 0;
    // A profile still empty after earlier calls: told to introduce herself over them, she
    // waited for the user to speak, so she greets as on any call and still learns who they are
    const unnamed = await loadLivePrompt({});
    assert.match(unnamed.text, /## First call/);
    assert.match(unnamed.text, /## Earlier calls/);
    assert.match(unnamed.opening, /^The call has just started\. It is /);

    spoken = false;
    const first = await loadLivePrompt({});
    assert.match(first.text, /## First call/);
    // The one call that opens with nothing: she says who she is, then learns who they are
    assert.match(
      first.opening ?? "",
      /Speak first: greet the user in one line, say you are Thursday/,
    );
    assert.match(first.opening ?? "", /ask what to call them/);
    // The call that introduces her opens on that alone: the globe waits for the next one
    const firstHere = await loadLivePrompt({
      where: {
        place: "Lisbon, Portugal",
        weather: {
          code: 3,
          temperature: 22.4,
          low: 20.6,
          high: 27.9,
          sunrise: "07:28",
          sunset: "19:25",
        },
      },
      here: true,
    });
    assert.equal(firstHere.here, false);
    assert.match(firstHere.opening, /say you are Thursday/);
    assert.match(
      first.text,
      /what they do, where they live, and whatever else they offer/,
    );

    // A call the page placed says so, ahead of even the first-call opening
    const rung = await loadLivePrompt({ calledBack: true });
    assert.match(rung.opening, /You placed this call/);
    assert.match(rung.opening, /say that is why you called/);
  } finally {
    memoryMock.restore();
    callMock.restore();
    botMock.restore();
    skillsMock.restore();
    connectedMock.restore();
    workspaceMock.restore();
    threadMock.restore();
  }
});

test("the jobs open as a call starts go in as facts, with no tool name", async () => {
  const now = Date.now();
  let open: Record<string, unknown>[] = [
    {
      id: "t1",
      label: "Hotel in Tokyo",
      bot: "Scout",
      status: "running",
      updatedAt: new Date(now - 60_000),
      outcome: null,
      ask: null,
      room: { questions: [], participants: [], relays: [] },
      lines: [],
    },
    {
      id: "t2",
      label: "Dentist",
      bot: "Jarvis",
      status: "waiting",
      updatedAt: new Date(now - 300_000),
      outcome: null,
      ask: null,
      room: {
        questions: [
          {
            id: "q1",
            bot: "Jarvis",
            text: "Morning or afternoon?",
            options: [],
          },
        ],
        participants: [],
        relays: [],
      },
      lines: [],
    },
    {
      id: "t3",
      label: "Rent chart",
      bot: "Analyst",
      status: "done",
      updatedAt: new Date(now - 7_200_000),
      outcome: "The chart is in artifacts.",
      ask: null,
      room: { questions: [], participants: [], relays: [] },
      lines: [],
    },
  ];
  const threadMock = mock.module("../features/bot/thread.query.ts", {
    namedExports: { listThreadOverview: async () => open },
  });
  try {
    const { loadCallStanding } = await import(
      "../features/ai/prompts/call-standing.ts"
    );
    const text = (await loadCallStanding()) ?? "";
    assert.match(text, /^\[The threads as this call opened, open work first\./);
    assert.match(
      text,
      /- "Hotel in Tokyo" \(t1\) — Scout — running, last moved/,
    );
    assert.match(
      text,
      /- "Dentist" \(t2\) — Jarvis — waiting on the user since .+ — Jarvis asked: Morning or afternoon\?/,
    );
    assert.match(text, /- "Rent chart" \(t3\) — Analyst — done/);
    // The voice reads the same conversation and holds no tool that takes a thread
    assert.equal(text.includes("`"), false);
    assert.equal(/delegate|status/.test(text), false);

    // Nothing handed over yet: nothing goes in
    open = [];
    assert.equal(await loadCallStanding(), null);
  } finally {
    threadMock.restore();
  }
});

test("with an Exa key the call searches through Exa and hands the pages back apart", async () => {
  const configMock = mock.module("../features/config/config.query.ts", {
    namedExports: {
      readConfig: async (key: string) =>
        key === "EXA_API_KEY" ? "exa-key" : undefined,
      writeConfig: async () => {},
    },
  });
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.exa.ai/search");
    assert.equal(
      (init.headers as Record<string, string>)["x-api-key"],
      "exa-key",
    );
    return Response.json({
      results: [
        {
          title: "Tokyo weather",
          url: "https://tenki.jp/a",
          text: "Rain in the afternoon.",
        },
        { title: "", url: "https://jma.go.jp/b", text: "70%" },
        { title: "No link", url: null, text: "Dropped from the pages" },
      ],
    });
  });
  try {
    const { createCallSearchTool } = await import(
      "../features/ai/tools/search.tool.ts"
    );
    const tools = await createCallSearchTool({
      // As the real sandbox's: a promise, so an answer that forgets to await it shows here
      fold: async (text: string) => text,
    } as never);
    const run = tools.web_search?.execute as unknown as (
      input: { query: string },
      options: { toolCallId: string; messages: never[] },
    ) => Promise<{
      results: string;
      sources: { url: string; title?: string }[];
    }>;
    const found = await run(
      { query: "tokyo weather" },
      { toolCallId: "t1", messages: [] },
    );
    assert.deepEqual(found.sources, [
      { url: "https://tenki.jp/a", title: "Tokyo weather" },
      { url: "https://jma.go.jp/b" },
    ]);
    assert.match(found.results, /Tokyo weather — https:\/\/tenki\.jp\/a/);

    // The call screen reads the pages back from the answer, and nothing from a failure line
    const { searchSourcesOf } = await import(
      "../features/thursday/tool-line.ts"
    );
    assert.deepEqual(searchSourcesOf(JSON.stringify(found)), found.sources);
    assert.deepEqual(searchSourcesOf("Search failed: offline."), []);
  } finally {
    configMock.restore();
  }
});

test("a finished job reaches her voice as words to say: a link is its name, a picture and table marks are left out", async () => {
  const { openWork, startedLine, startedOf } = await import(
    "../features/thursday/open-work.ts"
  );
  const thread = {
    id: "t-1",
    label: "Weekend trip",
    bot: "Concierge",
    status: "done",
    seen: false,
    updatedAt: new Date().toISOString(),
    outcome:
      "Here is the plan: [the itinerary](/api/file?path=artifacts/Concierge/weekend.html).\n\n![map](/api/file?path=artifacts/Concierge/map.png)\n\n| Day | Where |\n|---|---|\n| 1 | Old town |\n\n- **Bring** a light jacket.",
    ask: null,
    room: { relays: [], questions: [] },
  };
  const [ending] = openWork([thread] as never);
  const said = ending.line.split("\n").slice(1).join("\n");
  assert.match(said, /the itinerary/);
  assert.match(said, /1 · Old town/);
  assert.match(said, /Bring a light jacket/);
  assert.doesNotMatch(said, /\/api\/file|map\.png|\||\*\*/);

  // Who took a job, told to her voice the moment it starts: from the result, never guessed
  assert.deepEqual(
    startedOf(
      JSON.stringify({ threadId: "t-2", bot: "Analyst", label: "Budget" }),
    ),
    { bot: "Analyst", label: "Budget" },
  );
  assert.equal(startedOf("There is no bot called Anna."), null);
  assert.equal(
    startedLine({ bot: "Analyst", label: "Budget" }),
    'Analyst took "Budget" and is working on it now.',
  );
});

test("a handoff Live ends with a top-level error stops counting as work, and counts again if it goes on", async () => {
  const { activities } = await connect();
  nested({ type: "response.created", response: { id: "r-err" } });
  await tick();
  assert.equal(activities.at(-1)?.working, true);
  wire.on.event({
    type: "error",
    error: { message: "Responses handoff incomplete." },
  });
  await tick();
  assert.equal(activities.at(-1)?.working, false);
  // More of it after all: working again, until its own end
  nested({
    type: "response.output_text.delta",
    response_id: "r-err",
    delta: "Still here.",
  });
  await tick();
  assert.equal(activities.at(-1)?.working, true);
  nested({ type: "response.completed", response: { id: "r-err" } });
  await tick();
  assert.equal(activities.at(-1)?.working, false);
});

test("where they are is written from what the page found, half of it when half was found", async () => {
  const { whereLine } = await import("../features/ai/prompts/prompt-helper.ts");
  const weather = {
    code: 71,
    temperature: -3.4,
    low: -6,
    high: 0.4,
    sunrise: "07:02",
    sunset: "16:48",
  };
  assert.equal(whereLine(null), "");
  assert.equal(
    whereLine({ place: "Oslo, Norway", weather: null }),
    "**Where they are**: Oslo, Norway",
  );
  assert.equal(
    whereLine({ place: null, weather }),
    "**Weather where they are**: slight snow fall, -3°C (today -6–0°C), sunrise 07:02, sunset 16:48",
  );
  // A code the table does not know is said as the code, never dropped or guessed
  assert.match(
    whereLine({ place: null, weather: { ...weather, code: 42 } }),
    /weather code 42/,
  );
  // Gusts, when the forecast has them: what the globe draws a storm from, so she knows it too
  assert.equal(
    whereLine({ place: "Oslo, Norway", weather: { ...weather, gusts: 88.6 } }),
    "**Where they are**: Oslo, Norway — slight snow fall, -3°C (today -6–0°C), sunrise 07:02, sunset 16:48, gusts 89 km/h",
  );
  assert.equal(
    whereLine({ place: null, weather: { ...weather, gusts: null } }).includes(
      "gusts",
    ),
    false,
  );
  // What a page sends is fields: a place that would break the prompt's line is refused
  const { WhereSchema } = await import(
    "../features/thursday/thursday.schema.ts"
  );
  assert.equal(
    WhereSchema.safeParse({ place: "Oslo\n## Always", weather: null }).success,
    false,
  );
});

test("the page looks up where they are ahead of a call, and a call reads what is kept without waiting on it", async (context) => {
  const answer: {
    position: (ok: (at: unknown) => void, no: (e: unknown) => void) => void;
  } = {
    position: (ok) => ok({ coords: { latitude: 38.7223, longitude: -9.1393 } }),
  };
  let asked = 0;
  const DENIED = 1;
  const device = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  context.after(() => {
    if (device) Object.defineProperty(globalThis, "navigator", device);
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition: (
          ok: (at: unknown) => void,
          no: (e: unknown) => void,
        ) => {
          asked += 1;
          answer.position(ok, no);
        },
      },
      permissions: { query: async () => ({ state: "granted" }) },
    },
  });
  // No GeolocationPositionError global here, as in a browser without one: a refusal is
  // still read, and nothing throws out of the lookup
  assert.equal("GeolocationPositionError" in globalThis, false);
  const urls: URL[] = [];
  type Service = (signal: AbortSignal) => Response | Promise<Response>;
  let place: Service = () =>
    Response.json({
      city: "Lisbon",
      locality: "Santa Maria Maior",
      countryName: "Portugal",
      countryCode: "PT",
    });
  const forecast: Service = () =>
    Response.json({
      current: { temperature_2m: 22.4, weather_code: 3, wind_gusts_10m: 31.3 },
      daily: {
        temperature_2m_max: [27.9],
        temperature_2m_min: [20.6],
        sunrise: ["2026-09-27T07:28"],
        sunset: ["2026-09-27T19:25"],
      },
    });
  let weather = forecast;
  context.mock.method(
    globalThis,
    "fetch",
    async (input: string, init: { signal: AbortSignal }) => {
      const url = new URL(input);
      urls.push(url);
      return url.host === "api.bigdatacloud.net"
        ? place(init.signal)
        : weather(init.signal);
    },
  );
  context.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const settle = async () => {
    for (let turn = 0; turn < 5; turn++)
      await new Promise((done) => setImmediate(done));
  };
  // One module throughout: on Node 22 tsx loads it as CommonJS, cached by path, so a query
  // on the import brings back the same one. What it keeps runs out on the mocked clock.
  const { lookAhead, whereNow } = await import("../features/thursday/where.ts");

  // Nothing kept yet: the call goes without, and the lookup its press starts is the next one's
  assert.equal(whereNow(), null);
  await lookAhead();
  assert.equal(asked, 1);
  // What goes to the server is `where`; the position and the country are the page's own, for the globe
  const position = { lat: 38.7223, lon: -9.1393 };
  assert.deepEqual(whereNow(), {
    where: {
      place: "Lisbon, Portugal",
      weather: {
        code: 3,
        temperature: 22.4,
        low: 20.6,
        high: 27.9,
        sunrise: "07:28",
        sunset: "19:25",
        gusts: 31.3,
      },
    },
    position,
    country: "PT",
  });
  // The place service gets the device's own position; the forecast, a kilometre's worth
  assert.equal(urls[0]?.searchParams.get("latitude"), "38.7223");
  assert.equal(urls[1]?.searchParams.get("latitude"), "38.72");
  assert.match(urls[1]?.searchParams.get("current") ?? "", /wind_gusts_10m/);
  // Found once, kept for a while: neither the device nor the services are asked again
  await lookAhead();
  whereNow();
  assert.equal(asked, 1);
  assert.equal(urls.length, 2);

  // Run out: the call placed then does not wait. It is told the place, which is still where
  // they are for all the page knows, and not weather that old; the lookup is the next one's
  context.mock.timers.tick(HERE.keptMs);
  const stale = {
    where: { place: "Lisbon, Portugal", weather: null },
    position,
    country: "PT",
  };
  assert.deepEqual(whereNow(), stale);
  assert.equal(asked, 2);
  await lookAhead();
  assert.equal(asked, 2);
  assert.equal(whereNow()?.where.weather?.code, 3);

  // Looked up again with the forecast down: the place it found, and no weather
  context.mock.timers.tick(HERE.keptMs);
  weather = () => new Response("down", { status: 503 });
  await lookAhead();
  assert.deepEqual(whereNow(), stale);

  // Nothing found at all replaces nothing: the place found before is still read
  context.mock.timers.tick(HERE.keptMs);
  place = () => new Response("down", { status: 503 });
  await lookAhead();
  assert.deepEqual(whereNow(), stale);
  await lookAhead();

  // Refused: nothing, and nothing asked of the services. What was found while it was
  // allowed goes with the refusal
  const before = urls.length;
  answer.position = (_ok, no) =>
    no({ code: DENIED, message: "User denied Geolocation" });
  await lookAhead();
  assert.equal(whereNow(), null);
  await lookAhead();
  assert.equal(urls.length, before);

  // A service that does not answer is given HERE.lookMs; what the other said is kept
  answer.position = (ok) =>
    ok({ coords: { latitude: 38.7223, longitude: -9.1393 } });
  place = () => Response.json({ city: "Lisbon", countryName: "Portugal" });
  weather = (signal) =>
    new Promise((_, reject) =>
      signal.addEventListener("abort", () => reject(new Error("aborted"))),
    );
  const slow = lookAhead();
  await settle();
  assert.equal(whereNow(), null);
  context.mock.timers.tick(HERE.lookMs);
  await slow;
  assert.deepEqual(whereNow()?.where, {
    place: "Lisbon, Portugal",
    weather: null,
  });

  // A device that never says holds no call up, and is asked once however often they call
  context.mock.timers.tick(HERE.keptMs);
  weather = forecast;
  answer.position = () => {};
  const unasked = urls.length;
  const devices = asked;
  assert.equal(whereNow()?.where.weather, null);
  assert.equal(whereNow()?.where.place, "Lisbon, Portugal");
  assert.equal(asked, devices + 1);
  assert.equal(urls.length, unasked);
  // Left unanswered for as long as a lookup is kept, it is given up on and asked again
  context.mock.timers.tick(HERE.keptMs);
  answer.position = (ok) =>
    ok({ coords: { latitude: 38.7223, longitude: -9.1393 } });
  assert.equal(whereNow()?.where.weather, null);
  assert.equal(asked, devices + 2);
  await lookAhead();
  assert.equal(whereNow()?.where.weather?.code, 3);

  // Refused after it was found: the place goes too, however long ago it was read
  answer.position = (_ok, no) =>
    no({ code: DENIED, message: "User denied Geolocation" });
  context.mock.timers.tick(HERE.keptMs);
  await lookAhead();
  assert.equal(whereNow(), null);
  await lookAhead();
});

test("where the browser would prompt nothing is asked before a press, and the call that press starts does not wait on the answer", async (context) => {
  let asked = 0;
  let allowed = "prompt";
  const pending: { answer: ((at: unknown) => void) | null } = { answer: null };
  const device = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  context.after(() => {
    if (device) Object.defineProperty(globalThis, "navigator", device);
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition: (ok: (at: unknown) => void) => {
          asked += 1;
          pending.answer = ok;
        },
      },
      permissions: { query: async () => ({ state: allowed }) },
    },
  });
  context.mock.method(globalThis, "fetch", async (input: string) =>
    new URL(input).host === "api.bigdatacloud.net"
      ? Response.json({ city: "Lisbon", countryName: "Portugal" })
      : new Response("down", { status: 503 }),
  );
  const settle = () => new Promise((done) => setImmediate(done));
  const { lookAhead, whereNow } = await import("../features/thursday/where.ts");

  // Not allowed yet: nothing is asked, so no prompt comes without a press
  await lookAhead();
  assert.equal(asked, 0);

  // The press asks, so the prompt comes with it, and the call goes on without the answer
  assert.equal(whereNow(), null);
  assert.equal(asked, 1);
  // Asked again while the prompt is up, it waits on that one
  assert.equal(whereNow(), null);
  allowed = "granted";
  const looking = lookAhead();
  await settle();
  assert.equal(asked, 1);
  pending.answer?.({ coords: { latitude: 38.7223, longitude: -9.1393 } });
  await looking;

  // Allowed: the next call finds it there
  assert.equal(whereNow()?.where.place, "Lisbon, Portugal");
  assert.equal(asked, 1);
});

test("the page keeps where they are looked up while it is in front, and asks nothing while it is hidden", async (context) => {
  let asked = 0;
  const device = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const listeners = new Set<() => void>();
  const page = {
    visibilityState: "visible",
    addEventListener: (_type: string, heard: () => void) =>
      listeners.add(heard),
    removeEventListener: (_type: string, heard: () => void) =>
      listeners.delete(heard),
  };
  context.after(() => {
    if (device) Object.defineProperty(globalThis, "navigator", device);
    Reflect.deleteProperty(globalThis, "document");
    Reflect.deleteProperty(globalThis, "window");
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: page,
  });
  // The network coming back is heard on the window, by the same listener
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: page,
  });
  /** The device answers, or is left holding the question. */
  let answers = true;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition: (ok: (at: unknown) => void) => {
          asked += 1;
          if (answers)
            ok({ coords: { latitude: 38.7223, longitude: -9.1393 } });
        },
      },
      permissions: { query: async () => ({ state: "granted" }) },
    },
  });
  context.mock.method(globalThis, "fetch", async (input: string) =>
    new URL(input).host === "api.bigdatacloud.net"
      ? Response.json({ city: "Lisbon", countryName: "Portugal" })
      : new Response("down", { status: 503 }),
  );
  // Past what the tests above left kept
  context.mock.timers.enable({
    apis: ["setTimeout", "Date"],
    now: Date.now() + HERE.keptMs,
  });
  const settle = async () => {
    for (let turn = 0; turn < 5; turn++)
      await new Promise((done) => setImmediate(done));
  };
  const show = async (state: "visible" | "hidden") => {
    page.visibilityState = state;
    for (const heard of listeners) heard();
    await settle();
  };
  const { keepWhere, whereNow } = await import("../features/thursday/where.ts");

  // As the page opens, with nothing pressed
  const stop = keepWhere();
  await settle();
  assert.equal(asked, 1);
  assert.equal(whereNow()?.where.place, "Lisbon, Portugal");

  // A lookup's time before what is kept runs out it is looked up again, so a press at any
  // time finds it, the moment it would have run out included
  context.mock.timers.tick(HERE.keptMs - HERE.lookMs - 1);
  await settle();
  assert.equal(asked, 1);
  context.mock.timers.tick(1);
  await settle();
  assert.equal(asked, 2);
  assert.equal(whereNow()?.where.place, "Lisbon, Portugal");

  // Hidden: nothing is asked, however long
  await show("hidden");
  context.mock.timers.tick(HERE.keptMs * 3);
  await settle();
  assert.equal(asked, 2);

  // Back in front with what was kept run out: asked again
  await show("visible");
  assert.equal(asked, 3);

  // The network coming back, or the page shown again, with it just looked up: nothing asked
  await show("visible");
  assert.equal(asked, 3);

  // A device that never answers does not stop the looking: it is asked again once that
  // lookup is given up on
  answers = false;
  context.mock.timers.tick(HERE.keptMs - HERE.lookMs);
  await settle();
  assert.equal(asked, 4);
  context.mock.timers.tick(HERE.keptMs);
  await settle();
  assert.equal(asked, 5);

  stop();
  assert.equal(listeners.size, 0);
  context.mock.timers.tick(HERE.keptMs * 2);
  await settle();
  assert.equal(asked, 5);
});

test("a microphone the browser did not hand over is read off the name it refused with, and nothing else is guessed at", async () => {
  const { micProblem } = await import("../features/thursday/mic-problem.ts");
  assert.equal(
    micProblem(new DOMException("Permission denied", "NotAllowedError")),
    "refused",
  );
  assert.equal(
    micProblem(new DOMException("Requested device not found", "NotFoundError")),
    "missing",
  );
  assert.equal(
    micProblem(new DOMException("Could not start", "NotReadableError")),
    "busy",
  );
  assert.equal(micProblem(new DOMException("Aborted", "AbortError")), null);
  assert.equal(
    micProblem(new Error("The call closed before connecting.")),
    null,
  );
});
