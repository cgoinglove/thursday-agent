import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, mock, test } from "node:test";
import { APICallError, simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import type { OfficeMemory } from "../features/bot/office.ts";

// The real runner, DB, tools and prompts run against an empty temporary home.
const home = await mkdtemp(join(tmpdir(), "thursday-context-"));
process.env.THURSDAY_HOME = home;
process.env.THURSDAY_SKIP_BROWSER = "1";
process.env.THURSDAY_TOOL_PATH = join(home, "tools");
process.env.PATH = `${join(home, "tools")}:${process.env.PATH}`;
await mkdir(join(home, "tools"));
const browserCli = join(home, "tools", "playwright-cli");
// The fixtures' folder is written into the stand-in: a bot's shell does not carry the app's
// THURSDAY_* variables (lib/sandbox APP_OWN)
await writeFile(
  browserCli,
  `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const root = ${JSON.stringify(home)};
const [command, arg] = process.argv.slice(2).filter((one) => one !== "--raw");
// What the app sets on a browser's context (signins.query), one file a session
const mark = path.join(root, "marks", String(process.env.PLAYWRIGHT_CLI_SESSION));
if (command === "list") {
  fs.appendFileSync(path.join(root, "listed.txt"), "list\\n");
  // The CLI failing, as it does when it times out under load
  if (fs.existsSync(path.join(root, "list-fails"))) process.exit(1);
  const fixture = path.join(root, "browsers.json");
  console.log(fs.existsSync(fixture) ? fs.readFileSync(fixture, "utf8") : '{"browsers":[]}');
} else if (command === "close") {
  fs.appendFileSync(path.join(root, "closed.txt"), process.env.PLAYWRIGHT_CLI_SESSION + "\\n");
  fs.rmSync(mark, { force: true });
} else if (command === "open") {
  // Another browser under the same session: nothing stored, no mark
  fs.writeFileSync(path.join(root, "state.json"), '{"cookies":[]}');
  fs.rmSync(mark, { force: true });
} else if (command === "state-save") {
  const fixture = path.join(root, "state.json");
  if (!fs.existsSync(fixture)) process.exit(1);
  fs.copyFileSync(fixture, arg);
} else if (command === "state-load") {
  // The browser's storage is the state's alone, as Playwright's setStorageState leaves it
  fs.copyFileSync(arg, path.join(root, "state.json"));
} else if (command === "run-code") {
  const set = /= '([^']+)'/.exec(arg ?? "");
  if (set) {
    fs.mkdirSync(path.dirname(mark), { recursive: true });
    fs.writeFileSync(mark, set[1]);
    console.log("true");
  } else console.log(JSON.stringify(fs.existsSync(mark) ? fs.readFileSync(mark, "utf8") : null));
}
`,
);
await chmod(browserCli, 0o755);
const realModel = await import("../features/ai/model.ts");
const plans = new Map<
  string,
  ((prompt: string) => unknown[] | Promise<unknown[]>)[]
>();
const replies = new Map<string, ((prompt: string) => string)[]>();
const inputs = new Map<string, string[]>();
/** The prompt cache key each step was sent with, per model (ai/model promptCacheOptions). */
const cacheKeys = new Map<string, unknown[]>();
/** The tool names each step was offered, per model. */
const offered = new Map<string, string[][]>();
const failures: unknown[] = [];
let nextId = 0;
const usage = {
  inputTokens: {
    total: 100,
    noCache: 100,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};
const models = new Map(
  ["Alpha", "Beta", "Gamma"].map((name) => [
    name,
    new MockLanguageModelV4({
      modelId: name,
      doStream: async ({ prompt, providerOptions, tools }) => {
        const text = JSON.stringify(prompt);
        inputs.set(name, [...(inputs.get(name) ?? []), text]);
        offered.set(name, [
          ...(offered.get(name) ?? []),
          (tools ?? []).map((one) => one.name),
        ]);
        cacheKeys.set(name, [
          ...(cacheKeys.get(name) ?? []),
          providerOptions?.openai?.promptCacheKey,
        ]);
        const plan = plans.get(name)?.shift();
        assert.ok(plan, `Unexpected ${name} step`);
        let chunks: unknown[];
        try {
          chunks = await plan(text);
        } catch (error) {
          failures.push(error);
          throw error;
        }
        return {
          stream: simulateReadableStream({
            initialDelayInMs: null,
            chunkDelayInMs: null,
            chunks: [
              ...chunks,
              {
                type: "finish",
                finishReason: {
                  unified: chunks.some((part: any) => part.type === "tool-call")
                    ? "tool-calls"
                    : "stop",
                  raw: undefined,
                },
                usage,
              },
            ] as any[],
          }),
        };
      },
      doGenerate: async ({ prompt }) => {
        const reply = replies.get(name)?.shift();
        assert.ok(reply, `Unexpected ${name} question or compaction`);
        let answer: string;
        try {
          answer = reply(JSON.stringify(prompt));
        } catch (error) {
          failures.push(error);
          throw error;
        }
        return {
          content: [{ type: "text", text: answer }],
          finishReason: { unified: "stop", raw: undefined },
          usage,
          warnings: [],
        };
      },
    }),
  ]),
);
mock.module("../features/ai/model.ts", {
  namedExports: {
    ...realModel,
    getTextModel: async (ref: { model: string }) => {
      // A pick with no scripted model stands for one with no key: refused the way the real one is
      if (!models.has(ref.model))
        (await import("../lib/public-error.ts")).publicError(
          `No key for ${ref.model}.`,
        );
      return { ref, model: models.get(ref.model), searchTools: null };
    },
    compactBudget: async () => 8000,
  },
});
mock.module("../lib/desktop-notify.ts", {
  namedExports: { desktopNotify: async () => {} },
});
const { database } = await import("../database/db.ts");
const { migrateDatabase } = await import("../database/migrate.ts");
const { botTable, threadMessageTable } = await import("../database/tables.ts");
const { startThread, answerThread, askCompact, cancelThread } = await import(
  "../features/bot/bot.runner.ts"
);
const { findThread, findThreadView, upsertMessage, lastSeq } = await import(
  "../features/bot/thread.query.ts"
);
const { resumeTranscript } = await import("../features/bot/bot.run.ts");
const { asWords } = await import("../features/ai/words.ts");
const { botArtifacts, botBrowserSession, WORKSPACE } = await import(
  "../features/workspace/workspace.ts"
);
const { TOOL_NAMES: T } = await import("../features/ai/tools/tool-name.ts");
const {
  listRoomWork,
  listParticipantTranscript,
  listRoomRelays,
  sendRoomMessage,
} = await import("../features/bot/room.query.ts");
const { presence } = await import("../app/api/events/app-event.server.ts");
const { BOT_RUN } = await import("../config.ts");
// The retry after a break waits in real time; the tests only need its order
BOT_RUN.retryMs = 1;
const { eq } = await import("drizzle-orm");
const { threadFromRow } = await import("../features/bot/thread.store.ts");
const { officeOf, plateOf, reportAt, sceneOf, seatAt, signOf, watch, wordsOf } =
  await import("../features/bot/office.ts");
/** A thread as the office reads it at a first look, off the view the screen gets (features/bot/office.ts). */
const officeNow = async (id: string) => {
  const office = officeOf(threadFromRow((await findThreadView(id))!));
  return { office, scene: sceneOf(office, watch(null, office, office.span)) };
};
/** The office kept open on a thread: each reading taken at `now`, seconds since the handover. */
const watching = (id: string) => {
  let memory: OfficeMemory | null = null;
  return async (now: number) => {
    const office = officeOf(threadFromRow((await findThreadView(id))!));
    memory = watch(memory, office, now);
    return { office, scene: sceneOf(office, memory) };
  };
};
/** Polls until `check` holds, or fails saying what never happened. */
const waitUntil = async (check: () => Promise<boolean>, what: string) => {
  const until = Date.now() + 5_000;
  while (!(await check())) {
    assert.ok(Date.now() < until, what);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
await migrateDatabase();
for (const name of models.keys())
  await database.insert(botTable).values({
    name,
    description: `${name} test worker`,
    provider: "openai",
    model: name,
  });

const call = (name: string, input: unknown) => [
  {
    type: "tool-call",
    toolCallId: `test-${++nextId}`,
    toolName: name,
    input: JSON.stringify(input),
  },
];
const text = (value: string) => [
  { type: "text-start", id: "text" },
  { type: "text-delta", id: "text", delta: value },
  { type: "text-end", id: "text" },
];
const ask = (bot: string, request: string) =>
  call(T.send_message, {
    to: bot,
    text: request,
    why: "the test's reason",
    kind: bot === "Thursday" ? "question" : "message",
  });
const waitFor = async (id: string, status: string) => {
  const until = Date.now() + 20_000;
  while (Date.now() < until) {
    const thread = await findThread(id);
    if (thread?.status === status) return thread;
    if (thread?.status === "cancelled")
      assert.fail(`Thread was cancelled before it became ${status}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`Thread did not become ${status}`);
};
/**
 * Waits until a file the stand-in CLI appends to has this many lines: a finished job closes
 * its hidden browsers after it is done (bot.runner closeIdleBrowser), not before.
 */
const linesReach = async (name: string, n: number) => {
  // At least n, and no more coming: a finish from an earlier test can still be closing
  let last = -1;
  let still = 0;
  for (let tries = 0; tries < 300; tries++) {
    const text = await readFile(join(home, name), "utf8").catch(() => "");
    const lines = text.split("\n").filter(Boolean).length;
    still = lines === last ? still + 1 : 0;
    last = lines;
    if (lines >= n && still >= 5) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`${name} never settled at ${n} lines or more`);
};
/** A turn that waits for the test to open it, so the order of answers is the test's. */
const gate = () => {
  let open = () => {};
  const shut = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { shut, open: () => open() };
};
const rowsOf = (id: string) =>
  database
    .select()
    .from(threadMessageTable)
    .where(eq(threadMessageTable.threadId, id))
    .orderBy(threadMessageTable.seq);
afterEach(() => {
  assert.deepEqual(failures.splice(0), []);
});
after(async () => {
  await rm(home, { recursive: true, force: true });
});

test("the inbox carries only the newest unread and unrelayed endings", async () => {
  const { insertThread, deleteThread, listInboxThreads } = await import(
    "../features/bot/thread.query.ts"
  );
  const { threadRelayTable, threadTable } = await import(
    "../database/tables.ts"
  );
  const { INBOX_UNREAD } = await import("../config.ts");
  const ids: string[] = [];
  try {
    // A routine nobody opened: one unread ending a run, each with a report no call relayed
    for (let index = 0; index < INBOX_UNREAD + 5; index++) {
      const thread = await insertThread({
        bot: "Alpha",
        label: `Unread ${index}`,
        request: "Unread fixture",
        opening: "Unread fixture",
      });
      ids.push(thread.id);
      await database
        .update(threadTable)
        .set({
          status: "done",
          seen: false,
          outcome: `Result ${index}`,
          updatedAt: new Date(Date.UTC(2030, 0, 1, 0, index)),
        })
        .where(eq(threadTable.id, thread.id));
      await database.insert(threadRelayTable).values({
        key: `report:${thread.id}:0`,
        threadId: thread.id,
        bot: "Alpha",
        text: `Result ${index}`,
        kind: "report",
      });
    }
    const listed = new Set((await listInboxThreads()).map((row) => row.id));
    assert.deepEqual(
      ids.map((id) => listed.has(id)),
      ids.map((_, index) => index >= 5),
    );
  } finally {
    for (const id of ids) await deleteThread(id);
  }
});

test("a routine's run that ends tells the routines to be read again", async () => {
  const { insertThread, deleteThread, updateThread } = await import(
    "../features/bot/thread.query.ts"
  );
  const { appEvents } = await import("../app/api/events/app-event.server.ts");
  const heard: string[] = [];
  const stop = appEvents.subscribe((event) => heard.push(event.type));
  const run = await insertThread({
    bot: "Alpha",
    label: "Morning brief",
    request: "Routine fixture",
    opening: "Routine fixture",
    routineId: "routine-fixture",
  });
  const loose = await insertThread({
    bot: "Alpha",
    label: "Loose job",
    request: "Loose fixture",
    opening: "Loose fixture",
  });
  try {
    heard.length = 0;
    await updateThread(loose.id, { status: "done", outcome: "Done." });
    assert.ok(!heard.includes("routines"));
    await updateThread(run.id, { status: "done", outcome: "Done." });
    assert.ok(heard.includes("routines"));
    // Being read is not how the run stands
    heard.length = 0;
    await updateThread(run.id, { seen: true });
    assert.ok(!heard.includes("routines"));
  } finally {
    stop();
    await deleteThread(run.id);
    await deleteThread(loose.id);
  }
});

test("thread overview keeps old open work and the inbox retains unread endings", async () => {
  const {
    insertThread,
    deleteThread,
    listThreadOverview,
    listInboxThreads,
    markSeen,
  } = await import("../features/bot/thread.query.ts");
  const { threadRelayTable, threadTable } = await import(
    "../database/tables.ts"
  );
  const { loadTools } = await import("../features/ai/load-tools.ts");
  const { needsThreadReply } = await import("../features/bot/bot.schema.ts");
  const ids: string[] = [];
  try {
    for (let index = 0; index < 14; index++) {
      const thread = await insertThread({
        bot: "Alpha",
        label: `Overview ${index}`,
        request: "Overview fixture",
        opening: "Overview fixture",
      });
      ids.push(thread.id);
      await database
        .update(threadTable)
        .set({
          status:
            index === 0
              ? "running"
              : index === 1
                ? "waiting"
                : index === 2
                  ? "cancelled"
                  : "done",
          seen: false,
          outcome: index > 1 ? `Result ${index}` : null,
          updatedAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
        })
        .where(eq(threadTable.id, thread.id));
    }
    // Each says a line, so every one of them has a transcript to carry or leave out
    for (const id of ids)
      await upsertMessage(id, (await lastSeq(id)) + 1, {
        bot: "Alpha",
        parent: null,
        role: "assistant",
        content: "Looking into it.",
      });
    const overview = await listThreadOverview();
    assert.equal(overview.length, 10);
    assert.deepEqual(
      overview.map((thread) => thread.id),
      [ids[1], ids[0], ...ids.slice(6).reverse()],
    );
    // Only what is running carries its transcript: nothing reads the others' here
    assert.deepEqual(
      overview.map((thread) => thread.lines.length > 0),
      overview.map((thread) => thread.id === ids[0]),
    );
    const tools = await loadTools({ target: "thursday" });
    const result = (await tools[T.thread_status].execute!(
      { thread: "all" },
      { toolCallId: "overview", messages: [], context: {} },
    )) as { threads: { id: string; status: string; now?: string }[] };
    assert.deepEqual(
      result.threads.map((thread) => thread.id),
      overview.map((thread) => thread.id),
    );
    // What the running one is doing is still said, from its own lines
    assert.deepEqual(
      result.threads.map((thread) => "now" in thread),
      overview.map((thread) => thread.id === ids[0]),
    );
    const inbox = await listInboxThreads();
    assert.equal(inbox.length, 14);
    assert.ok(
      inbox.some(
        (thread) => thread.id === ids[2] && thread.status === "cancelled",
      ),
    );
    await markSeen([ids[2]]);
    assert.ok(
      !(await listInboxThreads()).some((thread) => thread.id === ids[2]),
    );
    // A stop is read by whoever made it and still holds its place among the latest endings
    await database
      .update(threadTable)
      .set({ updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 30)) })
      .where(eq(threadTable.id, ids[2]));
    assert.ok(
      (await listInboxThreads()).some(
        (thread) => thread.id === ids[2] && thread.status === "cancelled",
      ),
    );
    // A report no call relayed holds its ending in the inbox; reading it settles that too
    await database.insert(threadRelayTable).values({
      key: `report:${ids[3]}:0`,
      threadId: ids[3],
      bot: "Alpha",
      text: "Result 3",
      kind: "report",
    });
    assert.ok(
      (await listInboxThreads()).some((thread) => thread.id === ids[3]),
    );
    await markSeen([ids[3]]);
    assert.ok(
      !(await listInboxThreads()).some((thread) => thread.id === ids[3]),
    );
    assert.ok(
      needsThreadReply({
        status: "running",
        room: {
          participants: [],
          questions: [{ id: "question", bot: "Beta", text: "Which address?" }],
          deliveries: [],
          relays: [],
          exchanges: [],
        },
      }),
    );
    assert.equal(
      needsThreadReply({
        status: "running",
        room: {
          participants: [],
          questions: [],
          deliveries: [],
          relays: [],
          exchanges: [],
        },
      }),
      false,
    );
  } finally {
    for (const id of ids) await deleteThread(id);
  }
});

test("a bot's own memory puts back a write past its limits and says which", async () => {
  const { botMemoryFolder, holdBotMemory, keepBotMemory } = await import(
    "../features/bot/bot.memory.ts"
  );
  const { BOT_MEMORY_LIMITS } = await import("../config.ts");
  const folder = join(WORKSPACE, botMemoryFolder("Gamma"));
  await rm(folder, { recursive: true, force: true });
  await mkdir(folder, { recursive: true });
  try {
    await writeFile(join(folder, "kept.md"), "Kept: a short lesson\n");
    let held = await holdBotMemory("Gamma");
    // One file past the characters a file holds: back as it was, and said
    await writeFile(
      join(folder, "kept.md"),
      "x".repeat(BOT_MEMORY_LIMITS.chars + 1),
    );
    let said = await keepBotMemory("Gamma", held);
    assert.equal(
      await readFile(join(folder, "kept.md"), "utf8"),
      "Kept: a short lesson\n",
    );
    assert.match(said ?? "", /kept\.md.*back as it was/);
    // New files past the count: the new ones go, and the bot is told to merge
    held = await holdBotMemory("Gamma");
    for (let index = 0; index < BOT_MEMORY_LIMITS.files; index++)
      await writeFile(join(folder, `new-${index}.md`), `Lesson ${index}\n`);
    said = await keepBotMemory("Gamma", held);
    const { readdir } = await import("node:fs/promises");
    assert.deepEqual(await readdir(folder), ["kept.md"]);
    assert.match(said ?? "", /holds \d+ files at most/);
    // Within both limits nothing is said
    held = await holdBotMemory("Gamma");
    await writeFile(join(folder, "second.md"), "Second lesson\n");
    assert.equal(await keepBotMemory("Gamma", held), null);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("a bot that worked a job looks back once it is done, on the conversation it already has", async () => {
  const { REFLECT_NOTE } = await import("../features/ai/prompts/bot.prompt.ts");
  const { botMemoryFolder } = await import("../features/bot/bot.memory.ts");
  const { BOT_REFLECT } = await import("../config.ts");
  const kept = join(WORKSPACE, botMemoryFolder("Alpha"), "site-search.md");
  const before = inputs.get("Alpha")?.length ?? 0;
  plans.set("Alpha", [
    ...Array.from(
      { length: BOT_REFLECT.minTools },
      (_, step) => () =>
        call(T.bash, { command: "true", description: `Step ${step}` }),
    ),
    () => text("The answer."),
    (prompt) => {
      // The look back is the last thing it reads, after its own answer
      const sent = JSON.parse(prompt) as { role: string; content: unknown }[];
      assert.equal(sent.at(-1)?.role, "user");
      assert.ok(JSON.stringify(sent.at(-1)).includes("Look back over it"));
      assert.ok(prompt.includes("The answer."));
      return call(T.bash, {
        command: `mkdir -p "${join(kept, "..")}" && printf 'Site search: the box is under Help (2026-10-01)\\n' > "${kept}"`,
        description: "Keep what the job taught",
      });
    },
    () => text("Kept one note."),
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Find it on the site",
    label: "Look back",
    from: "user",
  });
  await waitFor(id, "done");
  const rows = (await rowsOf(id)).length;
  const tokens = (await findThread(id))?.inputTokens ?? 0;
  await waitUntil(
    async () =>
      (inputs.get("Alpha")?.length ?? 0) === before + BOT_REFLECT.minTools + 3,
    "Alpha never looked back",
  );
  await waitUntil(
    async () => ((await findThread(id))?.inputTokens ?? 0) >= tokens + 200,
    "the look back's tokens never reached the job",
  );
  assert.equal(
    await readFile(kept, "utf8"),
    "Site search: the box is under Help (2026-10-01)\n",
  );
  // What it kept is the job's lesson, told by the note's own first line (bot.lesson)
  const { listLessons } = await import("../features/bot/lesson.query.ts");
  const lessons = await listLessons({ thread: id });
  assert.deepEqual(
    lessons.map((one) => [one.bot, one.kind, one.name, one.line]),
    [
      [
        "Alpha",
        "memory",
        "site-search.md",
        "Site search: the box is under Help (2026-10-01)",
      ],
    ],
  );
  assert.equal(lessons[0]?.threadLabel, "Look back");
  // Nothing of it is written to the thread, whose answer stands
  assert.equal((await rowsOf(id)).length, rows);
  assert.equal((await findThread(id))?.outcome, "The answer.");
  // The same instructions and cache key as the job's last step, so the provider reads it back
  const sent = (inputs.get("Alpha") ?? []).slice(-3);
  const system = (one: string) =>
    JSON.stringify((JSON.parse(one) as { role: string }[])[0]);
  assert.equal(system(sent[1]), system(sent[0]));
  const keys = (cacheKeys.get("Alpha") ?? []).slice(-3);
  assert.equal(keys[1], keys[0]);
  assert.ok(REFLECT_NOTE.length > 0);

  // A job of fewer tool calls taught little: no look back, so no step is scripted for one
  plans.set("Alpha", [
    () => call(T.bash, { command: "true", description: "One step" }),
    () => text("Short answer."),
  ]);
  const short = await startThread({
    bot: "Alpha",
    request: "Something quick",
    label: "Quick",
    from: "user",
  });
  await waitFor(short, "done");
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(plans.get("Alpha")?.length, 0);
});

test("what a bot keeps is noted from the disk, folded within a job, and put back only as the job left it", async () => {
  const { existsSync } = await import("node:fs");
  const { createWorkspaceTools } = await import(
    "../features/ai/tools/workspace.tool.ts"
  );
  const { openWorkspace } = await import("../features/workspace/workspace.ts");
  const { listLessons } = await import("../features/bot/lesson.query.ts");
  const { undoLesson } = await import("../features/bot/bot.lesson.ts");
  const { botMemoryFolder } = await import("../features/bot/bot.memory.ts");
  const { BOT_MEMORY_LIMITS } = await import("../config.ts");
  plans.set("Alpha", [() => text("Done.")]);
  const id = await startThread({
    bot: "Alpha",
    request: "Learn",
    label: "Learning",
    from: "user",
  });
  await waitFor(id, "done");
  const shell = createWorkspaceTools(await openWorkspace(), {
    write: true,
    bot: "Delta",
    thread: id,
  });
  const run = (command: string) =>
    shell[T.bash].execute!(
      { command },
      { toolCallId: "kept", messages: [], context: {} },
    );
  const memory = botMemoryFolder("Delta");
  const skill = "bots/Delta/.agents/skills/price-compare";
  await rm(join(WORKSPACE, "bots/Delta"), { recursive: true, force: true });
  try {
    // A note written and changed again in one job: one lesson, written new
    await run(
      `mkdir -p ${memory} && printf 'Region first\\n' > ${memory}/shop.md`,
    );
    await run(`printf 'Region first, then currency\\n' > ${memory}/shop.md`);
    // A write the memory limits take back was never kept
    await run(
      `head -c ${BOT_MEMORY_LIMITS.chars + 10} /dev/zero | tr '\\0' x > ${memory}/long.md`,
    );
    // A skill of its own, told by its description
    await run(
      `mkdir -p ${skill} && printf -- '---\\nname: price-compare\\ndescription: Compare unit prices across shops\\n---\\n# Steps\\n' > ${skill}/SKILL.md`,
    );
    const kept = await listLessons({ thread: id });
    assert.deepEqual(
      kept.map((one) => [one.kind, one.name, one.change, one.line]),
      [
        ["memory", "shop.md", "added", "Region first, then currency"],
        ["skill", "price-compare", "added", "Compare unit prices across shops"],
      ],
    );
    const [note, written] = kept as [(typeof kept)[0], (typeof kept)[0]];

    // Changed since the job left it: left as it is
    await writeFile(join(WORKSPACE, memory, "shop.md"), "Edited by hand\n");
    await assert.rejects(undoLesson(note.id), /changed since/);
    await writeFile(
      join(WORKSPACE, memory, "shop.md"),
      "Region first, then currency\n",
    );
    // Put back: what the job wrote new goes, a skill with its whole folder
    assert.equal(await undoLesson(note.id), "Put back.");
    assert.equal(existsSync(join(WORKSPACE, memory, "shop.md")), false);
    assert.equal(await undoLesson(written.id), "Put back.");
    assert.equal(existsSync(join(WORKSPACE, skill)), false);
    await assert.rejects(undoLesson(written.id), /already put back/);
    assert.ok((await listLessons({ thread: id })).every((one) => one.undoneAt));

    // What the user wrote between commands is not the bot's; what it changed of it goes back
    await writeFile(join(WORKSPACE, memory, "kept.md"), "Old way\n");
    await run(`printf 'New way\\n' > ${memory}/kept.md`);
    const changed = (await listLessons({ thread: id })).at(-1);
    assert.deepEqual(
      [changed?.name, changed?.change, changed?.added, changed?.removed],
      ["kept.md", "changed", 1, 1],
    );
    await undoLesson(changed!.id);
    assert.equal(
      await readFile(join(WORKSPACE, memory, "kept.md"), "utf8"),
      "Old way\n",
    );
    // Putting back is no lesson of its own
    assert.equal((await listLessons({ thread: id })).length, 3);
    // Two commands of one bot at once, in two jobs: a change made while the other runs is
    // noted once, never taken for how things already stood
    plans.set("Alpha", [() => text("Done.")]);
    const other = await startThread({
      bot: "Alpha",
      request: "Meanwhile",
      label: "Meanwhile",
      from: "user",
    });
    await waitFor(other, "done");
    const second = createWorkspaceTools(await openWorkspace(), {
      write: true,
      bot: "Delta",
      thread: other,
    });
    const slow = run(`printf 'Busy note\\n' > ${memory}/busy.md && sleep 0.4`);
    await waitUntil(
      async () => existsSync(join(WORKSPACE, memory, "busy.md")),
      "the slow command never wrote",
    );
    await second[T.bash].execute!(
      { command: "true" },
      { toolCallId: "meanwhile", messages: [], context: {} },
    );
    await slow;
    const busy = [
      ...(await listLessons({ thread: id })),
      ...(await listLessons({ thread: other })),
    ].filter((one) => one.name === "busy.md");
    assert.equal(busy.length, 1);
    await undoLesson(busy[0]!.id);
    // The bot's page lists its lessons newest first
    assert.deepEqual(
      (await listLessons({ bot: "Delta" })).map((one) => one.name),
      ["busy.md", "kept.md", "price-compare", "shop.md"],
    );
    // Cleared by age with the jobs: the record goes, what the bot keeps stays on disk
    const { deleteOldLessons } = await import(
      "../features/bot/lesson.query.ts"
    );
    assert.ok((await deleteOldLessons(new Date(Date.now() + 60_000))) >= 4);
    assert.deepEqual(await listLessons({ bot: "Delta" }), []);
    assert.equal(
      await readFile(join(WORKSPACE, memory, "kept.md"), "utf8"),
      "Old way\n",
    );
  } finally {
    await rm(join(WORKSPACE, "bots/Delta"), { recursive: true, force: true });
  }
});

test("a lesson keeps only the files its job changed, and Undo keeps to them, to its thing's folder and to what it could not bring back", async () => {
  const { chmod, mkdir: makeDir } = await import("node:fs/promises");
  const { existsSync } = await import("node:fs");
  const { createWorkspaceTools } = await import(
    "../features/ai/tools/workspace.tool.ts"
  );
  const { openWorkspace } = await import("../features/workspace/workspace.ts");
  const { listLessons } = await import("../features/bot/lesson.query.ts");
  const { undoLesson } = await import("../features/bot/bot.lesson.ts");
  const { botLessonTable } = await import("../database/tables.ts");
  plans.set("Alpha", [() => text("Done.")]);
  const id = await startThread({
    bot: "Alpha",
    request: "Tidy up",
    label: "Tidying",
    from: "user",
  });
  await waitFor(id, "done");
  const shell = createWorkspaceTools(await openWorkspace(), {
    write: true,
    bot: "Echo",
    thread: id,
  });
  const run = (command: string) =>
    shell[T.bash].execute!(
      { command },
      { toolCallId: "tidy", messages: [], context: {} },
    );
  const folder = join(WORKSPACE, "bots/Echo");
  const skills = join(folder, ".agents/skills");
  const skill = "bots/Echo/.agents/skills/tidy";
  const rowOf = async (name: string) =>
    (await database.select().from(botLessonTable)).find(
      (row) => row.bot === "Echo" && row.name === name && !row.undoneAt,
    );
  await rm(folder, { recursive: true, force: true });
  // A skill the bot had before this job: its words, a reference, a picture
  await makeDir(join(WORKSPACE, skill), { recursive: true });
  await writeFile(
    join(WORKSPACE, skill, "SKILL.md"),
    "---\nname: tidy\ndescription: Tidy a folder by kind\n---\n# Steps\n",
  );
  await writeFile(join(WORKSPACE, skill, "ref.md"), "Reference\n");
  await writeFile(
    join(WORKSPACE, skill, "logo.png"),
    new Uint8Array([0x89, 0xff, 0xfe, 0x00]),
  );
  try {
    // One file changed: the lesson holds that file alone, told by the skill's description
    await run(`printf 'Reference, kinds first\\n' > ${skill}/ref.md`);
    let row = await rowOf("tidy");
    assert.deepEqual(Object.keys(row?.before?.files ?? {}), [
      `${skill}/ref.md`,
    ]);
    assert.deepEqual(Object.keys(row?.after?.files ?? {}), [`${skill}/ref.md`]);
    assert.equal(row?.line, "Tidy a folder by kind");
    // A file added in the same job folds into that lesson, from how the job found the skill
    await run(`printf 'Notes\\n' > ${skill}/notes.md`);
    row = await rowOf("tidy");
    assert.equal(row?.before?.files[`${skill}/ref.md`], "Reference\n");
    assert.deepEqual(Object.keys(row?.after?.files ?? {}).sort(), [
      `${skill}/notes.md`,
      `${skill}/ref.md`,
    ]);
    // Back as the job found it: no lesson left
    await run(
      `printf 'Reference\\n' > ${skill}/ref.md && rm ${skill}/notes.md`,
    );
    assert.equal(await rowOf("tidy"), undefined);

    // A folder a command leaves unreadable is not taken for everything in it removed
    try {
      await run("chmod 000 bots/Echo/.agents/skills");
    } finally {
      await chmod(skills, 0o755);
    }
    await run("true");
    assert.equal(await rowOf("tidy"), undefined);

    // Undo while another of the bot's commands runs: that command's change is still noted
    await run(
      `mkdir -p bots/Echo/memory && printf 'Old\\n' > bots/Echo/memory/other.md`,
    );
    const other = (await listLessons({ thread: id })).find(
      (one) => one.name === "other.md",
    );
    const slow = run(
      "printf 'In flight\\n' > bots/Echo/memory/inflight.md && sleep 0.4",
    );
    await waitUntil(
      async () => existsSync(join(folder, "memory/inflight.md")),
      "the slow command never wrote",
    );
    assert.equal(await undoLesson(other!.id), "Put back.");
    await slow;
    assert.ok(
      (await listLessons({ thread: id })).some(
        (one) => one.name === "inflight.md" && !one.undoneAt,
      ),
    );

    // A skill removed whole comes back but for its picture, which the answer names
    await run(`rm -rf ${skill}`);
    const removed = (await listLessons({ thread: id })).find(
      (one) => one.name === "tidy" && one.change === "removed",
    );
    assert.equal(
      await undoLesson(removed!.id),
      `Put back, but for ${skill}/logo.png: the app keeps no text of it, so it could not be brought back.`,
    );
    assert.equal(
      await readFile(join(WORKSPACE, skill, "ref.md"), "utf8"),
      "Reference\n",
    );

    // A row that names a path out of its thing's folder is refused before anything is touched
    await run(`printf 'Kept\\n' > bots/Echo/memory/kept.md`);
    const kept = await rowOf("kept.md");
    await database
      .update(botLessonTable)
      .set({
        after: {
          files: {
            "bots/Echo/memory/kept.md/../../../../escaped.md": "Kept\n",
          },
          unheld: [],
        },
      })
      .where(eq(botLessonTable.id, kept!.id));
    await assert.rejects(undoLesson(kept!.id), /outside what it changed/);
    await database
      .update(botLessonTable)
      .set({ name: "../../escaped" })
      .where(eq(botLessonTable.id, kept!.id));
    await assert.rejects(undoLesson(kept!.id), /not one note or skill/);
    assert.equal(existsSync(join(folder, "memory/kept.md")), true);
  } finally {
    await chmod(skills, 0o755).catch(() => {});
    await rm(folder, { recursive: true, force: true });
  }
});

test("natural turns send asynchronously and retain participant histories", async () => {
  plans.set("Alpha", [
    () =>
      call(T.bash, {
        command: "printf ALPHA_PRIVATE",
        description: "Read a private value.",
      }),
    () => ask("Beta", "Find the shared result"),
    () => text("I can work while Beta works."),
    (prompt) => {
      assert.ok(prompt.includes("BETA_SHARED"));
      assert.ok(!prompt.includes("BETA_PRIVATE"));
      return text("Final report");
    },
  ]);
  plans.set("Beta", [
    () =>
      call(T.bash, {
        command: "sleep 0.1; printf BETA_PRIVATE",
        description: "Read Beta's private value.",
      }),
    () => text("BETA_SHARED"),
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Work together",
    label: "Room",
    from: "user",
  });
  await waitFor(id, "done");
  assert.equal((await findThread(id))?.outcome, "Final report");
  assert.equal(
    (await listRoomWork(id)).filter((row) => row.bot === "Beta").length,
    1,
  );
  assert.equal(inputs.get("Beta")?.length, 2);
  const own = JSON.stringify(await listParticipantTranscript(id, "Beta"));
  assert.ok(own.includes("BETA_PRIVATE"));
  assert.ok(!own.includes("ALPHA_PRIVATE"));
  assert.ok(
    !(await rowsOf(id)).some((row) =>
      JSON.stringify(row.content).includes('"toolName":"answer"'),
    ),
  );
  plans.set("Alpha", [
    () => ask("Beta", "Follow up"),
    () => text("Waiting for the follow-up."),
    () => text("Follow-up report"),
  ]);
  plans.set("Beta", [
    (prompt) => {
      assert.ok(prompt.includes("BETA_PRIVATE"));
      return text("Follow-up findings");
    },
  ]);
  await answerThread(id, "Continue the work");
  await waitFor(id, "done");
  assert.equal((await findThread(id))?.outcome, "Follow-up report");
});

test("a question back to the caller is the turn's last words, and the answer is a new call", async () => {
  plans.set("Alpha", [
    () => ask("Beta", "Research"),
    () => text("Waiting."),
    (prompt) => {
      assert.ok(prompt.includes("Which format?"));
      return ask("Beta", "Use a table.");
    },
    () => text("Waiting for the research."),
    (prompt) => {
      assert.ok(prompt.includes("Research complete"));
      return text("Combined report");
    },
  ]);
  plans.set("Beta", [
    () => text("Which format?"),
    (prompt) => {
      // The same desk: what it asked is still in front of it
      assert.ok(prompt.includes("Which format?"));
      assert.ok(prompt.includes("Use a table."));
      return text("Research complete");
    },
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Choose the format and research",
    label: "Question",
    from: "user",
  });
  await waitFor(id, "done");
  assert.equal((await findThread(id))?.outcome, "Combined report");
  assert.equal((await listRoomWork(id)).length, 3);
});

test("a bot brought in holds no send_message, and its last words reach the caller once", async () => {
  plans.set("Alpha", [
    () => ask("Beta", "Research"),
    () => text("Waiting."),
    (prompt) => {
      assert.ok(prompt.includes("The findings, in full"));
      return text("Report built on the findings");
    },
  ]);
  plans.set("Beta", [() => text("The findings, in full")]);
  const before = inputs.get("Alpha")?.length ?? 0;
  const beforeBeta = offered.get("Beta")?.length ?? 0;
  const id = await startThread({
    bot: "Alpha",
    request: "Research and report",
    label: "Upward",
    from: "user",
  });
  await waitFor(id, "done");
  assert.equal((await findThread(id))?.outcome, "Report built on the findings");
  // Only the coordinator's seat can hand work out; the bot it brought in answers with its ending
  assert.ok(offered.get("Alpha")?.at(-1)?.includes(T.send_message));
  assert.ok(
    offered
      .get("Beta")
      ?.slice(beforeBeta)
      .every((tools) => !tools.includes(T.send_message)),
  );
  const rows = await listRoomWork(id);
  assert.equal(rows.length, 2);
  assert.ok(!rows.some((row) => row.bot === "Alpha" && row.caller === "Beta"));
  // Alpha ran three steps in all: nothing woke it a second time
  assert.equal((inputs.get("Alpha")?.length ?? 0) - before, 3);
  // Beta's first row is the job Alpha handed it, not the thread's first request
  const beta = JSON.stringify(await listParticipantTranscript(id, "Beta"));
  assert.ok(beta.includes("Alpha brings you into this thread"));
  assert.ok(beta.includes("Alpha → Beta: the job"));
  assert.ok(!beta.includes("Research and report"));
});

test("the coordinator starts each turn knowing what it handed out is still out", async () => {
  const beta = gate();
  const gamma = gate();
  plans.set("Alpha", [
    () => [
      ...ask("Beta", "Price the red chair"),
      ...ask("Gamma", "Price the blue chair"),
    ],
    () => {
      beta.open();
      return text("Both asked.");
    },
    (prompt) => {
      // Woken by Beta's answer: Gamma is still out, and the list says so
      assert.ok(prompt.includes("Red chair: $40"));
      assert.ok(prompt.includes("What you handed out that is not back yet"));
      assert.match(
        prompt,
        /- Gamma, (working|about to start) \(\d+ min\): \\"Price the blue chair\\"/,
      );
      gamma.open();
      return text("Waiting for Gamma.");
    },
    (prompt) => {
      assert.ok(prompt.includes("Everything you handed out is back."));
      return text("Both chairs priced.");
    },
  ]);
  plans.set("Beta", [
    async () => {
      await beta.shut;
      return text("Red chair: $40");
    },
  ]);
  plans.set("Gamma", [
    async () => {
      await gamma.shut;
      return text("Blue chair: $55");
    },
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Price both chairs",
    label: "Board",
    from: "user",
  });
  await waitFor(id, "done");
  assert.equal((await findThread(id))?.outcome, "Both chairs priced.");
  // The list is the coordinator's alone
  assert.ok(
    !JSON.stringify(await listParticipantTranscript(id, "Beta")).includes(
      "not back yet",
    ),
  );
});

test("a turn tried again after a break reads the list once", async () => {
  const beta = gate();
  plans.set("Alpha", [
    () => ask("Beta", "Price the red chair"),
    () => {
      beta.open();
      return text("Asked.");
    },
    () => [{ type: "error", error: "The stream broke in this test" }],
    (prompt) => {
      assert.equal(
        prompt.split("Everything you handed out is back.").length - 1,
        1,
      );
      return text("Red chair: $40.");
    },
  ]);
  plans.set("Beta", [
    async () => {
      await beta.shut;
      return text("Red chair: $40.");
    },
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Price the chair",
    label: "Board retry",
    from: "user",
  });
  assert.equal((await waitFor(id, "done")).outcome, "Red chair: $40.");
});

test("work handed out after another bot goes out with its answer once the coordinator has read it", async () => {
  const beta = gate();
  let gammaCalls = 0;
  plans.set("Alpha", [
    () => [
      ...ask("Beta", "Price the red chair"),
      ...call(T.send_message, {
        to: "Gamma",
        text: "Make a card with the red chair's price.",
        why: "the test's reason",
        after: ["Beta"],
      }),
    ],
    (prompt) => {
      // A fresh hand-off says what comes next; a held one says when it goes
      assert.ok(prompt.includes('after: [\\"Beta\\"]'));
      assert.ok(
        prompt.includes("Held: it goes to Gamma with Beta's answer attached"),
      );
      beta.open();
      return text("Both handed out.");
    },
    (prompt) => {
      // Beta is back, and the card waits for this turn to end: Alpha could still send Beta more
      assert.ok(prompt.includes("Red chair: $40."));
      assert.match(
        prompt,
        /- Gamma, goes out with Beta's answer when you end this turn/,
      );
      assert.equal((inputs.get("Gamma")?.length ?? 0) - gammaCalls, 0);
      return text("Waiting for Gamma.");
    },
    (prompt) => {
      assert.ok(prompt.includes("Card says $40"));
      return text("Card made.");
    },
  ]);
  plans.set("Beta", [
    async () => {
      await beta.shut;
      return text("Red chair: $40.");
    },
  ]);
  plans.set("Gamma", [
    (prompt) => {
      assert.ok(prompt.includes("Make a card with the red chair's price."));
      assert.ok(prompt.includes("## Beta's answer"));
      assert.ok(prompt.includes("Red chair: $40."));
      return text("Card says $40");
    },
  ]);
  gammaCalls = inputs.get("Gamma")?.length ?? 0;
  const id = await startThread({
    bot: "Alpha",
    request: "Price the chair and make a card",
    label: "After",
    from: "user",
  });
  // The hold is a row: it outlives a restart of the app
  const until = Date.now() + 5_000;
  let held: Awaited<ReturnType<typeof listRoomWork>>[number] | undefined;
  while (!held && Date.now() < until) {
    held = (await listRoomWork(id)).find((row) => row.bot === "Gamma");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(held?.state, "waiting");
  assert.deepEqual(held?.waitsFor, ["Beta"]);
  await waitFor(id, "done");
  assert.equal((await findThread(id))?.outcome, "Card made.");
  const gamma = (await listRoomWork(id)).find((row) => row.bot === "Gamma");
  assert.deepEqual(gamma?.waitsFor, []);
});

test("the office holds a hand-off in its tray and walks it out with the answer when it is seen to go", async () => {
  const beta = gate();
  const gamma = gate();
  plans.set("Alpha", [
    () => [
      ...ask("Beta", "Price the red chair"),
      ...call(T.send_message, {
        to: "Gamma",
        text: "Make a card with the red chair's price.",
        why: "the test's reason",
        after: ["Beta"],
      }),
    ],
    () => text("Both handed out."),
    () => text("Waiting for Gamma."),
    () => text("Card made."),
  ]);
  plans.set("Beta", [
    async () => {
      await beta.shut;
      return text("Red chair: $40.");
    },
  ]);
  plans.set("Gamma", [
    async () => {
      await gamma.shut;
      return text("Card says $40");
    },
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Price the chair and make a card",
    label: "Office",
    from: "user",
  });
  const read = watching(id);
  const rows = () => listRoomWork(id);
  try {
    // Alpha's turn over, Beta at work, the card waiting in Gamma's tray for Beta's answer
    await waitUntil(
      async () =>
        (await rows()).some(
          (row) =>
            row.bot === "Alpha" && !row.parentId && row.state === "waiting",
        ),
      "Alpha's first turn never ended",
    );
    const held = await read(10);
    assert.equal(seatAt(held.scene, "Gamma").label, "Held · after Beta");
    assert.equal(seatAt(held.scene, "Beta").label, "Working");
    assert.equal(
      seatAt(held.scene, "Alpha").label,
      "Waiting on Beta and Gamma",
    );
    // Only the bot at work has a plate to show; the held one and the one waiting on others
    // stand as they are, how they stand on their marks
    const plate = (bot: string) => plateOf(held.scene, bot, 10);
    assert.deepEqual(plate("Beta"), { tone: "work", words: "working" });
    assert.equal(plate("Gamma"), null);
    assert.equal(plate("Alpha"), null);
    // and a held bot has nothing of its own to show yet
    assert.equal(wordsOf(held.scene, "Gamma", 10), null);
    assert.equal(signOf(held.scene), "work");
    assert.deepEqual(
      held.scene.events.find(
        (event) => event.kind === "give" && event.to === "Gamma",
      )?.after,
      ["Beta"],
    );
    beta.open();
    // Out with Beta's answer once the turn that read it ended: walked when it is seen to go,
    // and the tray keeps the hand-off it held until the answers reach it
    await waitUntil(
      async () =>
        (await rows()).some(
          (row) => row.bot === "Gamma" && row.state === "running",
        ),
      "Gamma never started",
    );
    const out = await read(20);
    assert.equal(seatAt(out.scene, "Gamma").label, "Working");
    assert.equal(seatAt(out.scene, "Alpha").label, "Waiting on Gamma");
    const release = out.scene.events.find((event) => event.kind === "release");
    assert.deepEqual(
      [release?.from, release?.to, release?.text, release?.at],
      ["Alpha", "Gamma", "Make a card with the red chair's price.", 20],
    );
    assert.deepEqual(
      out.scene.events.find(
        (event) => event.kind === "give" && event.to === "Gamma",
      )?.after,
      ["Beta"],
    );
  } finally {
    // A failure above still lets the room finish, or the file waits out its silence timer
    beta.open();
    gamma.open();
  }
  await waitFor(id, "done");
  const done = await read(30);
  assert.deepEqual(done.office.bots, ["Alpha", "Beta", "Gamma"]);
  assert.deepEqual(
    done.scene.events.map((event) => [
      event.kind,
      event.from,
      event.to,
      event.text,
    ]),
    [
      ["job", "you", "Alpha", "Price the chair and make a card"],
      ["give", "Alpha", "Beta", "Price the red chair"],
      ["give", "Alpha", "Gamma", "Make a card with the red chair's price."],
      ["return", "Beta", "Alpha", "Red chair: $40."],
      ["release", "Alpha", "Gamma", "Make a card with the red chair's price."],
      ["return", "Gamma", "Alpha", "Card says $40"],
      ["report", "Alpha", "you", "Card made."],
    ],
  );
  // What happened while it was open is walked from when it was seen, not from when its words
  // began to be written
  assert.deepEqual(
    done.scene.events.slice(-2).map((event) => event.at),
    [30, 30],
  );
  assert.equal(seatAt(done.scene, "Gamma").label, "Answered");
  assert.equal(seatAt(done.scene, "Alpha").label, "Reported");
  assert.equal(reportAt(done.scene, 30)?.text, "Card made.");
  // Done, the helpers stand as they are and the coordinator's plate says its report is ready;
  // the report reads in full in its tab
  assert.equal(plateOf(done.scene, "Gamma", 30), null);
  assert.equal(plateOf(done.scene, "Beta", 30), null);
  assert.deepEqual(plateOf(done.scene, "Alpha", 30), {
    tone: "report",
    words: "report ready",
  });
  // Opened over them: the coordinator's report, a helper's last answer
  assert.deepEqual(wordsOf(done.scene, "Alpha", 30), {
    kind: "report",
    text: "Card made.",
  });
  assert.deepEqual(wordsOf(done.scene, "Gamma", 30), {
    kind: "answer",
    text: "Card says $40",
  });
  assert.equal(signOf(done.scene), "done");
  // Seen done: everyone leaps as the report reaches your counter, and Gamma hopped as the card it
  // held was let out to it; nothing leaps for what was there before the office opened
  const { momentOf, motionOf, restAt, stageOf, tricksOf, tripsOf } =
    await import("../features/bot/office.scene.ts");
  const trips = tripsOf(
    done.scene,
    stageOf(done.scene, { w: 1200, h: 800 }).plan,
  );
  const tricks = tricksOf(done.scene, trips, null);
  const reached = trips.find((trip) => trip.out === "report")?.arrive ?? 0;
  const cheers = tricks.filter((one) => one.kind === "cheer");
  assert.deepEqual(
    cheers.map((one) => one.bot),
    ["Alpha", "Beta", "Gamma"],
  );
  assert.ok(cheers.every((one) => one.at > reached));
  const letOut = trips.find((trip) => trip.out === "copy")?.arrive ?? 0;
  assert.ok(
    tricks.some(
      (one) => one.bot === "Gamma" && one.kind === "hop" && one.at > letOut,
    ),
  );
  assert.ok(tricks.every((one) => one.at >= done.scene.opened));
  // A first look at the finished room draws the card as sent: nothing it can read says it was held
  const late = await officeNow(id);
  assert.ok(!late.scene.events.some((event) => event.kind === "release"));
  assert.deepEqual(
    late.scene.events.find(
      (event) => event.kind === "give" && event.to === "Gamma",
    )?.after,
    [],
  );
  // Opened a minute after a finish not seen yet, everyone leaps once the office stands, not while
  // it builds; opened on one already seen, nobody does
  const after = sceneOf(
    late.office,
    watch(null, late.office, late.office.span + 60),
  );
  assert.equal(after.fresh, true);
  const lateTrips = tripsOf(after, stageOf(after, { w: 1200, h: 800 }).plan);
  assert.ok(
    !tricksOf(after, lateTrips, null).some((one) => one.kind === "cheer"),
  );
  const stood = after.opened + 1.2;
  const welcome = tricksOf(after, lateTrips, stood).filter(
    (one) => one.kind === "cheer",
  );
  assert.deepEqual(
    welcome.map((one) => one.bot),
    ["Alpha", "Beta", "Gamma"],
  );
  assert.ok(welcome.every((one) => one.at > stood));
  // Each throws four sheets that fly with the plates stepped back, lie on the floor still, and fade
  const lateStage = stageOf(after, { w: 1200, h: 800 });
  const all = tricksOf(after, lateTrips, stood);
  const sheetsAt = (t: number) => momentOf(after, lateStage, lateTrips, all, t);
  const thrown = Math.max(...welcome.map((one) => one.at));
  const flying = sheetsAt(thrown + 0.5);
  assert.equal(flying.tossed.length, 12);
  assert.ok(flying.hush && flying.tossed.some((sheet) => !sheet.landed));
  const lying = sheetsAt(thrown + 5);
  assert.equal(lying.tossed.length, 12);
  assert.ok(!lying.hush && lying.tossed.every((sheet) => sheet.landed));
  // nothing of the cheer moves while its sheets lie there
  assert.ok(
    restAt(motionOf(after, lateStage, lateTrips, welcome), thrown + 5) > 0,
  );
  assert.equal(sheetsAt(thrown + 12).tossed.length, 0);
  const seenOffice = { ...late.office, seen: true };
  const seen = sceneOf(
    seenOffice,
    watch(null, seenOffice, seenOffice.span + 60),
  );
  assert.equal(seen.fresh, false);
  assert.ok(
    !tricksOf(seen, lateTrips, stood).some((one) => one.kind === "cheer"),
  );
});

test("the office draws a bot on one exchange with the next let out beside it, and one report at a time", async () => {
  const card = gate();
  const held = gate();
  const blue = gate();
  const stateOf = async (id: string, bot: string) =>
    (await listRoomWork(id)).filter((row) => row.bot === bot);
  let id = "";
  plans.set("Alpha", [
    () => [
      ...ask("Beta", "Draft the card"),
      ...ask("Gamma", "Price the chair"),
    ],
    () =>
      call(T.send_message, {
        to: "Beta",
        text: "Add the price to the card.",
        why: "the test's reason",
        after: ["Gamma"],
      }),
    async () => {
      // The office is read while the price still waits on Gamma; then Gamma answers while this
      // turn is still at work, and its next step reads it
      await held.shut;
      await waitUntil(
        async () =>
          (await stateOf(id, "Gamma")).every((row) => row.state === "done"),
        "Gamma never answered",
      );
      return call(T.bash, { command: "true", description: "Check the folder" });
    },
    (prompt) => {
      assert.ok(prompt.includes("Chair: $40."));
      return text("Waiting on Beta.");
    },
    () => text("Waiting for the price on the card."),
    () => text("Done."),
    async () => {
      await blue.shut;
      return text("Made it blue.");
    },
  ]);
  plans.set("Beta", [
    async () => {
      await card.shut;
      return text("Card drafted.");
    },
    () => text("Card with $40."),
  ]);
  plans.set("Gamma", [() => text("Chair: $40.")]);
  id = await startThread({
    bot: "Alpha",
    request: "Draft a card with the chair's price",
    label: "One at a time",
    from: "user",
  });
  const read = watching(id);
  try {
    await waitUntil(
      async () =>
        (await stateOf(id, "Beta")).some((row) => row.waitsFor.length > 0),
      "The price was never held",
    );
    const first = await read(10);
    assert.equal(seatAt(first.scene, "Beta").label, "Working");
    assert.deepEqual(
      first.scene.events.findLast(
        (event) => event.kind === "give" && event.to === "Beta",
      )?.after,
      ["Gamma"],
    );
    held.open();
    // Let out with Gamma's answer as Alpha's turn ended: Beta is still on the draft, the price
    // queued behind it (room.query claimRoomWork)
    await waitUntil(
      async () =>
        (await stateOf(id, "Beta")).some(
          (row) => row.state === "queued" && row.waitsFor.length === 0,
        ),
      "The price never went out",
    );
    const out = await read(20);
    assert.ok(
      out.scene.events.some(
        (event) =>
          event.kind === "release" && event.to === "Beta" && event.at === 20,
      ),
    );
    assert.equal(seatAt(out.scene, "Alpha").label, "Waiting on Beta");
    assert.equal(seatAt(out.scene, "Beta").label, "Working");
  } finally {
    held.open();
    card.open();
  }
  await waitFor(id, "done");
  // The report, seen at your counter
  const reported = reportAt((await read(30)).scene, 30);
  assert.ok(reported);
  // Asked for more after the report: while Alpha is at it again, no report stands, and Alpha
  // carries the one it left back to its desk from when that was seen, rather than being put there
  await answerThread(id, "Also make it blue.", "user", "Alpha");
  try {
    const again = await read(40);
    assert.equal(seatAt(again.scene, "Alpha").label, "Working");
    assert.equal(reportAt(again.scene, 40), null);
    const { stageOf, tripsOf } = await import(
      "../features/bot/office.scene.ts"
    );
    const back = tripsOf(
      again.scene,
      stageOf(again.scene, { w: 1200, h: 800 }).plan,
    ).find((trip) => trip.out === "report");
    assert.deepEqual(
      [back?.home, back && back.stay >= 40, Number.isFinite(back?.back)],
      ["report", true, true],
    );
  } finally {
    blue.open();
  }
  await waitFor(id, "done");
  // One report stands at a time: the one taken back is kept only as closed
  const bluer = await read(50);
  const reports = bluer.scene.events.filter((event) => event.kind === "report");
  assert.deepEqual(
    reports.map((event) => [event.text, event.closed]),
    [
      [reported.text, 40],
      ["Made it blue.", null],
    ],
  );
  assert.equal(reportAt(bluer.scene, 50)?.text, "Made it blue.");
});

test("the office reads a turn that ended without words as the turn's end, never as a report", async () => {
  const beta = gate();
  plans.set("Alpha", [
    () => ask("Beta", "Price the chair"),
    // A turn over with no words while Beta works (room.query finishRoomWork)
    () => [],
    () => ask("Gamma", "Make the card"),
    () => text("Handed out."),
    // The last turn, silent with nothing out: the room goes idle, and nothing was reported
    () => [],
  ]);
  plans.set("Beta", [
    async () => {
      await beta.shut;
      return text("Chair: $40.");
    },
  ]);
  plans.set("Gamma", [() => text("Card made.")]);
  const id = await startThread({
    bot: "Alpha",
    request: "Price and card",
    label: "Silent turns",
    from: "user",
  });
  const read = watching(id);
  try {
    await waitUntil(
      async () =>
        (await listRoomWork(id)).some(
          (row) => row.bot === "Alpha" && row.state === "waiting",
        ),
      "Alpha's silent turn never ended",
    );
    const quiet = await read(10);
    assert.equal(seatAt(quiet.scene, "Alpha").label, "Waiting on Beta");
  } finally {
    beta.open();
  }
  await waitFor(id, "waiting");
  assert.match((await findThread(id))?.outcome ?? "", /idle/);
  const idle = await read(20);
  assert.ok(!idle.scene.events.some((event) => event.kind === "report"));
  assert.equal(seatAt(idle.scene, "Alpha").label, "Waiting");
  assert.equal(seatAt(idle.scene, "Gamma").label, "Answered");
});

test("a stop leaves the bots it cut off stopped and their questions closed, and later words are not an answer", async () => {
  plans.set("Alpha", [
    () => [...ask("Beta", "Long research"), ...ask("Thursday", "Which tone?")],
  ]);
  plans.set("Beta", [
    () =>
      call(T.bash, {
        command: "sleep 5; printf CUT_OFF",
        description: "Research in a cancellable process.",
      }),
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Research and write",
    label: "Stopped",
    from: "user",
  });
  // Beta on a step and Alpha asking you, when the stop comes
  await waitUntil(
    async () =>
      (await listRoomWork(id)).some((row) => row.state === "external") &&
      (await rowsOf(id)).some((row) =>
        JSON.stringify(row.content).includes("CUT_OFF"),
      ),
    "Beta never started, or Alpha never asked",
  );
  await cancelThread(id);
  plans.set("Alpha", [
    (prompt) => {
      assert.ok(prompt.includes("Go on without the research."));
      return text("Went on without it.");
    },
  ]);
  await answerThread(id, "Go on without the research.");
  await waitFor(id, "done");
  const { scene } = await officeNow(id);
  assert.equal(seatAt(scene, "Beta").label, "Stopped");
  assert.equal(seatAt(scene, "Alpha").label, "Reported");
  const words = scene.events.find(
    (event) => event.text === "Go on without the research.",
  );
  assert.equal(words?.kind, "tell");
  // The question the stop withdrew is taken back from your counter, with no answer on it
  const { stageOf, tripsOf } = await import("../features/bot/office.scene.ts");
  const stage = stageOf(scene, { w: 1200, h: 800 });
  const question = tripsOf(scene, stage.plan).find(
    (trip) => trip.out === "question",
  );
  assert.ok(question && Number.isFinite(question.back));
  assert.equal(question.answer, undefined);
});

test("the turn limit parks the room, and the office says so seat by seat", async () => {
  const turns = BOT_RUN.turns;
  BOT_RUN.turns = 2;
  plans.set("Alpha", [
    () => ask("Beta", "Price the chair"),
    () => text("Waiting for Beta."),
  ]);
  plans.set("Beta", [() => text("Chair: $40.")]);
  let id = "";
  try {
    id = await startThread({
      bot: "Alpha",
      request: "Price it",
      label: "Turn limit",
      from: "user",
    });
    await waitFor(id, "waiting");
  } finally {
    BOT_RUN.turns = turns;
  }
  assert.match((await findThread(id))?.outcome ?? "", /turn limit/);
  // Parked with no note: the rows say it
  const parked = await officeNow(id);
  assert.equal(seatAt(parked.scene, "Alpha").label, "Paused");
  assert.equal(plateOf(parked.scene, "Alpha", 60)?.tone, "you");
  // Parked at the limit, the job is paused, waiting on Continue
  assert.equal(signOf(parked.scene), "paused");
  // and no bot leaps by itself while it waits, however long the office stays open on it
  const { stageOf, tricksOf, tripsOf } = await import(
    "../features/bot/office.scene.ts"
  );
  const later = sceneOf(
    parked.office,
    watch(null, parked.office, parked.office.span + 100),
  );
  assert.deepEqual(
    tricksOf(
      later,
      tripsOf(later, stageOf(later, { w: 1200, h: 800 }).plan),
      later.opened + 1,
    ),
    [],
  );
  assert.equal(seatAt(parked.scene, "Beta").label, "Answered");
  plans.set("Alpha", [() => text("Priced at $40.")]);
  await answerThread(id, "Continue");
  await waitFor(id, "done");
  assert.equal(seatAt((await officeNow(id)).scene, "Alpha").label, "Reported");
});

test("the office reads any bot name, whatever a plain object already holds by it", async () => {
  const { momentOf, motionOf, restAt, stageOf, tricksOf, tripsOf } =
    await import("../features/bot/office.scene.ts");
  const at = new Date(Date.now() - 60_000);
  const line = (
    id: string,
    bot: string,
    rest: Record<string, unknown>,
  ): Record<string, unknown> => ({
    id,
    bot: { name: bot },
    text: "",
    at,
    ...rest,
  });
  const view = {
    id: "names",
    request: "Price it and card it",
    label: "Names",
    bot: { name: "constructor" },
    roster: [],
    status: "working",
    outcome: null,
    ask: null,
    seen: true,
    routineId: null,
    tokens: { input: 0, output: 0 },
    contextTokens: 0,
    contextBudget: 0,
    createdAt: at,
    updatedAt: at,
    room: {
      participants: [],
      questions: [],
      deliveries: [],
      relays: [],
      exchanges: [
        {
          id: "root",
          bot: "constructor",
          caller: "Thursday",
          state: "waiting",
          waitsFor: [],
        },
        {
          id: "x1",
          bot: "toString",
          caller: "constructor",
          state: "running",
          waitsFor: [],
        },
        {
          id: "x2",
          bot: "__proto__",
          caller: "constructor",
          state: "waiting",
          waitsFor: ["toString"],
        },
      ],
    },
    lines: [
      line("1-0", "constructor", {
        kind: "ask",
        to: { name: "toString" },
        text: "Price it",
        exchange: "x1",
        parent: "root",
      }),
      line("1-1", "constructor", {
        kind: "ask",
        to: { name: "__proto__" },
        text: "Card it",
        exchange: "x2",
        after: ["toString"],
        parent: "root",
      }),
      line("2-0", "toString", {
        kind: "tool",
        to: { name: "constructor" },
        tool: { name: "bash", input: "ls" },
        parent: "x1",
      }),
    ],
  } as unknown as Parameters<typeof officeOf>[0];
  const office = officeOf(view);
  const scene = sceneOf(office, watch(null, office, 60));
  assert.equal(seatAt(scene, "toString").label, "Working");
  assert.equal(seatAt(scene, "__proto__").label, "Held · after toString");
  assert.equal(
    seatAt(scene, "constructor").label,
    "Waiting on toString and __proto__",
  );
  const stage = stageOf(scene, { w: 1200, h: 800 });
  const trips = tripsOf(scene, stage.plan);
  const tricks = tricksOf(scene, trips, null);
  const moment = momentOf(scene, stage, trips, tricks, 61);
  // The held one waits on the one at work: a line over the floor from it to the held bot
  assert.deepEqual(
    moment.links.map((link) => link.id),
    ["toString>__proto__"],
  );
  // The clock rests between movements: nothing walks once the hand-offs have landed, and the bots'
  // own leaps come now and then from when the office opened, until an office left open goes still
  const spans = motionOf(scene, stage, trips, tricks);
  assert.ok(spans.length > 0);
  assert.ok(tricks.length > 0 && tricks.every((one) => one.at >= 60));
  assert.equal(restAt(spans, 1e6), Number.POSITIVE_INFINITY);
  assert.equal(restAt([[2, 3]], 2.5), 0);
  assert.equal(restAt([[2, 3]], 1), 1);
  assert.deepEqual(moment.tags.map((tag) => tag.bot).sort(), [
    "__proto__",
    "constructor",
    "toString",
  ]);
});

test("an answer that is a question back keeps the work held while the coordinator settles it", async () => {
  const first = gate();
  const second = gate();
  let gammaCalls = 0;
  plans.set("Alpha", [
    () => [
      ...ask("Beta", "Find the check-in date"),
      ...call(T.send_message, {
        to: "Gamma",
        text: "Build the itinerary from the check-in date.",
        why: "the test's reason",
        after: ["Beta"],
      }),
    ],
    () => {
      first.open();
      return text("Both handed out.");
    },
    (prompt) => {
      assert.ok(prompt.includes("Which hotel did you book?"));
      return ask("Beta", "The hotel is Casa Azul.");
    },
    () => text("Asked Beta again."),
    (prompt) => {
      // Beta was sent more in the turn that read its question, so the itinerary waited
      assert.ok(prompt.includes("Check-in: May 3"));
      assert.equal((inputs.get("Gamma")?.length ?? 0) - gammaCalls, 0);
      return text("Waiting for Gamma.");
    },
    (prompt) => {
      assert.ok(prompt.includes("Itinerary built"));
      return text("Done.");
    },
  ]);
  plans.set("Beta", [
    async () => {
      await first.shut;
      return text("Which hotel did you book?");
    },
    async () => {
      await second.shut;
      return text("Check-in: May 3");
    },
  ]);
  plans.set("Gamma", [
    (prompt) => {
      assert.ok(prompt.includes("Build the itinerary from the check-in date."));
      assert.ok(prompt.includes("Check-in: May 3"));
      assert.ok(!prompt.includes("Which hotel did you book?"));
      return text("Itinerary built");
    },
  ]);
  gammaCalls = inputs.get("Gamma")?.length ?? 0;
  const id = await startThread({
    bot: "Alpha",
    request: "Plan the stay",
    label: "After a question back",
    from: "user",
  });
  // The office keeps the itinerary held through the question back, while Beta is asked again
  const read = watching(id);
  try {
    await waitUntil(
      async () =>
        (await listRoomWork(id)).filter(
          (row) => row.bot === "Beta" && row.state === "running",
        ).length === 1 &&
        (await listRoomWork(id)).some(
          (row) => row.bot === "Beta" && row.state === "done",
        ),
      "Beta was never asked again",
    );
    const asked = await read(10);
    assert.ok(
      asked.scene.events.some(
        (event) =>
          event.kind === "return" && event.text === "Which hotel did you book?",
      ),
    );
    assert.equal(seatAt(asked.scene, "Gamma").label, "Held · after Beta");
    assert.ok(!asked.scene.events.some((event) => event.kind === "release"));
  } finally {
    second.open();
  }
  assert.equal((await waitFor(id, "done")).outcome, "Done.");
  // Let out with the check-in date, as the office saw it go: seen with the answers and the
  // report it made possible, it goes before them
  const done = await read(20);
  assert.equal(
    done.scene.events.find((event) => event.kind === "release")?.at,
    20,
  );
  assert.deepEqual(
    done.scene.events.slice(-3).map((event) => [event.kind, event.from]),
    [
      ["release", "Alpha"],
      ["return", "Gamma"],
      ["report", "Alpha"],
    ],
  );
  assert.equal(seatAt(done.scene, "Gamma").label, "Answered");
});

test("work sent after another to a bot already busy for you waits as a second hand-off", async () => {
  const draft = gate();
  const beta = gate();
  plans.set("Alpha", [
    () => [
      ...ask("Beta", "Price the red chair"),
      ...ask("Gamma", "Draft the card"),
    ],
    () =>
      call(T.send_message, {
        to: "Gamma",
        text: "Add the red chair's price to the card.",
        why: "the test's reason",
        after: ["Beta"],
      }),
    (prompt) => {
      // Gamma is on the draft; the price waits beside it rather than reaching it early
      assert.ok(
        prompt.includes("Held: it goes to Gamma with Beta's answer attached"),
      );
      draft.open();
      return text("Handed out.");
    },
    (prompt) => {
      assert.ok(prompt.includes("Card drafted"));
      beta.open();
      return text("Waiting for Beta.");
    },
    (prompt) => {
      assert.ok(prompt.includes("Red chair: $40."));
      return text("Waiting for the card.");
    },
    (prompt) => {
      assert.ok(prompt.includes("Card with $40"));
      return text("Done.");
    },
  ]);
  plans.set("Beta", [
    async () => {
      await beta.shut;
      return text("Red chair: $40.");
    },
  ]);
  plans.set("Gamma", [
    async (prompt) => {
      await draft.shut;
      assert.ok(!prompt.includes("Add the red chair's price"));
      return text("Card drafted");
    },
    (prompt) => {
      assert.ok(prompt.includes("Add the red chair's price to the card."));
      assert.ok(prompt.includes("## Beta's answer"));
      return text("Card with $40");
    },
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Draft a card with the price",
    label: "After, busy",
    from: "user",
  });
  assert.equal((await waitFor(id, "done")).outcome, "Done.");
  const gamma = (await listRoomWork(id)).filter((row) => row.bot === "Gamma");
  assert.equal(gamma.length, 2);
});

test("words from the user to a bot held for another's answer start it at once, and the answer follows", async () => {
  const beta = gate();
  const told = gate();
  plans.set("Alpha", [
    () => [
      ...ask("Beta", "Price the red chair"),
      ...call(T.send_message, {
        to: "Gamma",
        text: "Make a card with the red chair's price.",
        why: "the test's reason",
        after: ["Beta"],
      }),
    ],
    () => text("Both handed out."),
    async (prompt) => {
      // The office is read before this turn goes on
      await told.shut;
      // Woken by the card the user started; Gamma is still owed Beta's answer
      assert.ok(prompt.includes("Card started in blue"));
      assert.match(
        prompt,
        /- Gamma, done for now; Beta's answer follows once Beta is back/,
      );
      beta.open();
      return text("Waiting for Beta.");
    },
    () => text("Waiting for the card."),
    (prompt) => {
      assert.ok(prompt.includes("Card in blue at $40"));
      return text("Done.");
    },
  ]);
  plans.set("Beta", [
    async () => {
      await beta.shut;
      return text("Red chair: $40.");
    },
  ]);
  plans.set("Gamma", [
    (prompt) => {
      assert.ok(prompt.includes("Make a card with the red chair's price."));
      assert.ok(prompt.includes("Use a blue background."));
      assert.ok(!prompt.includes("## Beta's answer"));
      return text("Card started in blue");
    },
    (prompt) => {
      assert.ok(prompt.includes("## Beta's answer"));
      assert.ok(prompt.includes("Red chair: $40."));
      return text("Card in blue at $40");
    },
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Price the chair and make a card",
    label: "Held step-in",
    from: "user",
  });
  // Once Alpha's first turn is over and Gamma is held
  const until = Date.now() + 5_000;
  for (;;) {
    const rows = await listRoomWork(id);
    const alpha = rows.find((row) => row.bot === "Alpha" && !row.parentId);
    const gamma = rows.find((row) => row.bot === "Gamma");
    if (alpha?.state === "waiting" && gamma?.state === "waiting") break;
    assert.ok(Date.now() < until, "Gamma was never held");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const read = watching(id);
  const card = (scene: Awaited<ReturnType<typeof read>>["scene"]) =>
    scene.events.find((event) => event.kind === "give" && event.to === "Gamma");
  try {
    assert.equal(
      seatAt((await read(10)).scene, "Gamma").label,
      "Held · after Beta",
    );
    await answerThread(id, "Use a blue background.", "user", "Gamma");
    // Started by your words, it still waits for Beta's answer: nothing has gone out with it yet
    await waitUntil(
      async () =>
        (await listRoomWork(id)).some(
          (row) =>
            row.bot === "Gamma" &&
            row.state === "done" &&
            row.waitsFor.length > 0,
        ),
      "Gamma's first turn never ended",
    );
    const started = await read(20);
    assert.deepEqual(card(started.scene)?.after, ["Beta"]);
    assert.ok(!started.scene.events.some((event) => event.kind === "release"));
  } finally {
    told.open();
  }
  assert.equal((await waitFor(id, "done")).outcome, "Done.");
  const gamma = (await listRoomWork(id)).find((row) => row.bot === "Gamma");
  assert.deepEqual(gamma?.waitsFor, []);
  assert.equal(gamma?.state, "done");
  // The answer went out later, and the office walks it when it sees it go
  const done = await read(30);
  assert.equal(
    done.scene.events.find((event) => event.kind === "release")?.at,
    30,
  );
  assert.equal(seatAt(done.scene, "Gamma").label, "Answered");
});

test("after naming a bot already back and read sends at once with its answer; one with no work is refused", async () => {
  const beta = gate();
  plans.set("Alpha", [
    () => ask("Beta", "Price the red chair"),
    () => {
      beta.open();
      return text("Waiting.");
    },
    () =>
      call(T.send_message, {
        to: "Gamma",
        text: "Make a card.",
        why: "the test's reason",
        after: ["Designer"],
      }),
    (prompt) => {
      assert.ok(prompt.includes("Designer has no work from you to wait on"));
      return call(T.send_message, {
        to: "Gamma",
        text: "Make a card.",
        why: "the test's reason",
        after: ["beta"],
      });
    },
    (prompt) => {
      assert.ok(prompt.includes("Gamma has it now"));
      return text("Waiting for Gamma.");
    },
    () => text("Done."),
  ]);
  plans.set("Beta", [
    async () => {
      await beta.shut;
      return text("Red chair: $40.");
    },
  ]);
  plans.set("Gamma", [
    (prompt) => {
      assert.ok(prompt.includes("## Beta's answer"));
      return text("Card made.");
    },
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Price and card",
    label: "After, back already",
    from: "user",
  });
  await waitFor(id, "done");
  const gamma = (await listRoomWork(id)).find((row) => row.bot === "Gamma");
  assert.deepEqual(gamma?.waitsFor, []);
  // The office goes by the room's spelling, draws the card as plain work since Beta was back
  // and read, and the turned-down send as the room's own words, to the bot it was for
  const { office, scene } = await officeNow(id);
  assert.deepEqual(office.bots, ["Alpha", "Beta", "Gamma"]);
  const card = office.events.filter(
    (event) => event.kind === "give" && event.to === "Gamma",
  );
  assert.deepEqual(
    card.map((event) => event.after),
    [[]],
  );
  assert.ok(!office.events.some((event) => event.kind === "release"));
  const refused = office.events.find((event) => event.kind === "refused");
  assert.equal(refused?.to, "Gamma");
  assert.ok(refused?.text.includes("Designer has no work from you to wait on"));
  assert.equal(seatAt(scene, "Gamma").label, "Answered");
  assert.equal(seatAt(scene, "Alpha").label, "Reported");
});

test("work the user gives a bot directly shows on the coordinator's list as the user's", async () => {
  const red = gate();
  const blue = gate();
  plans.set("Alpha", [
    () => ask("Beta", "Price the red chair"),
    () => {
      red.open();
      return text("Asked.");
    },
    () => text("Red chair priced."),
    (prompt) => {
      assert.ok(prompt.includes("Everything you handed out is back."));
      assert.ok(prompt.includes("The user wrote to these bots directly"));
      assert.match(
        prompt,
        /- Beta, (working|about to start) \(\d+ min\): \\"Also price the blue chair\\"/,
      );
      blue.open();
      return text("Beta is on it.");
    },
    (prompt) => {
      assert.ok(prompt.includes("Blue chair: $55"));
      return text("Both priced.");
    },
  ]);
  plans.set("Beta", [
    async () => {
      await red.shut;
      return text("Red chair: $40");
    },
    async () => {
      await blue.shut;
      return text("Blue chair: $55");
    },
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Price the chairs",
    label: "Board, direct",
    from: "user",
  });
  await waitFor(id, "done");
  await answerThread(id, "Also price the blue chair", "user", "Beta");
  await answerThread(id, "How is it going?", "user", "Alpha");
  assert.equal((await waitFor(id, "done")).outcome, "Both priced.");
});

test("a bot the user writes to before any bot handed it work is told so", async () => {
  const { buildJoinOpening } = await import(
    "../features/ai/prompts/bot.prompt.ts"
  );
  const opening = JSON.stringify(
    buildJoinOpening({
      bot: "Beta",
      coordinator: "Alpha",
      job: null,
      request: "Price the chairs",
    }),
  );
  assert.ok(
    opening.includes(
      "The user writes to you in this thread, which Alpha coordinates",
    ),
  );
  assert.ok(opening.includes("## The thread's first request"));
  assert.ok(!opening.includes("the job"));
});

test("silent turns remain resumable without a forced answer or retry loop", async () => {
  plans.set("Alpha", [() => []]);
  const id = await startThread({
    bot: "Alpha",
    request: "Wait quietly",
    label: "Quiet",
    from: "user",
  });
  await waitFor(id, "waiting");
  assert.match((await findThread(id))?.outcome ?? "", /idle/);
  plans.set("Alpha", [() => text("Resumed normally")]);
  await answerThread(id, "Continue");
  await waitFor(id, "done");
});

test("a question pauses the bot that asked, and words to that bot answer it", async () => {
  plans.set("Alpha", [
    () => ask("Beta", "Prepare the work"),
    () => text("Waiting for Beta."),
    (prompt) => {
      // A bot brought in asks by ending with the question; the coordinator puts it to the user
      assert.ok(prompt.includes("Which destination should I prepare?"));
      return call(T.send_message, {
        to: "Thursday",
        text: "Choose a destination.",
        why: "the test's reason",
        kind: "question",
        options: ["Destination one", "Destination two"],
      });
    },
    (prompt) => {
      assert.ok(prompt.includes("Destination one"));
      assert.ok(prompt.includes("answers your question to the user"));
      return ask("Beta", "Destination one.");
    },
    () => text("Waiting for Beta."),
    () => text("Ready report"),
  ]);
  plans.set("Beta", [
    () => text("Which destination should I prepare?"),
    (prompt) => {
      assert.ok(prompt.includes("Destination one."));
      return text("Prepared");
    },
  ]);
  const alphaCalls = inputs.get("Alpha")?.length ?? 0;
  const id = await startThread({
    bot: "Alpha",
    request: "Prepare",
    label: "User input",
    from: "user",
  });
  const stopped = await waitFor(id, "waiting");
  assert.equal(stopped.pending?.bot, "Alpha");
  // The question ended Alpha's turn: no step after it before the answer
  assert.equal((inputs.get("Alpha")?.length ?? 0) - alphaCalls, 3);
  assert.deepEqual((await findThreadView(id))?.room?.questions[0].options, [
    "Destination one",
    "Destination two",
  ]);
  // A spoken answer names the bot, not the question
  const told = await answerThread(id, "Destination one", "thursday", "Alpha");
  assert.equal(told?.answered?.bot, "Alpha");
  await waitFor(id, "done");
  assert.equal((await findThread(id))?.outcome, "Ready report");
});

test("Continue offered as a choice answers the question rather than resuming a stop", async () => {
  plans.set("Alpha", [
    () =>
      call(T.send_message, {
        to: "Thursday",
        text: "Keep going with the long version?",
        why: "the test's reason",
        kind: "question",
        options: ["Continue", "Stop here"],
      }),
    (prompt) => {
      assert.ok(prompt.includes("answers your question to the user"));
      return text("Went on with the long version");
    },
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Choose",
    label: "Continue as a choice",
    from: "user",
  });
  const asking = await waitFor(id, "waiting");
  assert.ok(asking.pending?.messageId);
  const told = await answerThread(id, "Continue");
  assert.equal(told?.answered?.bot, "Alpha");
  assert.equal(
    (await waitFor(id, "done")).outcome,
    "Went on with the long version",
  );
});

test("resume repairs only missing local tool results and preserves real ones", () => {
  const transcript: any[] = [
    {
      role: "assistant",
      content: [
        { type: "tool-call", toolCallId: "one", toolName: T.bash, input: {} },
        { type: "tool-call", toolCallId: "two", toolName: T.bash, input: {} },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "one",
          toolName: T.bash,
          output: { type: "text", value: "Recorded result" },
        },
      ],
    },
  ];
  const restored = resumeTranscript(transcript);
  const output = JSON.stringify(restored);
  assert.equal(output.match(/Recorded result/g)?.length, 1);
  assert.equal(output.match(/No result:/g)?.length, 1);
  assert.deepEqual(resumeTranscript(restored), restored);
});

test("words to a bot already on a call join it, and committed sends deduplicate", async () => {
  const { insertThread } = await import("../features/bot/thread.query.ts");
  const { claimRoomWork, finishRoomWork, cancelRoom, consumeRoomInbox } =
    await import("../features/bot/room.query.ts");
  const thread = await insertThread({
    bot: "Alpha",
    request: "Queue",
    label: "Queue",
    opening: "Queue",
  });
  const root = (await claimRoomWork(thread.id))!;
  const receipt = await sendRoomMessage(root, {
    id: "same-send",
    to: "Beta",
    text: "One",
    why: "the test's reason",
  });
  assert.deepEqual(
    await sendRoomMessage(root, {
      id: "same-send",
      to: "Beta",
      text: "One",
      why: "the test\'s reason",
    }),
    receipt,
  );
  // Beta is already on a call from Alpha: more words join it rather than queue a second one
  const more = await sendRoomMessage(root, {
    id: "second-send",
    to: "Beta",
    text: "Two",
    why: "the test's reason",
  });
  assert.match(String(more.note), /already working for you/);
  const beta = (await claimRoomWork(thread.id))!;
  assert.equal(beta.bot, "Beta");
  assert.equal(await claimRoomWork(thread.id), null);
  assert.deepEqual(await consumeRoomInbox(beta), [
    "Alpha:\n\nOne",
    "Alpha:\n\nTwo",
  ]);
  // Words that arrive while it runs are read before its next step
  await sendRoomMessage(root, {
    id: "third-send",
    to: "Beta",
    text: "Three",
    why: "the test\'s reason",
  });
  assert.deepEqual(await consumeRoomInbox(beta), ["Alpha:\n\nThree"]);
  await finishRoomWork(beta, "One result");
  assert.equal(await claimRoomWork(thread.id), null);
  // Once it has answered, the next words are a new call
  await sendRoomMessage(root, {
    id: "fourth-send",
    to: "Beta",
    text: "Four",
    why: "the test\'s reason",
  });
  const again = (await claimRoomWork(thread.id))!;
  assert.equal(again.bot, "Beta");
  assert.notEqual(beta.id, again.id);
  await cancelRoom(thread.id);
  await assert.rejects(
    sendRoomMessage(root, {
      id: "stale",
      to: "Gamma",
      text: "Too late",
      why: "the test\'s reason",
    }),
    /no longer running/,
  );
  assert.equal((await listRoomWork(thread.id)).length, 3);
});

test("a kit script run from outside the workspace still delivers to the bot's own folder", async () => {
  const whole = join(WORKSPACE, botArtifacts("Alpha"));
  plans.set("Alpha", [
    () =>
      call(T.bash, {
        // The artifact kit's own resolution, loaded as its scripts load it
        command: `cd "$(mktemp -d)" && node --input-type=module -e 'const { ARTIFACTS } = await import(process.env.THURSDAY_SKILLS + "/artifact/runtime/shell/workspace.mjs"); console.log("ARTIFACTS=" + ARTIFACTS)'`,
        description: "Ask the kit where it delivers.",
      }),
    (prompt) => {
      // Up to the output's escaped newline; the command's own quoted text never matches
      assert.equal(prompt.match(/ARTIFACTS=([^\\"]+)/)?.[1], whole);
      return text("Delivered where it belongs.");
    },
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Where does a page go",
    label: "Kit folder",
    from: "user",
  });
  await waitFor(id, "done");
});

test("Step in is durable and reaches a running B before its next step", async () => {
  plans.set("Alpha", [
    () => ask("Beta", "Work for me"),
    () => text("Waiting."),
    () => text("Owner report"),
  ]);
  plans.set("Beta", [
    () =>
      call(T.bash, {
        command: "sleep 0.2; printf BEFORE_INTERJECTION",
        description: "Do current work.",
      }),
    (prompt) => {
      assert.ok(prompt.includes("Use the revised destination"));
      return text("Revised work");
    },
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Work",
    label: "Step in",
    from: "user",
  });
  const until = Date.now() + 2000;
  while (
    !(await rowsOf(id)).some((row) =>
      JSON.stringify(row.content).includes("BEFORE_INTERJECTION"),
    )
  ) {
    assert.ok(Date.now() < until);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  await answerThread(id, "Use the revised destination", "user", "Beta");
  await waitFor(id, "done");
  const view = (await findThreadView(id))!;
  assert.equal(
    view.room?.deliveries.find(
      (row) => row.text === "Use the revised destination",
    )?.delivered,
    true,
  );
  assert.ok(
    view.lines.some((line) => line.kind === "user" && line.to === "Beta"),
  );
  assert.equal(
    view.room?.relays.filter((row) => row.kind === "report").length,
    1,
  );
});

test("cancellation drains tools and preserves the participant on follow-up", async () => {
  plans.set("Alpha", [() => ask("Beta", "Long work"), () => text("Waiting.")]);
  plans.set("Beta", [
    () =>
      call(T.bash, {
        command: "sleep 5; printf TOO_LATE",
        description: "Wait in a cancellable process.",
      }),
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Long work",
    label: "Cancel",
    from: "user",
  });
  const until = Date.now() + 2000;
  while (
    !(await rowsOf(id)).some((row) =>
      JSON.stringify(row.content).includes("TOO_LATE"),
    )
  ) {
    assert.ok(Date.now() < until);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  await cancelThread(id);
  const rows = await rowsOf(id);
  assert.equal((await findThread(id))?.status, "cancelled");
  assert.ok(
    (await listRoomWork(id)).every(
      (row) => row.state === "done" || row.state === "cancelled",
    ),
  );
  plans.set("Alpha", [
    () => ask("Beta", "Pick up your saved work"),
    () => text("Waiting again."),
    () => text("Recovered report"),
  ]);
  plans.set("Beta", [
    (prompt) => {
      assert.ok(prompt.includes("TOO_LATE"));
      assert.ok(prompt.includes("Aborted"));
      return text("Checked current state and recovered");
    },
  ]);
  await answerThread(id, "Continue after cancellation");
  await waitFor(id, "done");
  assert.ok((await rowsOf(id)).length > rows.length);
  assert.equal(botBrowserSession(id, "Beta"), botBrowserSession(id, " beta "));
});

test("Stop all stops every thread at work and leaves one waiting on the user", async () => {
  plans.set("Alpha", [
    () =>
      call(T.bash, {
        command: "sleep 5; printf FIRST_AT_WORK",
        description: "Work that runs until stopped.",
      }),
    () =>
      call(T.bash, {
        command: "sleep 5; printf SECOND_AT_WORK",
        description: "Work that runs until stopped.",
      }),
  ]);
  plans.set("Beta", [() => ask("Thursday", "Which size?")]);
  const asking = await startThread({
    bot: "Beta",
    request: "Ask first",
    label: "Asks",
    from: "user",
  });
  await waitFor(asking, "waiting");
  const first = await startThread({
    bot: "Alpha",
    request: "Work one",
    label: "Work one",
    from: "user",
  });
  const second = await startThread({
    bot: "Alpha",
    request: "Work two",
    label: "Work two",
    from: "user",
  });
  const until = Date.now() + 2000;
  for (const [id, mark] of [
    [first, "_AT_WORK"],
    [second, "_AT_WORK"],
  ] as const)
    while (
      !(await rowsOf(id)).some((row) =>
        JSON.stringify(row.content).includes(mark),
      )
    ) {
      assert.ok(Date.now() < until);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

  const { loadTools } = await import("../features/ai/load-tools.ts");
  const tools = await loadTools({ target: "thursday" });
  const options = { toolCallId: "all", messages: [], context: {} };
  const stopped = (await tools[T.thread_cancel].execute!(
    { thread: "all" },
    options,
  )) as { stopped: string[]; status: string };
  // Every thread at work, whichever test left it running
  assert.ok(stopped.stopped.includes("Work one"));
  assert.ok(stopped.stopped.includes("Work two"));
  assert.ok(!stopped.stopped.includes("Asks"));
  const { listRunningThreadIds } = await import(
    "../features/bot/thread.query.ts"
  );
  assert.deepEqual(await listRunningThreadIds(), []);
  assert.equal((await findThread(first))?.status, "cancelled");
  assert.equal((await findThread(second))?.status, "cancelled");
  assert.equal((await findThread(asking))?.status, "waiting");
  for (const id of [first, second])
    assert.ok(
      (await listRoomWork(id)).every(
        (row) => row.state === "done" || row.state === "cancelled",
      ),
    );
  // Nothing at work: said, not an empty success
  assert.equal(
    await tools[T.thread_cancel].execute!({ thread: "ALL" }, options),
    "No thread is at work.",
  );
  await cancelThread(asking);
});

test("compaction and an arriving message preserve the same inbox on resume", async () => {
  plans.set("Alpha", [() => text("Before compaction")]);
  const id = await startThread({
    bot: "Alpha",
    request: "Compact",
    label: "Compaction",
    from: "user",
  });
  await waitFor(id, "done");
  const work = (await listRoomWork(id))[0];
  await upsertMessage(id, (await lastSeq(id)) + 1, {
    bot: "Alpha",
    parent: work.id,
    role: "assistant",
    content: "old material ".repeat(5000),
  });
  replies.set("Alpha", [() => "Preserved private summary."]);
  plans.set("Alpha", [
    (prompt) => {
      assert.ok(prompt.includes("Preserved private summary"));
      return text("After compaction");
    },
  ]);
  await answerThread(id, "Continue the same work");
  await waitFor(id, "done");
  const history = JSON.stringify(await listParticipantTranscript(id, "Alpha"));
  assert.ok(history.includes("Preserved private summary"));
  assert.ok(history.includes("After compaction"));
});

test("a desk asked to summarize itself does so at its next step, once, however small it is", async () => {
  plans.set("Alpha", [() => text("First answer")]);
  const id = await startThread({
    bot: "Alpha",
    request: "Small job",
    label: "Asked to compact",
    from: "user",
  });
  await waitFor(id, "done");

  askCompact(id, "Alpha");
  replies.set("Alpha", [() => "Summary the user asked for."]);
  plans.set("Alpha", [
    (prompt) => {
      assert.ok(prompt.includes("Summary the user asked for"));
      return text("Second answer");
    },
  ]);
  await answerThread(id, "Go on");
  await waitFor(id, "done");

  // Met once: the turn after runs on what is there, with no summary asked of the model
  plans.set("Alpha", [() => text("Third answer")]);
  await answerThread(id, "And again");
  await waitFor(id, "done");
  const history = JSON.stringify(await listParticipantTranscript(id, "Alpha"));
  assert.ok(history.includes("Third answer"));
  assert.equal(history.split("Summary the user asked for").length - 1, 1);
});

test("interrupted provider operations and incomplete arguments are not invented as local tool results", () => {
  const restored = resumeTranscript([
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "remote",
          toolName: T.web_search,
          input: {},
          providerExecuted: true,
        },
        {
          type: "tool-call",
          toolCallId: "partial",
          toolName: T.bash,
          input: '{"command":',
        },
      ],
    },
  ]);
  assert.ok(!restored.some((message) => message.role === "tool"));
  const projection = JSON.stringify(restored);
  assert.ok(projection.includes("remote execution state is unknown"));
  assert.ok(projection.includes("argument stream was interrupted"));
  assert.deepEqual(resumeTranscript(restored), restored);
});

test("a transcript as its words alone carries no thought and no tool, so nothing can be sent unpaired", async () => {
  const step = (n: number): any[] => [
    {
      role: "assistant",
      content: [
        {
          type: "reasoning",
          text: "",
          providerOptions: {
            openai: { itemId: `rs_${n}`, reasoningEncryptedContent: "enc" },
          },
        },
        {
          type: "tool-call",
          toolCallId: `call_${n}`,
          toolName: T.bash,
          input: { command: `step ${n}` },
          providerOptions: { openai: { itemId: `fc_${n}` } },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: `call_${n}`,
          toolName: T.bash,
          output: { type: "text", value: "x".repeat(2_000) },
        },
      ],
    },
  ];
  const words = asWords(
    [
      { role: "user", content: "The job" },
      ...[1, 2, 3].flatMap(step),
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Where it got to.",
            providerOptions: { openai: { itemId: "msg_1" } },
          },
        ],
      },
    ],
    (name, input) => `${name}: ${(input as { command: string }).command}`,
  );
  // What each step did and what was said, the steps of one reply as one plain message
  assert.deepEqual(words, [
    { role: "user", content: "The job" },
    {
      role: "assistant",
      content: [
        ...[1, 2, 3].map((n) => `${T.bash}: step ${n}`),
        "Where it got to.",
      ].join("\n"),
    },
  ]);

  // What a provider is sent: no thought, no call, no id to be found without its pair
  const { createOpenAI } = await import("@ai-sdk/openai");
  const { generateText } = await import("ai");
  let sent: { type?: string; id?: string }[] = [];
  const openai = createOpenAI({
    apiKey: "sk-test",
    fetch: async (_url, init) => {
      sent = JSON.parse(String(init?.body)).input;
      throw new Error("Captured, not sent");
    },
  });
  await generateText({
    model: openai.responses("gpt-5.6-luna"),
    messages: words,
    maxRetries: 0,
  }).catch(() => {});
  assert.equal(sent.length, 2);
  assert.ok(
    sent.every((item) => !item.type?.startsWith("reasoning") && !item.id),
  );
});

test("B keeps its history when the coordinator hands it more later in the same room", async () => {
  plans.set("Alpha", [
    () => ask("Beta", "First request"),
    () => text("Waiting for Beta"),
    () => ask("Gamma", "Second part"),
    () => text("Waiting for Gamma"),
    (prompt) => {
      assert.ok(prompt.includes("Gamma shared result"));
      return ask("Beta", "Next part, from Gamma's result");
    },
    () => text("Waiting for Beta"),
    (prompt) => {
      assert.ok(prompt.includes("Beta second result"));
      assert.ok(!prompt.includes("BETA_DESK_SECRET"));
      return text("Room complete");
    },
  ]);
  plans.set("Beta", [
    () =>
      call(T.bash, {
        command: "printf BETA_DESK_SECRET",
        description: "Read private work.",
      }),
    () => text("Beta first result"),
    (prompt) => {
      assert.ok(prompt.includes("BETA_DESK_SECRET"));
      assert.ok(prompt.includes("Next part, from Gamma's result"));
      return text("Beta second result");
    },
  ]);
  plans.set("Gamma", [
    (prompt) => {
      assert.ok(!prompt.includes("BETA_DESK_SECRET"));
      return text("Gamma shared result");
    },
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Keep the same team",
    label: "Team",
    from: "user",
  });
  await waitFor(id, "done");
  assert.equal(
    (await listRoomWork(id)).filter((work) => work.bot === "Beta").length,
    2,
  );
  assert.equal((await findThreadView(id))?.room?.participants.length, 3);
});

test("a direct follow-up to an idle B still returns the room's final report through A", async () => {
  plans.set("Alpha", [
    () => ask("Beta", "First work"),
    () => text("Waiting"),
    () => text("First report"),
  ]);
  plans.set("Beta", [() => text("First work complete")]);
  const id = await startThread({
    bot: "Alpha",
    request: "First work",
    label: "Direct follow-up",
    from: "user",
  });
  await waitFor(id, "done");
  plans.set("Beta", [
    (prompt) => {
      assert.ok(prompt.includes("First work complete"));
      assert.ok(prompt.includes("Change the detail"));
      return text("The detail is changed");
    },
  ]);
  plans.set("Alpha", [
    (prompt) => {
      assert.ok(prompt.includes("The detail is changed"));
      return text("Updated coordinator report");
    },
  ]);
  await answerThread(id, "Change the detail", "user", "Beta");
  await waitFor(id, "done");
  assert.equal((await findThread(id))?.outcome, "Updated coordinator report");
  assert.ok(
    (await listRoomRelays())
      .filter((relay) => relay.threadId === id && relay.kind === "report")
      .every((relay) => relay.bot === "Alpha"),
  );
});

test("simultaneous questions keep their own reply routes", async () => {
  plans.set("Alpha", [
    () => [
      ...call(T.send_message, {
        to: "Thursday",
        text: "Which destination?",
        why: "the test's reason",
        kind: "question",
      }),
      ...call(T.send_message, {
        to: "Thursday",
        text: "Which format?",
        why: "the test's reason",
        kind: "question",
      }),
    ],
    (prompt) => {
      assert.ok(prompt.includes("Destination One"));
      assert.ok(prompt.includes("Format Two"));
      return text("Both decisions applied");
    },
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Ask two things",
    label: "Questions",
    from: "user",
  });
  await waitFor(id, "waiting");
  const questions = (await findThreadView(id))!.room!.questions;
  assert.equal(questions.length, 2);
  const { loadTools } = await import("../features/ai/load-tools.ts");
  const tools = await loadTools({ target: "thursday" });
  // An answer names who asked; a bot that asked nothing is answered with who did
  const wrong = await tools[T.thread_answer].execute!(
    { thread: id, bot: "Beta", answer: "Unclear" },
    { toolCallId: "wrong", messages: [], context: {} },
  );
  assert.match(String(wrong), /is not asking anything/);
  assert.equal((await findThreadView(id))!.room!.questions.length, 2);
  const byText = (words: string) =>
    questions.find((question) => question.text === words)!.id;
  await answerThread(
    id,
    "Destination One",
    "user",
    "Alpha",
    byText("Which destination?"),
  );
  await waitFor(id, "waiting");
  assert.equal((await findThreadView(id))!.room!.questions.length, 1);
  await answerThread(
    id,
    "Format Two",
    "thursday",
    "Alpha",
    byText("Which format?"),
  );
  await waitFor(id, "done");
  assert.equal((await findThread(id))?.outcome, "Both decisions applied");
});

test("one answer from a call covers every question the bot has open", async () => {
  plans.set("Alpha", [
    () => [
      ...ask("Thursday", "Which destination?"),
      ...ask("Thursday", "Which format?"),
    ],
    (prompt) => {
      assert.ok(prompt.includes("answers your questions to the user"));
      assert.ok(prompt.includes("Which destination?"));
      assert.ok(prompt.includes("Which format?"));
      assert.ok(prompt.includes("Lisbon, as a PDF"));
      return text("Both settled");
    },
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Ask two things",
    label: "Questions, one answer",
    from: "user",
  });
  await waitFor(id, "waiting");
  assert.equal((await findThreadView(id))!.room!.questions.length, 2);
  // A call or a phone names only the bot: its answer settles both, and the bot reads which
  const { loadTools } = await import("../features/ai/load-tools.ts");
  const tools = await loadTools({ target: "thursday" });
  const told = (await tools[T.thread_answer].execute!(
    { thread: id, bot: "Alpha", answer: "Lisbon, as a PDF" },
    { toolCallId: "both", messages: [], context: {} },
  )) as { answered?: { bot: string } };
  assert.equal(told.answered?.bot, "Alpha");
  assert.equal((await waitFor(id, "done")).outcome, "Both settled");
});

test("a bot waiting on the user holds other messages until the answer", async () => {
  plans.set("Alpha", [
    () => [
      ...ask("Gamma", "Check the numbers"),
      ...ask("Thursday", "Which tone?"),
    ],
    (prompt) => {
      assert.ok(prompt.includes("Warm"));
      assert.ok(prompt.includes("Numbers are 42"));
      return text("Final report");
    },
  ]);
  plans.set("Gamma", [() => text("Numbers are 42")]);
  const alphaCalls = inputs.get("Alpha")?.length ?? 0;
  const id = await startThread({
    bot: "Alpha",
    request: "Draft with checked numbers",
    label: "Held inbox",
    from: "user",
  });
  await waitFor(id, "waiting");
  // Gamma's return arrived while Alpha waited on the user; Alpha has not run for it
  assert.equal((inputs.get("Alpha")?.length ?? 0) - alphaCalls, 1);
  const asking = await officeNow(id);
  assert.equal(seatAt(asking.scene, "Alpha").label, "Waiting on you");
  assert.deepEqual(plateOf(asking.scene, "Alpha", 60), {
    tone: "you",
    words: "needs you",
  });
  assert.equal(wordsOf(asking.scene, "Alpha", 60)?.kind, "question");
  assert.equal(seatAt(asking.scene, "Gamma").label, "Answered");
  const alpha = (await listRoomWork(id)).filter((row) => row.bot === "Alpha");
  assert.ok(
    alpha.every((row) => row.state !== "queued" && row.state !== "running"),
  );
  // The call answers by thread and the bot that asked; the question itself is found here
  const { loadTools } = await import("../features/ai/load-tools.ts");
  const tools = await loadTools({ target: "thursday" });
  const told = (await tools[T.thread_answer].execute!(
    { thread: id, bot: "Alpha", answer: "Warm" },
    { toolCallId: "warm", messages: [], context: {} },
  )) as { answered?: { bot: string } };
  assert.equal(told.answered?.bot, "Alpha");
  await waitFor(id, "done");
  assert.equal((inputs.get("Alpha")?.length ?? 0) - alphaCalls, 2);
  assert.equal((await findThread(id))?.outcome, "Final report");
});

test("a consumed inbox survives a crash before model execution and restart waits for a person", async () => {
  const { insertThread, deleteThread } = await import(
    "../features/bot/thread.query.ts"
  );
  const { claimRoomWork, consumeRoomInbox } = await import(
    "../features/bot/room.query.ts"
  );
  const { sweepThreads } = await import("../features/bot/bot.runner.ts");
  const thread = await insertThread({
    bot: "Alpha",
    request: "Crash window",
    label: "Crash window",
    opening: "Crash opening",
  });
  const root = (await claimRoomWork(thread.id))!;
  await sendRoomMessage(root, {
    id: "crash-message",
    to: "Beta",
    text: "Durable incoming message",
    why: "the test's reason",
  });
  const beta = (await claimRoomWork(thread.id))!;
  await consumeRoomInbox(beta);
  await sweepThreads();
  assert.equal((await findThread(thread.id))?.status, "waiting");
  plans.set("Beta", [
    (prompt) => {
      assert.equal(prompt.split("Durable incoming message").length - 1, 1);
      return text("Recovered delivery");
    },
  ]);
  plans.set("Alpha", [
    () => text("Awaiting recovery"),
    (prompt) => {
      assert.ok(prompt.includes("Recovered delivery"));
      return text("Crash recovered");
    },
  ]);
  await answerThread(thread.id, "Continue");
  await waitFor(thread.id, "done");
  await deleteThread(thread.id);
});

test("work runs with no browser on the stream, and a stop of the app's waits for a person", async () => {
  // Every test here runs unwatched: a phone, a routine and a server kept up from login
  // all start work with no tab open
  assert.equal(presence.watching, false);
  const { pauseThreads } = await import("../features/bot/bot.runner.ts");
  plans.set("Alpha", [
    () =>
      call(T.bash, {
        command: "sleep 5; printf UNWATCHED_BOUNDARY",
        description: "Wait for the boundary.",
      }),
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Unwatched",
    label: "Unwatched",
    from: "user",
  });
  const until = Date.now() + 2000;
  while (
    !(await rowsOf(id)).some((row) =>
      JSON.stringify(row.content).includes("UNWATCHED_BOUNDARY"),
    )
  ) {
    assert.ok(Date.now() < until);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  // The server going down is the one thing that parks it, and only a person picks it up
  await pauseThreads("The server was shut down while this was running.");
  assert.equal((await findThread(id))?.status, "waiting");
  // Parked, not at work: the office says so until Continue
  const parked = await officeNow(id);
  assert.equal(seatAt(parked.scene, "Alpha").label, "Paused");
  // Parked by the shutdown, the job is paused, waiting on Continue, as one parked at a limit is
  assert.equal(signOf(parked.scene), "paused");
  plans.set("Alpha", [
    (prompt) => {
      assert.ok(prompt.includes("UNWATCHED_BOUNDARY"));
      return text("Picked back up");
    },
  ]);
  await answerThread(id, "Continue");
  assert.equal((await waitFor(id, "done")).outcome, "Picked back up");
  const back = await officeNow(id);
  assert.equal(seatAt(back.scene, "Alpha").label, "Reported");
});

test("a late inbox message queues another turn atomically with completion", async () => {
  const { insertThread, deleteThread } = await import(
    "../features/bot/thread.query.ts"
  );
  const { claimRoomWork, consumeRoomInbox, finishRoomWork, tellRoom } =
    await import("../features/bot/room.query.ts");
  const thread = await insertThread({
    bot: "Alpha",
    request: "Late input",
    label: "Late input",
    opening: "Opening",
  });
  const run = (await claimRoomWork(thread.id))!;
  await consumeRoomInbox(run);
  await tellRoom(thread.id, "Arrived at completion", "The user");
  await finishRoomWork(run, "Earlier result");
  assert.equal((await findThread(thread.id))?.status, "running");
  const next = (await claimRoomWork(thread.id))!;
  assert.equal(next.id, run.id);
  assert.deepEqual(await consumeRoomInbox(next), [
    "The user, on screen: Arrived at completion",
  ]);
  await finishRoomWork(next, "Result after the message");
  assert.equal((await findThread(thread.id))?.status, "done");
  await deleteThread(thread.id);
});

test("provider adapters serialize interrupted tool history as complete exchanges", async () => {
  const { generateText, tool } = await import("ai");
  const z = await import("zod");
  const { createOpenAI } = await import("@ai-sdk/openai");
  const { createAnthropic } = await import("@ai-sdk/anthropic");
  const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
  const messages = resumeTranscript([
    { role: "user", content: "Inspect the existing file." },
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "interrupted-call",
          toolName: T.bash,
          input: { command: "cat saved.txt" },
          providerOptions: { google: { thoughtSignature: "saved-signature" } },
        },
      ],
    },
    { role: "user", content: "Continue after the interruption." },
  ]);
  let captured: any;
  const fetch = async (_url: unknown, init: any) => {
    captured = JSON.parse(init.body);
    throw new Error("WIRE_CAPTURED");
  };
  const factories = [
    () => createOpenAI({ apiKey: "test-key", fetch }).responses("test-model"),
    () => createAnthropic({ apiKey: "test-key", fetch })("test-model"),
    () => createGoogleGenerativeAI({ apiKey: "test-key", fetch })("test-model"),
  ];
  for (const [index, factory] of factories.entries()) {
    captured = undefined;
    await assert.rejects(
      generateText({
        model: factory(),
        messages,
        maxRetries: 0,
        tools: {
          [T.bash]: tool({ inputSchema: z.object({ command: z.string() }) }),
        },
      }),
      /WIRE_CAPTURED/,
    );
    assert.ok(captured, "The adapter reaches the HTTP boundary");
    const body = JSON.stringify(captured);
    assert.ok(body.includes("No result: execution was interrupted"));
    if (index === 0) assert.ok(body.includes("function_call_output"));
    if (index === 1) assert.ok(body.includes("tool_result"));
    if (index === 2) {
      assert.ok(body.includes("functionResponse"));
      assert.ok(body.includes("saved-signature"));
    }
  }
});

test("the assembled participant prompt names its return route and says who hands work out", async () => {
  const { loadBotPrompt } = await import(
    "../features/ai/prompts/bot.prompt.ts"
  );
  const { sendMessageSpec } = await import("../features/ai/tools/bot.tool.ts");
  const helper = await loadBotPrompt("Beta", "Use precise findings.", {
    thread: null,
    owner: "Alpha",
    caller: "Alpha",
  });
  assert.ok(helper.text.includes("Alpha → Beta"));
  assert.ok(helper.text.includes("Your final text goes back to Alpha"));
  assert.ok(helper.text.includes("Your final text is your answer to Alpha"));
  assert.ok(helper.text.includes("Alpha brings the other bots in, not you"));
  assert.ok(!helper.text.includes(`bring it in with \`${T.send_message}\``));
  assert.ok(!helper.text.includes("Message ID"));
  const coordinator = await loadBotPrompt("Alpha", null, {
    thread: null,
    owner: "Alpha",
    caller: "Thursday",
  });
  assert.ok(
    coordinator.text.includes(`bring it in with \`${T.send_message}\``),
  );
  assert.ok(
    coordinator.text.includes("The bots you bring in answer only to you"),
  );
  assert.ok(
    coordinator.text.includes(
      "End your turn when you have nothing more to do now",
    ),
  );
  assert.ok(!("replyTo" in sendMessageSpec.parameters.shape));
  assert.ok("after" in sendMessageSpec.parameters.shape);
  if (process.env.THURSDAY_TEST_SHOW_PROMPT)
    console.log(
      helper.text,
      "\n\n",
      coordinator.text,
      "\nTool:",
      sendMessageSpec.description,
    );
});

test("a bot is told to keep its skills in the folder the app lists to it alone", async () => {
  const { loadBotPrompt } = await import(
    "../features/ai/prompts/bot.prompt.ts"
  );
  const { ownSkills } = await import("../features/skills/skills.discover.ts");
  const { botFolder } = await import("../features/workspace/workspace.ts");
  const told = `${botFolder("Beta")}/.agents/skills`;
  const { text } = await loadBotPrompt("Beta", null);
  assert.ok(text.includes("## Your own skills"));
  assert.ok(text.includes(`\`${told}/\``));
  // The folder named is the one loadSkills reads for this bot, and no other bot's
  assert.ok(ownSkills("Beta").endsWith(told));
  assert.ok(!ownSkills("Alpha").endsWith(told));
});

test("a bot's prompt lists its other threads with its own last words, never the thread it is in", async () => {
  // Rows written in one second tie on `updatedAt`; a list long enough holds them all
  const { BOT_WORK } = await import("../config.ts");
  const { reads, recent } = BOT_WORK;
  BOT_WORK.reads = 1;
  BOT_WORK.recent = 50;
  const { insertThread, deleteThread, updateThread } = await import(
    "../features/bot/thread.query.ts"
  );
  const { claimRoomWork, finishRoomWork } = await import(
    "../features/bot/room.query.ts"
  );
  const { loadBotPrompt } = await import(
    "../features/ai/prompts/bot.prompt.ts"
  );
  const earlier = await insertThread({
    bot: "Alpha",
    request: "Compare the plans",
    label: "Plan comparison",
    opening: "Opening",
  });
  const root = (await claimRoomWork(earlier.id))!;
  await sendRoomMessage(root, {
    id: "other-threads-call",
    to: "Beta",
    text: "Price the three plans",
    why: "the test's reason",
  });
  const beta = (await claimRoomWork(earlier.id))!;
  await finishRoomWork(
    beta,
    "Three plans priced.\n\nThe table is at artifacts/Beta/plans.md.",
  );
  await updateThread(earlier.id, { status: "done" });
  const current = await insertThread({
    bot: "Beta",
    request: "Something new",
    label: "Current job",
    opening: "Opening",
  });

  // A long ending of its own: the line keeps its start and the file it names, and carries an id
  const long = await insertThread({
    bot: "Beta",
    request: "Write the long report on the three plans.",
    label: "Long report",
    opening: "Opening",
  });
  const words = `${"The report covers pricing, limits and support for all three plans in turn. ".repeat(3)}It is at artifacts/Beta/report.md.`;
  await finishRoomWork((await claimRoomWork(long.id))!, words);
  await updateThread(long.id, { status: "done" });

  const seat = {
    thread: current.id,
    owner: "Beta",
    caller: "Thursday",
    messageId: null,
  };
  const prompt = await loadBotPrompt("Beta", null, seat);
  assert.ok(prompt.text.includes("## Your other threads"));
  assert.ok(prompt.text.includes(`- "Plan comparison" — Alpha's — ended`));
  assert.ok(prompt.text.includes("Three plans priced. The table is at"));
  assert.ok(prompt.text.includes("`artifacts/Beta/plans.md`"));
  assert.ok(!prompt.text.includes('"Current job"'));
  const handle = long.id.slice(0, 6);
  assert.ok(
    prompt.text.includes(`- [${handle}] "Long report" — yours — ended`),
  );
  assert.ok(!prompt.text.includes(words), "the line is cut");
  assert.ok(prompt.text.includes("`artifacts/Beta/report.md`"));
  assert.ok(
    prompt.text.includes(`\`${T.thread_recall}\` opens that one whole`),
  );
  if (process.env.THURSDAY_TEST_SHOW_PROMPT)
    console.log(
      prompt.text.slice(
        prompt.text.indexOf("## Your other threads"),
        prompt.text.indexOf("## Bots"),
      ),
    );

  // The tool opens a cut line whole, once a turn, and only so many of them
  const { createThreadRecallTool } = await import(
    "../features/ai/tools/bot.tool.ts"
  );
  const held = await createThreadRecallTool("Beta", current.id);
  // A ToolSet erases its input type; what is under test is the call itself
  type Recall = (
    input: { id: string },
    options: { toolCallId: string; messages: [] },
  ) => Promise<unknown>;
  const run = (tools: import("ai").ToolSet) => (id: string) =>
    (tools[T.thread_recall].execute as unknown as Recall)(
      { id },
      { toolCallId: id, messages: [] },
    );
  const open = run(held);
  assert.match(
    String(await open("nothing")),
    /No thread "nothing" on your list/,
  );
  assert.equal(
    await open("Plan comparison"),
    "Its line already shows all of it.",
  );
  const whole = String(await open(`[${handle}]`));
  assert.ok(whole.includes("You were asked: Write the long report"));
  assert.ok(whole.includes(words));
  assert.equal(await open(handle), "Already opened above, this turn.");
  const second = await insertThread({
    bot: "Beta",
    request: "Another long one.",
    label: "Second report",
    opening: "Opening",
  });
  await finishRoomWork((await claimRoomWork(second.id))!, words);
  await updateThread(second.id, { status: "done" });
  const again = await createThreadRecallTool("Beta", current.id);
  const reopen = run(again);
  await reopen(handle);
  assert.match(
    String(await reopen(second.id.slice(0, 6))),
    /1 threads are open already this turn/,
  );
  BOT_WORK.reads = reads;
  BOT_WORK.recent = recent;

  // Nothing cut, nothing to open: a bot whose lines all fit is handed no tool
  await deleteThread(long.id);
  await deleteThread(second.id);
  const { listBotWork } = await import("../features/bot/thread.query.ts");
  const left = await listBotWork("Beta", current.id);
  const anyCut = [...left.open, ...left.recent].some((line) => line.cut);
  assert.equal(
    T.thread_recall in (await createThreadRecallTool("Beta", current.id)),
    anyCut,
  );

  await deleteThread(earlier.id);
  await deleteThread(current.id);
});

test("a routine's next start is the next listed day at its time, and an interval counts from now", async () => {
  const { nextRun, scheduleText } = await import(
    "../features/routine/routine.schema.ts"
  );
  // 2026-09-18 is a Friday
  const friday = new Date(2026, 8, 18, 10, 0, 0);
  const weekdays = {
    kind: "daily" as const,
    time: "09:00",
    days: [1, 2, 3, 4, 5],
  };
  assert.deepEqual(nextRun(weekdays, friday), new Date(2026, 8, 21, 9, 0, 0));
  assert.deepEqual(
    nextRun({ ...weekdays, time: "18:30" }, friday),
    new Date(2026, 8, 18, 18, 30, 0),
  );
  assert.deepEqual(
    nextRun({ kind: "daily", time: "10:00", days: [5] }, friday),
    new Date(2026, 8, 25, 10, 0, 0),
    "the same minute is not after it",
  );
  assert.deepEqual(
    nextRun({ kind: "every", hours: 6 }, friday),
    new Date(2026, 8, 18, 16, 0, 0),
  );
  assert.equal(scheduleText(weekdays), "Daily 09:00 · Mon–Fri");
  assert.equal(
    scheduleText({ kind: "daily", time: "09:00", days: [1, 2, 3, 4, 5, 6, 7] }),
    "Daily 09:00",
  );
  assert.equal(
    scheduleText({ kind: "daily", time: "10:00", days: [1] }),
    "Mon 10:00",
  );
  assert.equal(
    scheduleText({ kind: "daily", time: "08:00", days: [1, 3, 5] }),
    "Daily 08:00 · Mon Wed Fri",
  );
  assert.equal(scheduleText({ kind: "every", hours: 1 }), "Every hour");
});

test("the call makes, reads and removes a routine", async () => {
  const { createRoutineTools } = await import(
    "../features/ai/tools/routine.tool.ts"
  );
  type Run = (
    input: Record<string, unknown>,
    options: { toolCallId: string; messages: [] },
  ) => Promise<unknown>;
  const routine = (input: Record<string, unknown>) =>
    (createRoutineTools()[T.routine].execute as unknown as Run)(input, {
      toolCallId: "routine",
      messages: [],
    });
  const job = { bot: "alpha", label: "Note check", request: "Do the check." };

  assert.match(
    String(await routine({ action: "create", ...job })),
    /Say when it starts/,
  );
  assert.match(
    String(
      await routine({ action: "create", ...job, time: "09:00", everyHours: 6 }),
    ),
    /Give one of `at`, `time` or `everyHours`/,
  );
  assert.match(
    String(
      await routine({ action: "create", ...job, bot: "Nobody", time: "09:00" }),
    ),
    /There is no bot called "Nobody"/,
  );

  const held = (await routine({
    action: "create",
    ...job,
    time: "09:00",
    days: [1, 2, 3, 4, 5],
  })) as { id: string; when: string; bot: string; note: string };
  assert.equal(held.bot, "Alpha");
  assert.equal(held.when, "Daily 09:00 · Mon–Fri");
  // A time is a promise kept whether or not anyone has the app open
  assert.ok(!held.note.includes("only while the app is open"));

  const listed = (await routine({ action: "list" })) as {
    routines: { id: string; enabled: boolean }[];
  };
  assert.ok(listed.routines.some((one) => one.id === held.id && one.enabled));
  const off = (await routine({
    action: "change",
    routine: "note check",
    enabled: false,
    everyHours: 6,
  })) as { enabled: boolean; when: string };
  assert.deepEqual([off.enabled, off.when], [false, "Every 6 hours"]);
  assert.match(
    String(await routine({ action: "delete", routine: held.id })),
    /starts no more/,
  );
});

test("a routine opens one thread when it is due, skips while its last run is open, and waits for its bot", async () => {
  const { routineTable } = await import("../database/tables.ts");
  const { createRoutine, deleteRoutine, findRoutine } = await import(
    "../features/routine/routine.query.ts"
  );
  const { startDueRoutines, runRoutineNow } = await import(
    "../features/routine/routine.clock.ts"
  );
  const { deleteThread } = await import("../features/bot/thread.query.ts");
  const routine = await createRoutine({
    bot: "alpha",
    label: "Morning check",
    request: "Check what came in since the last run.",
    schedule: { kind: "every", hours: 1 },
  });
  assert.equal(routine.bot, "Alpha", "the bot's own spelling is kept");
  const due = () =>
    database
      .update(routineTable)
      .set({ nextRunAt: new Date(Date.now() - 60_000) })
      .where(eq(routineTable.id, routine.id));
  const runs = async () => (await findRoutine(routine.id))!.runs;

  // Not due yet: nothing opens
  await startDueRoutines();
  assert.equal((await runs()).length, 0);

  // Due, and two looks at once open one thread between them
  await due();
  plans.set("Alpha", [
    (prompt) => {
      assert.ok(prompt.includes("A routine the user set up hands you"));
      assert.ok(prompt.includes("Every hour"));
      assert.ok(prompt.includes("This is its first run."));
      return text("Nothing new since yesterday.");
    },
  ]);
  await Promise.all([startDueRoutines(), startDueRoutines()]);
  assert.equal((await runs()).length, 1);
  const first = (await runs())[0];
  await waitFor(first.id, "done");
  assert.equal((await findThreadView(first.id))?.routineId, routine.id);
  assert.ok(
    (await findRoutine(routine.id))!.nextRunAt > new Date(),
    "moved on to its next time",
  );

  // The next run is told how the last one ended, and stands in for its unread ending
  await due();
  plans.set("Alpha", [
    (prompt) => {
      assert.ok(prompt.includes("Its last run ended"));
      assert.ok(prompt.includes("Nothing new since yesterday."));
      return ask("Thursday", "Which folder do the drafts go in?");
    },
  ]);
  await startDueRoutines();
  const second = (await runs())[0];
  assert.notEqual(second.id, first.id);
  await waitFor(second.id, "waiting");
  assert.equal((await findThread(first.id))?.seen, true);

  // A run still open is never stacked on: the time is skipped, by the clock and by hand
  await due();
  await startDueRoutines();
  assert.equal((await runs()).length, 2);
  assert.ok((await findRoutine(routine.id))!.nextRunAt > new Date());
  await assert.rejects(runRoutineNow(routine.id), /still open/);

  // A bot that cannot take a job holds the routine where it is, and it starts once the bot is back
  await cancelThread(second.id);
  await database
    .update(botTable)
    .set({ disabled: true })
    .where(eq(botTable.name, "Alpha"));
  await due();
  await startDueRoutines();
  assert.equal((await runs()).length, 2);
  assert.ok((await findRoutine(routine.id))!.nextRunAt < new Date(), "held");
  await database
    .update(botTable)
    .set({ disabled: false })
    .where(eq(botTable.name, "Alpha"));
  plans.set("Alpha", [() => text("Two new messages.")]);
  await startDueRoutines();
  const third = (await runs())[0];
  assert.equal((await runs()).length, 3);
  await waitFor(third.id, "done");

  await deleteRoutine(routine.id);
  assert.equal((await findThread(third.id))?.routineId, routine.id);
  for (const run of [first, second, third]) await deleteThread(run.id);
});

test("a routine's run the app has to stop ends there, and the routine starts again at its next time", async () => {
  const { routineTable } = await import("../database/tables.ts");
  const { createRoutine, deleteRoutine, findRoutine } = await import(
    "../features/routine/routine.query.ts"
  );
  const { startDueRoutines } = await import(
    "../features/routine/routine.clock.ts"
  );
  const { insertThread, deleteThread } = await import(
    "../features/bot/thread.query.ts"
  );
  const { claimRoomWork } = await import("../features/bot/room.query.ts");
  const { sweepThreads } = await import("../features/bot/bot.runner.ts");
  const routine = await createRoutine({
    bot: "Alpha",
    label: "Inbox check",
    request: "Check what came in since the last run.",
    schedule: { kind: "every", hours: 1 },
  });
  const due = () =>
    database
      .update(routineTable)
      .set({ nextRunAt: new Date(Date.now() - 60_000) })
      .where(eq(routineTable.id, routine.id));
  const runs = async () => (await findRoutine(routine.id))!.runs;
  const stops = async (id: string) =>
    (await listRoomRelays()).filter(
      (relay) => relay.threadId === id && relay.kind === "interrupted",
    );

  // A provider's refusal: any other job would wait on Continue
  plans.set("Alpha", [
    () => [
      {
        type: "error",
        error: new APICallError({
          message: "Invalid API key",
          url: "https://provider.test/v1",
          requestBodyValues: {},
          statusCode: 401,
          isRetryable: false,
        }),
      },
    ],
  ]);
  await due();
  await startDueRoutines();
  const first = (await runs())[0];
  const ended = await waitFor(first.id, "cancelled");
  assert.equal(ended.outcome, "Invalid API key (401)");
  assert.equal(ended.pending, null);
  assert.ok(ended.endedAt);
  assert.equal(ended.seen, false, "an ending nobody has read");
  assert.ok(
    (await listRoomWork(first.id)).every((row) => row.state === "cancelled"),
    "nothing is left to continue",
  );
  // The call and a phone hear of it once, in its own words
  assert.deepEqual(
    (await stops(first.id)).map((relay) => relay.text),
    ["Invalid API key (401)"],
  );
  // and why it stopped is there for a follow-up that picks it back up
  assert.ok(
    (await rowsOf(first.id)).some(
      (row) => row.note && String(row.content).startsWith("Invalid API key"),
    ),
  );

  // Its next time starts a run, which stands in for the one that failed
  plans.set("Alpha", [() => text("Nothing new.")]);
  await due();
  await startDueRoutines();
  const second = (await runs())[0];
  assert.notEqual(second.id, first.id);
  await waitFor(second.id, "done");
  assert.equal((await findThread(first.id))?.seen, true);
  assert.equal((await stops(first.id)).length, 0);

  // The room's own limit ends a run the same way
  const turns = BOT_RUN.turns;
  BOT_RUN.turns = 2;
  plans.set("Alpha", [
    () => ask("Beta", "Price the chair"),
    () => text("Waiting for Beta."),
  ]);
  plans.set("Beta", [() => text("Chair: $40.")]);
  let limited = "";
  try {
    limited = await startThread({
      bot: "Alpha",
      request: "Price it",
      label: "Inbox check",
      from: "user",
      routine: { id: routine.id, when: "Every hour", last: null },
    });
    assert.match(
      (await waitFor(limited, "cancelled")).outcome ?? "",
      /turn limit/,
    );
  } finally {
    BOT_RUN.turns = turns;
  }
  assert.ok(
    (await listRoomWork(limited)).every(
      (row) => row.state === "done" || row.state === "cancelled",
    ),
  );

  // and so does a restart that finds one running
  const left = await insertThread({
    bot: "Alpha",
    request: "Left running",
    label: "Inbox check",
    routineId: routine.id,
    opening: "Left running",
  });
  await claimRoomWork(left.id);
  await sweepThreads();
  const swept = await findThread(left.id);
  assert.equal(swept?.status, "cancelled");
  assert.match(swept?.outcome ?? "", /The server restarted/);

  await deleteRoutine(routine.id);
  for (const id of [first.id, second.id, limited, left.id])
    await deleteThread(id);
});

test("a once-only routine waits out an open run, and the schedule it has, sent again, restarts nothing", async () => {
  const { routineTable } = await import("../database/tables.ts");
  const { createRoutine, deleteRoutine, findRoutine, updateRoutine } =
    await import("../features/routine/routine.query.ts");
  const { startDueRoutines, runRoutineNow } = await import(
    "../features/routine/routine.clock.ts"
  );
  const { deleteThread } = await import("../features/bot/thread.query.ts");
  const later = new Date(Date.now() + 3_600_000);
  const two = (n: number) => String(n).padStart(2, "0");
  const at = `${later.getFullYear()}-${two(later.getMonth() + 1)}-${two(later.getDate())} ${two(later.getHours())}:${two(later.getMinutes())}`;
  const routine = await createRoutine({
    bot: "Alpha",
    label: "Once only",
    request: "Say hello once.",
    schedule: { kind: "once", at },
  });
  const now = async () => (await findRoutine(routine.id))!;

  // Stopped by the user, then its own moment sent again ("Once" pressed twice): still off
  await updateRoutine(routine.id, { enabled: false });
  const kept = (await now()).nextRunAt;
  await updateRoutine(routine.id, { schedule: { kind: "once", at } });
  assert.equal((await now()).enabled, false);
  assert.equal(+(await now()).nextRunAt, +kept);
  await updateRoutine(routine.id, { enabled: true });

  // Run by hand and still open at its moment: held, rather than switched off unmade
  plans.set("Alpha", [() => ask("Thursday", "Which greeting?")]);
  const byHand = await runRoutineNow(routine.id);
  await waitFor(byHand, "waiting");
  await database
    .update(routineTable)
    .set({ nextRunAt: new Date(Date.now() - 60_000) })
    .where(eq(routineTable.id, routine.id));
  await startDueRoutines();
  assert.equal((await now()).enabled, true, "held while its run is open");
  assert.equal((await now()).runs.length, 1);

  // Once that run closes, its own start is made, and then it is spent
  await cancelThread(byHand);
  plans.set("Alpha", [() => text("Hello.")]);
  await startDueRoutines();
  const runs = (await now()).runs;
  assert.equal(runs.length, 2);
  assert.equal((await now()).enabled, false);
  await waitFor(runs[0].id, "done");

  await deleteRoutine(routine.id);
  for (const run of runs) await deleteThread(run.id);
});

test("with nobody picking, a bot runs on the plan before a key, and a picked default whose key is gone stops the run", async () => {
  const { resolveDefaultModel } = realModel;
  const { TEXT_MODEL_PROVIDERS } = await import(
    "../features/ai/model.schema.ts"
  );
  const { writeConfig, removeConfig } = await import(
    "../features/config/config.query.ts"
  );
  const { DEFAULT_MODEL_KEY } = await import(
    "../features/config/config.const.ts"
  );
  const plan = TEXT_MODEL_PROVIDERS.chatgpt.apiKeyName;
  const key = TEXT_MODEL_PROVIDERS.openai.apiKeyName;
  const xai = TEXT_MODEL_PROVIDERS.xai.apiKeyName;
  // `.env` wins over a row (readConfig): what this machine exports stays out of it
  const exported = Object.fromEntries(
    [plan, key, xai].map((name) => [name, process.env[name]]),
  );
  for (const name of [plan, key, xai]) delete process.env[name];
  const signIn = (kind: string) =>
    JSON.stringify({
      access: "test.access.token",
      refresh: "test-refresh",
      expires: Date.now() + 3_600_000,
      accountId: "test-account",
      plan: kind,
    });
  await writeConfig(key, "sk-test");
  await writeConfig(plan, signIn("plus"));
  try {
    // Signed in and keyed: the plan is paid for already, the key bills — and on the plan it
    // is the middle model, while a Free plan runs the one model it opens
    assert.deepEqual(await resolveDefaultModel(), {
      provider: "chatgpt",
      model: "gpt-6.1-sol",
    });
    await writeConfig(plan, signIn("free"));
    assert.equal((await resolveDefaultModel()).model, "gpt-6-luna");
    await removeConfig(plan);
    assert.equal((await resolveDefaultModel()).provider, "openai");
    // Picked in Settings, and its key gone: said, never moved to the OpenAI key beside it
    await writeConfig(DEFAULT_MODEL_KEY, "xai/grok-4");
    await assert.rejects(resolveDefaultModel(), /no xAI key/);
  } finally {
    for (const name of [plan, key, DEFAULT_MODEL_KEY]) await removeConfig(name);
    for (const [name, value] of Object.entries(exported))
      if (value !== undefined) process.env[name] = value;
  }
});

test("a model on the plan asks for the web as Codex asks that endpoint", async () => {
  const { generateText } = await import("ai");
  const { TEXT_MODEL_PROVIDERS } = await import(
    "../features/ai/model.schema.ts"
  );
  const { writeConfig, removeConfig } = await import(
    "../features/config/config.query.ts"
  );
  const plan = TEXT_MODEL_PROVIDERS.chatgpt.apiKeyName;
  const exported = process.env[plan];
  delete process.env[plan];
  await writeConfig(
    plan,
    JSON.stringify({
      access: "test.access.token",
      refresh: "test-refresh",
      expires: Date.now() + 3_600_000,
      accountId: "test-account",
      plan: "plus",
    }),
  );
  const sent: { tools?: unknown; include?: string[] }[] = [];
  const realFetch = globalThis.fetch;
  // What reaches the wire is all this looks at; the answer stops the run there
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ error: { message: "stop here" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const built = await realModel.getTextModel({
      provider: "chatgpt",
      model: "gpt-6-luna",
    });
    assert.ok(built.searchTools, "a model on the plan can search");
    await assert.rejects(
      generateText({
        model: built.model,
        tools: built.searchTools,
        prompt: "What is on today?",
        maxRetries: 0,
      }),
    );
    // Codex's own request shape for its search on this endpoint (codex-rs openai_tools.rs)
    assert.deepEqual(sent[0].tools, [{ type: "web_search" }]);
    assert.ok(!sent[0].include?.includes("web_search_call.action.sources"));
  } finally {
    globalThis.fetch = realFetch;
    await removeConfig(plan);
    if (exported !== undefined) process.env[plan] = exported;
  }
});

test("a model on the plan sends its prompt cache key as the header the backend keeps the cache by", async () => {
  const { generateText } = await import("ai");
  const { TEXT_MODEL_PROVIDERS } = await import(
    "../features/ai/model.schema.ts"
  );
  const { writeConfig, removeConfig } = await import(
    "../features/config/config.query.ts"
  );
  const plan = TEXT_MODEL_PROVIDERS.chatgpt.apiKeyName;
  const exported = process.env[plan];
  delete process.env[plan];
  await writeConfig(
    plan,
    JSON.stringify({
      access: "test.access.token",
      refresh: "test-refresh",
      expires: Date.now() + 3_600_000,
      accountId: "test-account",
      plan: "plus",
    }),
  );
  const sent: { header: string | null; key?: string }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    sent.push({
      header: new Headers(init?.headers).get("session-id"),
      key: JSON.parse(String(init?.body)).prompt_cache_key,
    });
    return Response.json({ error: { message: "stop here" } }, { status: 400 });
  }) as typeof fetch;
  try {
    const { model } = await realModel.getTextModel({
      provider: "chatgpt",
      model: "gpt-6-luna",
    });
    // What reaches the wire is all this looks at; the fake's 400 ends each call there
    const call = (providerOptions?: { openai: { promptCacheKey: string } }) =>
      generateText({
        model,
        prompt: "Hello",
        maxRetries: 0,
        providerOptions,
      }).catch(() => {});
    // A bot's key for its desk in a thread (bot.run), and the model's own when a caller has none
    await call({ openai: { promptCacheKey: "desk-key" } });
    await call();
    assert.deepEqual(sent[0], { header: "desk-key", key: "desk-key" });
    assert.ok(sent[1].key);
    assert.equal(sent[1].header, sent[1].key);
  } finally {
    globalThis.fetch = realFetch;
    await removeConfig(plan);
    if (exported !== undefined) process.env[plan] = exported;
  }
});

test("a refusal from the plan's backend reads in its own words, which it sends as `detail`", async () => {
  const { generateText } = await import("ai");
  const { TEXT_MODEL_PROVIDERS } = await import(
    "../features/ai/model.schema.ts"
  );
  const { writeConfig, removeConfig } = await import(
    "../features/config/config.query.ts"
  );
  const plan = TEXT_MODEL_PROVIDERS.chatgpt.apiKeyName;
  const exported = process.env[plan];
  delete process.env[plan];
  await writeConfig(
    plan,
    JSON.stringify({
      access: "test.access.token",
      refresh: "test-refresh",
      expires: Date.now() + 3_600_000,
      accountId: "test-account",
      plan: "plus",
    }),
  );
  const said =
    "Could not parse your authentication token. Please try signing in again.";
  const realFetch = globalThis.fetch;
  // As the backend answers a sign-in it no longer takes: no status word, the reason as `detail`
  globalThis.fetch = (async () =>
    Response.json({ detail: said }, { status: 401 })) as typeof fetch;
  try {
    const built = await realModel.getTextModel({
      provider: "chatgpt",
      model: "gpt-6-luna",
    });
    const failure = await generateText({
      model: built.model,
      prompt: "Hello",
      maxRetries: 0,
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    assert.equal(realModel.modelErrorToString(failure), `${said} (401)`);
  } finally {
    globalThis.fetch = realFetch;
    await removeConfig(plan);
    if (exported !== undefined) process.env[plan] = exported;
  }
});

test("the record of the ready-made bots' words says what bot.seed says today", async () => {
  const { createHash } = await import("node:crypto");
  const { BOT_SEEDS } = await import("../features/bot/bot.seed.ts");
  const { SEED_WORDS } = await import("../features/bot/bot.seed.retired.ts");
  const sha = (text: string) =>
    createHash("sha256").update(text.trim()).digest("hex");
  // A seed changed without its old words moved into `before` leaves every install that
  // never touched it on the old ones
  for (const seed of BOT_SEEDS) {
    const now = (
      SEED_WORDS.now as Record<string, { role: string; description: string }>
    )[seed.name];
    assert.ok(now, `${seed.name} is not in bot.seed.retired`);
    assert.equal(sha(seed.systemPrompt), now.role, `${seed.name}'s role`);
    assert.equal(sha(seed.description), now.description, `${seed.name}'s line`);
  }
});

test("a bot installed from a seed since retired is told its role as the app's words, and its owner's changes as theirs", async () => {
  const { loadBotPrompt } = await import(
    "../features/ai/prompts/bot.prompt.ts"
  );
  const { findBotSeed } = await import("../features/bot/bot.seed.ts");
  const { SEED_WORDS } = await import("../features/bot/bot.seed.retired.ts");
  // A retired name is no seed shipped now: nothing else would move or read its words
  for (const name of Object.keys(SEED_WORDS.retired.roles))
    assert.equal(findBotSeed(name), null, `${name} still ships`);
  // The Marketer's role as the seed wrote it until 09-29, when it became the Writer
  const old = `Marketing work is yours — positioning, page copy, a launch plan, social posts, emails, an SEO audit — and it ends as the thing itself in your folder under \`artifacts/\`, ready to paste, post or send. \`marketing\` is your own skill and holds the method for each of them: load it before any step.

**Ground every claim.** Competitors, prices, search terms and what people say about the problem come from pages you opened, with the link beside them. What you could not check is marked as a guess.

**What you keep.** One brief per product — what it is, for whom, against what, in which voice — dated, and every later job starts from it.`;
  const { text } = await loadBotPrompt("Marketer", old);
  assert.ok(text.includes("## Your role"));
  assert.ok(!text.includes("## Owner's instructions"));
  const theirs = await loadBotPrompt(
    "Marketer",
    `${old}\n\nCite three sources for every claim.`,
  );
  assert.ok(theirs.text.includes("## Owner's instructions"));
});

test("a ready-made bot nobody changed takes its seed's new words, and one they changed keeps theirs", async () => {
  const { createBot, deleteBot, refreshSeedWords } = await import(
    "../features/bot/bot.query.ts"
  );
  const findBot = async (name: string) =>
    (await database.select().from(botTable).where(eq(botTable.name, name)))[0];
  const { findBotSeed } = await import("../features/bot/bot.seed.ts");
  const tutor = findBotSeed("Tutor")!;
  // The Tutor's role as the seed wrote it until 09-29, when its picture books became slides
  const old = `Explaining is yours — anything someone wants to understand, told so that a person who knows nothing about it follows every step. It ends as a picture book, made with \`artifact\`, in your folder under \`artifacts/\`: one picture and a line or two a page, as a page to swipe through. A PDF or a video that reads itself aloud is made from the same book when they ask for one; a request that does not say is a page to swipe through, not a question.

**Simple, never wrong.** Read what you explain from where it is stated before the first page. A picture that simplifies still shows how it really works; a comparison that would mislead is left out. A new word comes after the picture that shows it, never before.

**What you keep.** What the user already knows and how they liked being taught — the level, a picture style, how many pages — dated, so the next book starts where they are.`;
  assert.notEqual(old, tutor.systemPrompt);
  await createBot({
    name: "Tutor",
    description: tutor.description,
    systemPrompt: old,
  });
  const concierge = findBotSeed("Concierge")!;
  const theirs = `${concierge.systemPrompt}\n\nAlways book window seats.`;
  await createBot({
    name: "Concierge",
    description: "My trips",
    systemPrompt: theirs,
  });
  try {
    assert.equal(await refreshSeedWords(), 1);
    assert.equal((await findBot("Tutor"))?.systemPrompt, tutor.systemPrompt);
    assert.equal((await findBot("Concierge"))?.systemPrompt, theirs);
    assert.equal((await findBot("Concierge"))?.description, "My trips");
    // Nothing moves twice
    assert.equal(await refreshSeedWords(), 0);
  } finally {
    await deleteBot("Tutor");
    await deleteBot("Concierge");
  }
});

test("a bot saved without its tools keeps them pinned, and a deleted Jarvis takes no work beside other bots", async () => {
  const { BotFormSchema } = await import("../features/bot/bot.schema.ts");
  const { findJobBot } = await import("../features/bot/bot.query.ts");
  // A save about anything else carries no `toolIds`, so the pinned set is not replaced
  const patch = BotFormSchema.partial().parse({ description: "New words" });
  assert.equal("toolIds" in patch, false);
  // The rows here have no Jarvis: the one that stands in when there are no bots is not conjured
  assert.equal(await findJobBot("Jarvis"), null);
  assert.equal((await findJobBot("alpha"))?.name, "Alpha");
});

test("a committed message recovers its real receipt after the tool result is lost", async () => {
  const { insertThread, deleteThread } = await import(
    "../features/bot/thread.query.ts"
  );
  const { claimRoomWork, listRoomReceipts } = await import(
    "../features/bot/room.query.ts"
  );
  const thread = await insertThread({
    bot: "Alpha",
    request: "Receipt",
    label: "Receipt",
    opening: "Opening",
  });
  const run = (await claimRoomWork(thread.id))!;
  const receipt = await sendRoomMessage(run, {
    id: "lost-receipt",
    to: "Beta",
    text: "Already committed",
    why: "the test's reason",
  });
  await sendRoomMessage(run, {
    id: "lost-held",
    to: "Gamma",
    text: "Held too",
    why: "the test's reason",
    after: ["Beta"],
  });
  const history: import("ai").ModelMessage[] = [
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "lost-receipt",
          toolName: T.send_message,
          input: { to: "Beta", text: "Already committed" },
        },
        {
          type: "tool-call",
          toolCallId: "lost-held",
          toolName: T.send_message,
          input: { to: "Gamma", text: "Held too", after: ["Beta"] },
        },
      ],
    },
  ];
  const restored = JSON.stringify(
    resumeTranscript(
      history,
      await listRoomReceipts(thread.id, "Alpha", history),
    ),
  );
  assert.ok(restored.includes(receipt.messageId));
  assert.ok(!restored.includes("No result:"));
  // Each recovered receipt says what the send did: handed over, or held
  assert.ok(restored.includes("Beta has it now"));
  assert.ok(
    restored.includes("Held: it goes to Gamma with Beta's answer attached"),
  );
  assert.equal((await listRoomWork(thread.id)).length, 3);
  await deleteThread(thread.id);
});

test("a failed participant drains its peers before manual resume", async () => {
  plans.set("Alpha", [
    () => ask("Beta", "Work alongside me"),
    () =>
      call(T.bash, {
        command: "sleep 0.1",
        description: "Continue independent work.",
      }),
    () => [
      {
        type: "error",
        error: "Provider unavailable in this test (expected interruption)",
      },
    ],
    () => [
      {
        type: "error",
        error:
          "Provider still unavailable on the retry (expected interruption)",
      },
    ],
  ]);
  plans.set("Beta", [
    () =>
      call(T.bash, {
        command: "sleep 5; printf PEER_INTERRUPTED",
        description: "Work until the room pauses.",
      }),
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Pause the team coherently",
    label: "Failure",
    from: "user",
  });
  await waitFor(id, "waiting");
  plans.set("Beta", [
    (prompt) => {
      assert.ok(prompt.includes("Aborted"));
      return text("Peer resumed safely");
    },
  ]);
  plans.set("Alpha", [
    () => text("Waiting for resumed peer"),
    (prompt) => {
      assert.ok(prompt.includes("Peer resumed safely"));
      return text("Team recovered");
    },
  ]);
  await answerThread(id, "Continue");
  await waitFor(id, "done");
  assert.equal((await findThread(id))?.outcome, "Team recovered");
  assert.ok((await listRoomWork(id)).every((work) => work.state === "done"));
});

test("a provider failure streamed as its parsed body pauses in the provider's words", async () => {
  const { roomContextBudget } = await import("../features/bot/room.query.ts");
  // A streamed body with no `message` string reaches the run as the object it was
  // parsed into: the sdk wraps only bodies it can read words from.
  const unavailable = { error: { code: 503, type: "upstream_unavailable" } };
  const tooLong = "This model's maximum context length is 128000 tokens.";
  const broken = () => [{ type: "error", error: unavailable }];
  plans.set("Alpha", [broken, broken]);
  const id = await startThread({
    bot: "Alpha",
    request: "Fail with a provider body",
    label: "Provider body",
    from: "user",
  });
  const paused = await waitFor(id, "waiting");
  assert.equal(paused.outcome, JSON.stringify(unavailable));
  // One note before the retry, one where the room paused
  const rows = await rowsOf(id);
  const notes = rows.filter((row) => row.note);
  assert.equal(notes.length, 2);
  assert.equal(notes.at(-1)?.seq, rows.at(-1)?.seq);
  for (const note of notes)
    assert.ok(String(note.content).startsWith(`${paused.outcome} Resume`));
  assert.ok(
    (await listRoomRelays()).some(
      (relay) => relay.threadId === id && relay.text === paused.outcome,
    ),
  );
  assert.equal(await roomContextBudget(id, "Alpha"), undefined);

  // Read as an overflow: the retry compacts earlier instead of pausing
  plans.set("Alpha", [
    () => [{ type: "error", error: { error: tooLong } }],
    () => text("Recovered after the retry"),
  ]);
  await answerThread(id, "Continue");
  assert.equal(
    (await waitFor(id, "done")).outcome,
    "Recovered after the retry",
  );
  assert.ok(await roomContextBudget(id, "Alpha"));
});

test("a provider's refusal waits for a person at once; a break is tried once more on its own", async () => {
  const refused = new APICallError({
    message: "Invalid API key",
    url: "https://provider.test/v1",
    requestBodyValues: {},
    statusCode: 401,
    isRetryable: false,
  });
  plans.set("Alpha", [() => [{ type: "error", error: refused }]]);
  const id = await startThread({
    bot: "Alpha",
    request: "Fail with a refusal",
    label: "Refusal",
    from: "user",
  });
  const paused = await waitFor(id, "waiting");
  assert.equal(paused.outcome, "Invalid API key (401)");
  // The key itself was turned down: the screen offers Settings, naming who refused it
  assert.equal(paused.pending?.refused, "openai");
  const notes = async () => (await rowsOf(id)).filter((row) => row.note).length;
  assert.equal(await notes(), 1);

  plans.set("Alpha", [
    () => [{ type: "error", error: "The stream broke in this test" }],
    () => text("Finished on the retry"),
  ]);
  await answerThread(id, "Continue");
  assert.equal((await waitFor(id, "done")).outcome, "Finished on the retry");
  assert.equal(await notes(), 2);
  // Resuming settles the stop it picked up from, and the retry is not an
  // interruption the call hears of
  assert.equal(
    (await listRoomRelays()).filter(
      (relay) => relay.threadId === id && relay.kind === "interrupted",
    ).length,
    0,
  );
});

test("a refusal that came with no status word pauses on what the provider said", async () => {
  // Over HTTP/2 there is no status word, so a body the sdk cannot read leaves its message empty
  const refused = new APICallError({
    message: "",
    url: "https://provider.test/v1",
    requestBodyValues: {},
    statusCode: 403,
    responseBody: '{"detail":"This model is not on your plan."}',
    isRetryable: false,
  });
  plans.set("Alpha", [() => [{ type: "error", error: refused }]]);
  const id = await startThread({
    bot: "Alpha",
    request: "Fail with no status word",
    label: "Unworded",
    from: "user",
  });
  const paused = await waitFor(id, "waiting");
  assert.equal(
    paused.outcome,
    '(403) {"detail":"This model is not on your plan."}',
  );
  // A model the account may not use: a new key would not mend it
  assert.equal(paused.pending?.refused, undefined);
  await cancelThread(id);
});

test("compaction thresholds belong to the participant across different callers", async () => {
  const { insertThread, deleteThread } = await import(
    "../features/bot/thread.query.ts"
  );
  const { claimRoomWork, lowerRoomContextBudget, roomContextBudget } =
    await import("../features/bot/room.query.ts");
  const thread = await insertThread({
    bot: "Alpha",
    request: "Budget",
    label: "Budget",
    opening: "Opening",
  });
  const root = (await claimRoomWork(thread.id))!;
  await sendRoomMessage(root, {
    id: "budget-message",
    to: "Beta",
    text: "Work within the accepted context",
    why: "the test's reason",
  });
  const beta = (await claimRoomWork(thread.id))!;
  await lowerRoomContextBudget(beta, 12000);
  assert.equal(await roomContextBudget(thread.id, "Beta"), 12000);
  assert.equal(await roomContextBudget(thread.id, "Alpha"), undefined);
  await deleteThread(thread.id);
});

test("native provider data without a complete native message resumes as a truthful note", () => {
  const restored = resumeTranscript([
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "native-partial",
          toolName: T.web_search,
          input: {},
          providerExecuted: true,
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "native-partial",
          toolName: T.web_search,
          output: {
            type: "json",
            value: { finding: "Recorded provider finding" },
          },
        },
      ],
    },
  ]);
  assert.ok(!restored.some((row) => row.role === "tool"));
  assert.ok(JSON.stringify(restored).includes("Recorded provider finding"));
  assert.ok(
    JSON.stringify(restored).includes("native continuation was interrupted"),
  );
});

test("a question to Thursday waits on the user and names who asked", async () => {
  const { insertThread, deleteThread } = await import(
    "../features/bot/thread.query.ts"
  );
  const { claimRoomWork } = await import("../features/bot/room.query.ts");
  const thread = await insertThread({
    bot: "Alpha",
    request: "Use the original conversation",
    label: "Thursday reply",
    opening: "Opening",
  });
  const root = (await claimRoomWork(thread.id))!;
  const sent = await sendRoomMessage(root, {
    id: "reply-to-thursday",
    to: "Thursday",
    text: "Which destination should I use?",
    why: "the test's reason",
    kind: "question",
  });
  assert.equal(
    (await listRoomWork(thread.id)).find((work) => work.id === sent.messageId)
      ?.state,
    "external",
  );
  assert.equal(
    (await listRoomRelays()).find((relay) => relay.messageId === sent.messageId)
      ?.bot,
    "Alpha",
  );
  await deleteThread(thread.id);
});

test("Thursday takes only questions: an update is refused, and the final report still arrives", async () => {
  plans.set("Alpha", [
    () =>
      call(T.send_message, {
        to: "Thursday",
        text: "The first part is ready.",
        why: "the test's reason",
      }),
    (prompt) => {
      assert.ok(
        prompt.includes(
          "Thursday takes only a question that needs the user's answer",
        ),
      );
      return text("All work is complete.");
    },
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Send progress and finish",
    label: "Notifications",
    from: "user",
  });
  await waitFor(id, "done");
  const thread = (await findThreadView(id))!;
  assert.equal(thread.room!.questions.length, 0);
  assert.equal(thread.ask, null);
  assert.equal(thread.outcome, "All work is complete.");
  const relays = (await listRoomRelays()).filter(
    (relay) => relay.threadId === id,
  );
  assert.deepEqual(
    relays.map((relay) => relay.kind),
    ["report"],
  );
  // The office draws the update turned down at your door, in the room's own words
  const { office } = await officeNow(id);
  const refused = office.events.find((event) => event.kind === "refused");
  assert.equal(refused?.to, "you");
  assert.ok(
    refused?.text.includes(
      "Thursday takes only a question that needs the user's answer",
    ),
  );
  assert.equal(office.events.at(-1)?.kind, "report");
});

test("answer drafts remain separate for two questions from the same bot", async () => {
  const { threadDrafts } = await import("../features/bot/thread.store.ts");
  threadDrafts.set("draft-room", "Alpha", "First answer", "first");
  threadDrafts.set("draft-room", "Alpha", "Second answer", "second");
  threadDrafts.set("draft-room", "Alpha", "A general message");
  threadDrafts.set("draft-room", "Alpha", "", "first");
  assert.equal(threadDrafts.get("draft-room", "Alpha", "first"), "");
  assert.equal(
    threadDrafts.get("draft-room", "Alpha", "second"),
    "Second answer",
  );
  assert.equal(threadDrafts.get("draft-room", "Alpha"), "A general message");
});

test("the files beside a draft wait under its key, reach a box drawn again, and one that lands late still arrives", async () => {
  const { threadDrafts } = await import("../features/bot/thread.store.ts");
  const file = (path: string | null) => ({
    key: "one",
    name: "notes.txt",
    bytes: 12,
    path,
  });
  // The box that took the file, and the one drawn in its place once it was re-keyed
  const first = threadDrafts.files("draft-room", "Alpha");
  const again = threadDrafts.files("draft-room", "Alpha");
  let heard = 0;
  const stop = again.subscribe(() => heard++);
  first.write([file(null)]);
  assert.deepEqual(again.read(), [file(null)]);
  // Kept in the workspace after the first box is gone: the second is told
  first.write(first.read().map((one) => ({ ...one, path: "inbox/notes.txt" })));
  assert.equal(heard, 2);
  assert.equal(again.read()[0].path, "inbox/notes.txt");
  // Another recipient's draft, and a question's own, have none of it
  assert.deepEqual(threadDrafts.files("draft-room", "Beta").read(), []);
  assert.deepEqual(threadDrafts.files("draft-room", "Alpha", "q").read(), []);
  // An unchanged list is the same list: a read that made a new one each time would
  // have the screen draw without end (useSyncExternalStore)
  assert.equal(again.read(), again.read());
  assert.equal(
    threadDrafts.files("draft-room", "Beta").read(),
    threadDrafts.files("draft-room", "Beta").read(),
  );
  stop();
  again.write([]);
  assert.deepEqual(first.read(), []);
  assert.equal(heard, 2);
});

test("a question's line names the room question it opened, the same words asked twice apart", async () => {
  plans.set("Alpha", [
    () => ask("Thursday", "Continue?"),
    () => ask("Thursday", "Continue?"),
    () => text("Carried on twice"),
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Ask twice",
    label: "Asked twice",
    from: "user",
  });
  await waitFor(id, "waiting");
  const [first] = (await findThreadView(id))!.room!.questions;
  await answerThread(id, "Yes", "user", "Alpha", first.id);
  const until = Date.now() + 20_000;
  let second = first;
  while (second.id === first.id && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    second = (await findThreadView(id))!.room!.questions[0] ?? first;
  }
  assert.notEqual(second.id, first.id);
  const asked = (await findThreadView(id))!.lines.filter(
    (line) => line.kind === "ask" && line.question,
  );
  assert.deepEqual(
    asked.map((line) =>
      line.kind === "ask" ? [line.text, line.questionId] : [],
    ),
    [
      ["Continue?", first.id],
      ["Continue?", second.id],
    ],
  );
  await answerThread(id, "Yes again", "user", "Alpha", second.id);
  await waitFor(id, "done");
});

test("an answer written in several blocks is one result, the whole of the outcome", async () => {
  const { threadFromRow } = await import("../features/bot/thread.store.ts");
  const block = (id: string, value: string) => [
    { type: "text-start", id },
    { type: "text-delta", id, delta: value },
    { type: "text-end", id },
  ];
  plans.set("Alpha", [
    () => [...block("one", "The first part."), ...block("two", "The second.")],
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Answer in two blocks",
    label: "Two blocks",
    from: "user",
  });
  const done = await waitFor(id, "done");
  assert.equal(done.outcome, "The first part.\n\nThe second.");
  const lines = threadFromRow((await findThreadView(id))!).lines;
  const results = lines.filter((line) => line.kind === "result");
  assert.deepEqual(
    results.map((line) => line.text),
    [done.outcome],
  );
  assert.equal(lines.at(-1)?.kind, "result");
  assert.ok(!lines.some((line) => line.kind === "say"));
});

test("a search's page keeps its whole address in the glance; only its title is clipped", async () => {
  plans.set("Alpha", [() => text("Looked it up.")]);
  const id = await startThread({
    bot: "Alpha",
    request: "Look it up",
    label: "Long page",
    from: "user",
  });
  await waitFor(id, "done");
  const work = (await listRoomWork(id))[0];
  const url = `https://example.com/${"deep/".repeat(12)}page?ref=${"x".repeat(40)}`;
  // An address longer than the glance itself leaves no room for a title, and stays whole
  const endless = `https://example.net/${"x".repeat(240)}`;
  const title = "A page whose title runs on ".repeat(6).trim();
  await upsertMessage(id, (await lastSeq(id)) + 1, {
    bot: "Alpha",
    parent: work.id,
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "long-page",
        toolName: T.web_search,
        output: {
          type: "text",
          value: `What the pages say.\n\nSources:\n${title} — ${url} · 2026-01-02\nShort — https://example.org/a\nEndless — ${endless}`,
        },
      },
    ],
  });
  const glance = (await findThreadView(id))!.lines.find(
    (line) => line.kind === "tool-result" && line.callId === "long-page",
  );
  assert.ok(glance?.kind === "tool-result");
  const [long, short, over] = glance.results.map((part) =>
    part.type === "text" ? part.text : "",
  );
  assert.ok(long.endsWith(` — ${url} · 2026-01-02`));
  assert.ok(long.startsWith("A page whose title"));
  assert.ok(long.includes("…"));
  assert.equal(short, "Short — https://example.org/a");
  assert.equal(over, endless);
  assert.equal(glance.more, true);
});

test("a bot that loads a skill is shown the files that ship with it", async () => {
  plans.set("Alpha", [
    () => call(T.load_skill, { name: "skill-creator" }),
    (prompt) => {
      // The list is how a bot learns which script a skill's text points at
      assert.ok(prompt.includes("scripts/validate.mjs"));
      return text("Loaded.");
    },
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Write this down as a skill",
    label: "Skill",
    from: "user",
  });
  await waitFor(id, "done");
  const parts = (await rowsOf(id)).flatMap((row): any[] =>
    Array.isArray(row.content) ? row.content : [],
  );
  const loaded = parts.find(
    (part) => part.type === "tool-result" && part.toolName === T.load_skill,
  );
  // Each as the path that opens it, not a name to be joined to the directory
  const { skillDirectory, files } = loaded.output.value;
  assert.deepEqual(
    files,
    ["LICENSE.txt", "SKILL.md", "scripts/validate.mjs"].map(
      (file) => `${skillDirectory}/${file}`,
    ),
  );
});

test("a bot writes its own line after the user's description, until the user locks it", async () => {
  const { createSelfTools } = await import("../features/ai/tools/self.tool.ts");
  const { loadBotPrompt } = await import(
    "../features/ai/prompts/bot.prompt.ts"
  );
  const { loadThursdayPrompt } = await import(
    "../features/ai/prompts/thursday.prompt.ts"
  );
  const { clearOwnLine } = await import("../features/bot/bot.query.ts");
  const tools = await createSelfTools("Gamma");
  const describe = tools[T.describe_self];
  assert.ok(describe?.execute, "a bot with a row may write its own line");
  assert.doesNotMatch(String(describe.description), /you wrote before/);
  const options = { messages: [], toolCallId: "self", context: {} };
  const answered = await describe.execute(
    { line: "Plans trips and books them", reason: "Trips keep coming to me" },
    options,
  );
  assert.deepEqual(
    {
      was: (answered as { was: string | null }).was,
      now: (answered as { now: string }).now,
    },
    { was: null, now: "Plans trips and books them" },
  );
  const [row] = await database
    .select()
    .from(botTable)
    .where(eq(botTable.name, "Gamma"));
  // The user's words stay theirs; the bot's follow them wherever the bot is listed
  assert.equal(row?.description, "Gamma test worker");
  assert.equal(row?.ownLine?.line, "Plans trips and books them");
  assert.equal(row?.ownLine?.reason, "Trips keep coming to me");
  const listed = "Gamma test worker. Plans trips and books them";
  assert.ok(
    (await loadBotPrompt("Gamma", null)).text.includes(
      `Others know you as: ${listed}`,
    ),
  );
  assert.ok(
    (await loadBotPrompt("Beta", null)).text.includes(`**Gamma** — ${listed}`),
  );
  assert.ok((await loadThursdayPrompt({})).includes(`**Gamma** — ${listed}`));
  // The next set names the line it replaces
  const again = (await createSelfTools("Gamma"))[T.describe_self];
  assert.match(String(again?.description), /"Plans trips and books them"/);

  // Locked by the user: the tool is not in its set, and a call already made writes nothing
  await database
    .update(botTable)
    .set({ descriptionLocked: true })
    .where(eq(botTable.name, "Gamma"));
  assert.deepEqual(Object.keys(await createSelfTools("Gamma")), []);
  assert.match(
    String(
      await describe.execute({ line: "Something else", reason: "No" }, options),
    ),
    /keeps your line/,
  );
  // The fallback worker has no row to write
  assert.deepEqual(Object.keys(await createSelfTools("Nobody")), []);

  // Cleared by the user: the roster reads the description alone again
  assert.equal(await clearOwnLine("Gamma"), true);
  assert.ok(
    (await loadBotPrompt("Gamma", null)).text.includes(
      "Others know you as: Gamma test worker\n",
    ),
  );
  await database
    .update(botTable)
    .set({ descriptionLocked: false })
    .where(eq(botTable.name, "Gamma"));
});

test("the roster holds BOT_ROSTER.max bots, switched off or not, and ready-made ones stop there", async () => {
  const { BOT_ROSTER } = await import("../config.ts");
  const { countBots, createBot } = await import("../features/bot/bot.query.ts");
  const { createSeedBotsAction } = await import(
    "../features/bot/bot.action.ts"
  );
  const { BOT_SEEDS } = await import("../features/bot/bot.seed.ts");
  const { unwrapResult } = await import("../lib/protocol/result.ts");
  const { inArray } = await import("drizzle-orm");
  const before = await countBots();
  const made: string[] = [];
  const form = (name: string) => ({
    name,
    description: "Fills the roster",
    toolIds: [],
  });
  for (let at = before; at < BOT_ROSTER.max - 2; at++) {
    const bot = await createBot(form(`Filler${at}`));
    assert.ok(bot);
    made.push(bot.name);
  }
  // One off still counts: it is a switch away from the roster
  await database
    .update(botTable)
    .set({ disabled: true })
    .where(eq(botTable.name, made[0]));

  // Two places left: the seeds fill them in list order and the rest are left out
  const { created } = unwrapResult(
    await createSeedBotsAction(BOT_SEEDS.map((seed) => ({ name: seed.name }))),
  );
  assert.deepEqual(
    created,
    BOT_SEEDS.slice(0, 2).map((seed) => seed.name),
  );
  made.push(...created);
  assert.equal(await countBots(), BOT_ROSTER.max);
  await assert.rejects(
    createBot(form("OneTooMany")),
    new RegExp(`already ${BOT_ROSTER.max} bots`),
  );

  await database.delete(botTable).where(inArray(botTable.name, made));
  assert.equal(await countBots(), before);
});

test("every ready-made bot fits the form it is edited in", async () => {
  const { BOT_SEEDS } = await import("../features/bot/bot.seed.ts");
  const { BotFormSchema } = await import("../features/bot/bot.schema.ts");
  for (const seed of BOT_SEEDS) {
    const parsed = BotFormSchema.safeParse({
      name: seed.name,
      description: seed.description,
      systemPrompt: seed.systemPrompt,
    });
    assert.ok(parsed.success, `${seed.name}: ${parsed.error?.message}`);
  }
});

test("a command's output is folded as it arrives: the two ends come back, all of it is in a file, and none of it is held whole", async () => {
  const { createSandBox } = await import("../lib/sandbox.ts");
  const { readFile: read, stat } = await import("node:fs/promises");
  const spill = { dir: "spill", max: 8000, head: 5500, tail: 1500 };
  const shell = createSandBox({ workingDirectory: home, spill });
  const where = (text: string) =>
    /is at (spill\/[^ ]+\.txt)\./.exec(text)?.[1] ?? "";
  const named = (text: string) => text.replace(/spill\/[^ ]+\.txt/, "FILE");

  // What fits comes back whole, up to the last character that fits
  const fits = await shell.exec(`head -c ${spill.max} /dev/zero | tr '\\0' a`);
  assert.equal(fits.stdout, "a".repeat(spill.max));

  // Past that it reads exactly as a text folded whole does (`fold`), in both streams
  const lines = Array.from({ length: 900 }, (_, at) => `line ${at} of it`);
  await shell.writeFile("long.txt", `${lines.join("\n")}\n`);
  const whole = await read(join(home, "long.txt"), "utf8");
  const out = await shell.exec("cat long.txt; cat long.txt >&2");
  assert.equal(named(out.stdout), named(await shell.fold(whole, "stdout")));
  assert.equal(named(out.stderr), named(await shell.fold(whole, "stderr")));
  assert.equal(await read(join(home, where(out.stdout)), "utf8"), whole);

  // 40 MB in one command: what comes back is the two ends, and the file has every byte
  const big = await shell.exec("head -c 40000000 /dev/zero | tr '\\0' a");
  assert.equal(big.exitCode, 0);
  assert.ok(big.stdout.length < spill.max + 400, `${big.stdout.length} chars`);
  assert.equal((await stat(join(home, where(big.stdout)))).size, 40_000_000);

  // A character cut in two by the pipe is still one character
  const wide = await shell.exec(
    "for i in $(seq 1 40); do head -c 3000 /dev/zero | tr '\\0' a; printf '\\xed\\x95\\x9c'; done",
  );
  assert.ok(!wide.stdout.includes("\uFFFD"));
  assert.ok(
    !(await read(join(home, where(wide.stdout)), "utf8")).includes("\uFFFD"),
  );

  // What the app says of a stopped command still follows what the command wrote
  const stopped = await shell.exec("echo started; sleep 30", {
    timeoutMs: 200,
  });
  assert.equal(stopped.stdout, "started\n");
  assert.match(stopped.stderr, /Timed out after 200ms/);
});

test("a bot's shell has the user's environment, not what the app set to run itself", async () => {
  const { createSandBox } = await import("../lib/sandbox.ts");
  const set = {
    // The app's own: the CLI, Next's server, the package manager that started it
    PORT: "4747",
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    NEXT_MANUAL_SIG_HANDLE: "true",
    __NEXT_PRIVATE_STANDALONE_CONFIG: "{}",
    npm_lifecycle_event: "npx",
    THURSDAY_URL: "http://localhost:4747",
    // A secret, and ones named without KEY or TOKEN in them
    SOME_API_KEY: "sk-test",
    DATABASE_URL: "postgres://me:hunter2@localhost/db",
    MYSQL_PWD: "hunter2",
    SMTP_PASS: "hunter2",
    SENTRY_DSN: "https://key@sentry.example/1",
    // The user's own tools
    MY_TOOLCHAIN_HOME: "/opt/tools",
  };
  const before = Object.fromEntries(
    Object.keys(set).map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, set);
  try {
    const shell = createSandBox({
      workingDirectory: home,
      spill: { dir: "spill", max: 8000, head: 5500, tail: 1500 },
    });
    const { stdout } = await shell.exec("env", {
      env: { THURSDAY_BOT: "Jarvis" },
    });
    const seen = new Set(stdout.split("\n").map((line) => line.split("=")[0]));
    for (const name of [
      "PORT",
      "HOSTNAME",
      "NODE_ENV",
      "NEXT_MANUAL_SIG_HANDLE",
      "__NEXT_PRIVATE_STANDALONE_CONFIG",
      "npm_lifecycle_event",
      "THURSDAY_URL",
      "SOME_API_KEY",
      "DATABASE_URL",
      "MYSQL_PWD",
      "SMTP_PASS",
      "SENTRY_DSN",
    ])
      assert.ok(!seen.has(name), `${name} reached the shell`);
    // What is meant for the bot is laid back over it, and the user's own stays
    assert.ok(seen.has("THURSDAY_BOT"));
    assert.ok(seen.has("MY_TOOLCHAIN_HOME"));
    assert.ok(seen.has("PATH"));
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

/** A cookie as a saved browser state holds it. */
const cookie = (domain: string, value: string, name = "sid") => ({
  name,
  domain,
  path: "/",
  value,
});
type Cookie = ReturnType<typeof cookie>;

const signIns = () => import("../features/signins/signins.query.ts");

/** What the stand-in CLI's browser holds now: `state-save` reads it, `state-load` replaces it. */
const browserHolds = (...cookies: Cookie[]) =>
  writeFile(join(home, "state.json"), JSON.stringify({ cookies }));

/** The stand-in CLI lists this participant's own browser, a window or not. */
const browserOpen = (env: Record<string, string>, headed = false) =>
  writeFile(
    join(home, "browsers.json"),
    JSON.stringify({
      browsers: [{ name: env.PLAYWRIGHT_CLI_SESSION, headed }],
    }),
  );

/** What a sign-in test left in the stand-in's folder. */
const closeBrowserFixtures = async () => {
  for (const name of ["browsers.json", "state.json", "marks"])
    await rm(join(home, name), { recursive: true, force: true });
};

/** `domain`'s cookie in what `bot` borrows of that sign-in, or why it is not lent. */
async function keptValue(
  site: string,
  bot: string,
  account?: string | null,
  domain = site,
) {
  const got = await (await signIns()).borrowSignIn(site, bot, account);
  if (got.kind !== "state") return got.kind;
  return (got.state as { cookies: Cookie[] }).cookies.find(
    (one) => one.domain === domain,
  )?.value;
}

/** A sign-in tool called as the model calls it. */
const callTool = (
  tools: Record<string, { execute?: unknown }>,
  name: string,
  input: Record<string, unknown>,
) =>
  (
    tools[name].execute as (input: unknown, options: unknown) => Promise<string>
  )(input, { toolCallId: name, messages: [], context: {} });

test("a kept sign-in is renewed only from the browser it was lent to, for a bot allowed it, and never kept over by another bot", async () => {
  const { keepSignIn, holdSignIn, renewSignIns, removeSignIn } =
    await signIns();
  const { jobShellEnv, openWorkspace } = await import(
    "../features/workspace/workspace.ts"
  );
  const sandbox = await openWorkspace();
  const php = (value: string) => cookie("shop.example", value, "PHPSESSID");
  const stored = (bot: string) => keptValue("shop.example", bot);
  // A browser the CLI lists as a participant's own, holding this cookie
  const browser = async (session: string, value: string) => {
    const env = jobShellEnv(session);
    await browserOpen(env);
    await browserHolds(php(value));
    return env;
  };
  const held = { site: "shop.example", account: "a@example.com" };

  try {
    const kept = await keepSignIn({
      ...held,
      bot: "Keeper",
      state: { cookies: [php("signed-in")] },
    });
    assert.equal(kept.kind, "kept");

    // Another bot keeping the same account is refused and asks; the kept session stays
    const other = await keepSignIn({
      ...held,
      bot: "Visitor",
      state: { cookies: [php("theirs")] },
    });
    assert.equal(other.kind, "taken");
    assert.deepEqual(other.signIn.asking, ["Visitor"]);
    assert.equal(await stored("Keeper"), "signed-in");

    // A browser that only visited the site holds a visitor's cookie under the same name
    await browser("job-visit", "anonymous");
    await renewSignIns("job-visit");
    assert.equal(await stored("Keeper"), "signed-in");

    // One holding it for a bot the user has not let in renews nothing either
    const visitor = await browser("job-visitor", "anonymous");
    await holdSignIn(sandbox, visitor, "Visitor", held, "loaded");
    await renewSignIns("job-visitor");
    assert.equal(await stored("Keeper"), "signed-in");

    // The browser it was lent to, for the bot allowed it, renews it
    const keeper = await browser("job-keeper", "signed-in");
    await holdSignIn(sandbox, keeper, "Keeper", held, "loaded");
    await browserHolds(php("rotated"));
    await renewSignIns("job-keeper");
    assert.equal(await stored("Keeper"), "rotated");

    // `open` in that session starts another browser under the same name: the visitor's
    // cookie it gets is not the lent one's
    await sandbox.exec("playwright-cli open", { env: keeper });
    await browserHolds(php("anonymous"));
    await renewSignIns("job-keeper");
    assert.equal(await stored("Keeper"), "rotated");
  } finally {
    await removeSignIn(held.site, held.account);
    await closeBrowserFixtures();
  }
});

test("a browser holds the sign-in loaded into it last, gives back the one before first, and one made in it anew is not the lent one", async () => {
  const { keepSignIn, holdSignIn, releaseSignIn, renewSignIns, removeSignIn } =
    await signIns();
  const { createSignInTools } = await import(
    "../features/ai/tools/signin.tool.ts"
  );
  const { jobShellEnv, openWorkspace } = await import(
    "../features/workspace/workspace.ts"
  );
  const sandbox = await openWorkspace();
  const env = jobShellEnv("job-lend");
  const stored = (site: string) => keptValue(site, "Keeper");
  const tools = createSignInTools(sandbox, "Keeper", env);
  const use = (site: string) => callTool(tools, T.sign_in_use, { site });

  await browserOpen(env);
  try {
    await keepSignIn({
      site: "shop.example",
      account: "a",
      bot: "Keeper",
      state: { cookies: [cookie("shop.example", "shop-1")] },
    });
    // Kept from a browser that held the shop, so it carries an old copy of the shop's cookie
    await keepSignIn({
      site: "mail.example",
      account: "a",
      bot: "Keeper",
      state: {
        cookies: [
          cookie("mail.example", "mail-1"),
          cookie("shop.example", "shop-0"),
        ],
      },
    });

    assert.match(await use("shop.example"), /^Signed in to shop\.example/);
    // The site renews its cookie while the bot works; lending the mail clears the browser,
    // so the shop's goes back first
    await browserHolds(cookie("shop.example", "shop-2"));
    assert.match(await use("mail.example"), /^Signed in to mail\.example/);
    assert.equal(await stored("shop.example"), "shop-2");

    // The browser holds the mail's state alone now, its old copy of the shop's included
    await browserHolds(
      cookie("mail.example", "mail-2"),
      cookie("shop.example", "shop-0"),
    );
    await renewSignIns("job-lend");
    assert.equal(await stored("mail.example"), "mail-2");
    assert.equal(await stored("shop.example"), "shop-2");

    // Someone signs in to the mail anew in that browser: that sign-in is not the lent one
    releaseSignIn(env, "mail.example");
    await browserHolds(cookie("mail.example", "someone-else"));
    await renewSignIns("job-lend");
    assert.equal(await stored("mail.example"), "mail-2");

    // One kept from a browser the app lent the shop to: the browser holds both
    await use("shop.example");
    await holdSignIn(
      sandbox,
      env,
      "Keeper",
      { site: "mail.example", account: "a" },
      "kept",
    );
    await browserHolds(
      cookie("shop.example", "shop-3"),
      cookie("mail.example", "mail-3"),
    );
    await renewSignIns("job-lend");
    assert.equal(await stored("shop.example"), "shop-3");
    assert.equal(await stored("mail.example"), "mail-3");

    // Kept in a window, which closes and opens again with the same storage loaded back:
    // still the browser that holds both, and the bot is told the account to ask for
    await browserOpen(env, true);
    await browserHolds(
      cookie("shop.example", "shop-4"),
      cookie("mail.example", "mail-3"),
    );
    assert.match(
      await callTool(tools, T.sign_in_keep, {
        site: "shop.example",
        account: "a",
      }),
      /^Kept: shop\.example as a, in place of .*window was for the sign-in.* with shop\.example and `account` a again\.$/,
    );
    assert.equal(await stored("shop.example"), "shop-4");
    await browserHolds(
      cookie("shop.example", "shop-5"),
      cookie("mail.example", "mail-4"),
    );
    await renewSignIns("job-lend");
    assert.equal(await stored("shop.example"), "shop-5");
    assert.equal(await stored("mail.example"), "mail-4");
  } finally {
    await removeSignIn("shop.example", "a");
    await removeSignIn("mail.example", "a");
    await closeBrowserFixtures();
  }
});

test("a site keeps a sign-in per account, a bot names the one it uses, and one account's cookies never go into another's", async () => {
  const {
    keepSignIn,
    borrowSignIn,
    listSignIns,
    setSignInBot,
    removeSignIn,
    renewSignIns,
  } = await signIns();
  const { createSignInTools } = await import(
    "../features/ai/tools/signin.tool.ts"
  );
  const { jobShellEnv, openWorkspace } = await import(
    "../features/workspace/workspace.ts"
  );
  const sandbox = await openWorkspace();
  const env = jobShellEnv("job-accounts");
  const session = (value: string) =>
    cookie(".instagram.test", value, "sessionid");
  const state = (value: string) => ({ cookies: [session(value)] });
  const keep = (account: string, bot: string, another?: boolean) =>
    keepSignIn({
      site: "instagram.test",
      account,
      bot,
      state: state(`${account}-1`),
      another,
    });
  const valueOf = (account: string) =>
    keptValue("instagram.test", "Jarvis", account, ".instagram.test");
  const accounts = async (site = "instagram.test") =>
    (await listSignIns())
      .filter((one) => one.site === site)
      .map((one) => one.account);
  const tools = createSignInTools(sandbox, "Jarvis", env);
  const use = (input: { site: string; account?: string }) =>
    callTool(tools, T.sign_in_use, input);

  try {
    assert.equal((await keep("@main", "Jarvis")).kind, "kept");
    // A name the site does not keep is asked about before it is a second row
    const unlisted = await keep("@shop", "Jarvis");
    assert.deepEqual(unlisted, {
      kind: "unlisted",
      site: "instagram.test",
      accounts: ["@main"],
    });
    assert.deepEqual(await accounts(), ["@main"]);
    // Said to be another account, it is kept beside the first, for the bot that kept it alone
    const shop = await keep("@shop", "Marketer", true);
    assert.equal(shop.kind, "kept");
    assert.deepEqual(shop.kind === "kept" && shop.signIn.bots, ["Marketer"]);
    // The same account signed in again replaces its own row, however it is spaced
    const again = await keep(" @main ", "Jarvis");
    assert.equal(again.kind === "kept" && again.replaced, true);
    assert.deepEqual(await accounts(), ["@main", "@shop"]);
    // Two names apart only in case stay two, on a disk that ignores case too
    assert.equal((await keep("@Main", "Jarvis", true)).kind, "kept");
    assert.deepEqual(await accounts(), ["@main", "@Main", "@shop"]);
    await removeSignIn("instagram.test", "@Main");
    assert.deepEqual(await accounts(), ["@main", "@shop"]);

    // A site that shows no name keeps its first account under the site's own name: a second
    // said to be another account needs a name that tells it apart, and the first stays
    const quiet = (account: string, another?: boolean) =>
      keepSignIn({
        site: "quiet.test",
        account,
        bot: "Jarvis",
        state: { cookies: [cookie("quiet.test", `${account || "first"}-q`)] },
        another,
      });
    assert.equal((await quiet("")).kind, "kept");
    assert.deepEqual(await quiet("", true), {
      kind: "clash",
      site: "quiet.test",
      accounts: ["quiet.test"],
    });
    assert.equal(
      await keptValue("quiet.test", "Jarvis", "quiet.test"),
      "first-q",
    );
    assert.equal((await quiet("work", true)).kind, "kept");
    assert.deepEqual(await accounts("quiet.test"), ["quiet.test", "work"]);

    // With two kept, none is picked for the bot: it names one, or is told which there are
    assert.deepEqual(await borrowSignIn("instagram.test", "Jarvis"), {
      kind: "pick",
      site: "instagram.test",
      accounts: ["@main", "@shop"],
    });
    assert.match(
      await use({ site: "instagram.test" }),
      /keeps more than one account: @main, @shop\. Call again with `account`/,
    );
    assert.match(
      await use({ site: "instagram.test", account: "@gone" }),
      /Nothing is kept for instagram\.test as @gone\. Kept there: @main, @shop/,
    );
    // A subdomain reads the site's accounts
    assert.equal(
      (await borrowSignIn("m.instagram.test", "Jarvis", "@main")).kind,
      "state",
    );
    // Asking for an account it may not use lists the bot on that account alone, and it is
    // told the account to name when it calls again
    assert.match(
      await use({ site: "instagram.test", account: "@shop" }),
      /Call again with `account` @shop once they have said yes\.$/,
    );
    assert.deepEqual(
      (await listSignIns())
        .filter((one) => one.site === "instagram.test")
        .map((one) => [one.account, one.asking]),
      [
        ["@main", []],
        ["@shop", ["Jarvis"]],
      ],
    );
    await setSignInBot("instagram.test", "@shop", "Jarvis", true);

    // One browser, one account after the other: each account's cookie goes back to its own
    await browserOpen(env);
    assert.match(
      await use({ site: "instagram.test", account: "@main" }),
      /^Signed in to instagram\.test as @main\./,
    );
    await browserHolds(session("main-2"));
    assert.match(
      await use({ site: "instagram.test", account: "@shop" }),
      /^Signed in to instagram\.test as @shop\./,
    );
    await browserHolds(session("shop-2"));
    await renewSignIns("job-accounts");
    assert.equal(await valueOf("@main"), "main-2");
    assert.equal(await valueOf("@shop"), "shop-2");

    // Keeping a name the site does not keep, or one it does as another account, is asked
    // about in words the bot can act on, and nothing is written
    await browserHolds(session("new-1"));
    assert.match(
      await callTool(tools, T.sign_in_keep, {
        site: "instagram.test",
        account: "@new",
        keepWindow: true,
      }),
      /^Not kept yet: instagram\.test keeps @main, @shop\. .*`another` set to true\.$/,
    );
    assert.match(
      await callTool(tools, T.sign_in_keep, {
        site: "instagram.test",
        account: "@main",
        keepWindow: true,
        another: true,
      }),
      /keeps a sign-in as @main already\. .*tells it apart from @main, @shop/,
    );
    assert.deepEqual(await accounts(), ["@main", "@shop"]);
    assert.equal(await valueOf("@main"), "main-2");

    // Signing out of one account leaves the other, which a bot then gets without naming it
    await removeSignIn("instagram.test", "@shop");
    assert.deepEqual(await accounts(), ["@main"]);
    assert.equal(
      (await borrowSignIn("instagram.test", "Jarvis")).kind,
      "state",
    );
  } finally {
    for (const account of ["@main", "@shop", "@Main", "@new"])
      await removeSignIn("instagram.test", account);
    for (const account of ["quiet.test", "work"])
      await removeSignIn("quiet.test", account);
    await closeBrowserFixtures();
  }
});

test("a sign-in lent again comes back as the site renewed it, and what the app does to one browser runs one at a time", async () => {
  const { keepSignIn, setSignInBot, renewSignIns, removeSignIn, listSignIns } =
    await signIns();
  const { createSignInTools } = await import(
    "../features/ai/tools/signin.tool.ts"
  );
  const { jobShellEnv, openWorkspace } = await import(
    "../features/workspace/workspace.ts"
  );
  const sandbox = await openWorkspace();
  const env = jobShellEnv("job-lanes");
  const tools = createSignInTools(sandbox, "Jarvis", env);
  const use = (account: string) =>
    callTool(tools, T.sign_in_use, { site: "mail.test", account });
  const session = (value: string) => cookie(".mail.test", value, "session");
  const valueOf = (account: string) =>
    keptValue("mail.test", "Jarvis", account, ".mail.test");
  const inBrowser = async () =>
    (
      JSON.parse(await readFile(join(home, "state.json"), "utf8")) as {
        cookies: Cookie[];
      }
    ).cookies[0]?.value;

  await browserOpen(env);
  try {
    await keepSignIn({
      site: "mail.test",
      account: "one",
      bot: "Jarvis",
      state: { cookies: [session("one-1")] },
    });
    await keepSignIn({
      site: "mail.test",
      account: "two",
      bot: "Jarvis",
      state: { cookies: [session("two-1")] },
      another: true,
    });

    // Lent, renewed by the site while the bot works, then asked for again: what goes into
    // the browser is the renewed session, not the copy read before it came back
    assert.match(await use("one"), /^Signed in to mail\.test as one\./);
    await browserHolds(session("one-2"));
    await use("one");
    assert.equal(await inBrowser(), "one-2");
    assert.equal(await valueOf("one"), "one-2");

    // Two accounts lent in one step go in one after the other, so the browser holds the one
    // its hold names, and what it renews goes to that account alone
    await Promise.all([use("one"), use("two")]);
    assert.equal(await inBrowser(), "two-1");
    await browserHolds(session("two-3"));
    await renewSignIns("job-lanes");
    assert.equal(await valueOf("two"), "two-3");
    assert.equal(await valueOf("one"), "one-2");

    // The user lets a bot in while a turn's renewal writes the same account: both stay
    await browserHolds(session("two-4"));
    await Promise.all([
      renewSignIns("job-lanes"),
      setSignInBot("mail.test", "two", "Marketer", true),
    ]);
    assert.deepEqual(
      (await listSignIns()).find((one) => one.account === "two")?.bots,
      ["Jarvis", "Marketer"],
    );
    assert.equal(await valueOf("two"), "two-4");
  } finally {
    await removeSignIn("mail.test", "one");
    await removeSignIn("mail.test", "two");
    await closeBrowserFixtures();
  }
});

test("a sign-in an older build kept in one file a site is read where it is, moves when it is written, and goes with its sign-out", async () => {
  const { borrowSignIn, listSignIns, removeSignIn } = await signIns();
  const { DATA_DIR, PATHS } = await import("../config.ts");
  const { existsSync } = await import("node:fs");
  const vault = join(DATA_DIR, PATHS.signIns);
  const older = join(vault, "legacy.test.json");
  const record = (bots: string[]) =>
    JSON.stringify({
      site: "legacy.test",
      account: "old@example.com",
      bots,
      asking: [],
      keptAt: new Date().toISOString(),
      usedAt: null,
      state: { cookies: [] },
    });
  const listed = async () =>
    (await listSignIns())
      .filter((one) => one.site === "legacy.test")
      .map((one) => [one.account, one.bots]);

  await mkdir(vault, { recursive: true });
  try {
    await writeFile(older, record(["Jarvis"]));
    // Read where it is: listed, and lent
    assert.deepEqual(await listed(), [["old@example.com", ["Jarvis"]]]);
    assert.equal((await borrowSignIn("legacy.test", "Jarvis")).kind, "state");
    // Lending writes when it was used, into the account's own file, and the older one goes
    assert.equal(existsSync(older), false);
    assert.deepEqual(await listed(), [["old@example.com", ["Jarvis"]]]);

    // An older copy beside the account's own file is not a second row, and signing out
    // removes both: nothing is left to come back on the next start
    await writeFile(older, record(["Other"]));
    assert.deepEqual(await listed(), [["old@example.com", ["Jarvis"]]]);
    await removeSignIn("legacy.test", "old@example.com");
    assert.equal(existsSync(older), false);
    assert.deepEqual(await listed(), []);

    // A file that is no whole sign-in is left out, and the others still read
    await writeFile(
      join(vault, "broken.test.json"),
      JSON.stringify({ site: "broken.test", account: "x" }),
    );
    await writeFile(older, record(["Jarvis"]));
    assert.deepEqual(await listed(), [["old@example.com", ["Jarvis"]]]);
    assert.equal((await borrowSignIn("broken.test", "Jarvis")).kind, "none");
  } finally {
    await removeSignIn("legacy.test", "old@example.com");
    await rm(join(vault, "broken.test.json"), { force: true });
  }
});

test("a sign-in whose write fails is still the one kept before", async () => {
  const { keepSignIn, removeSignIn } = await signIns();
  const { DATA_DIR, PATHS } = await import("../config.ts");
  const { readdir } = await import("node:fs/promises");
  const vault = join(DATA_DIR, PATHS.signIns);
  const held = { site: "bank.test", account: "a@example.com" };
  try {
    await keepSignIn({
      ...held,
      bot: "Keeper",
      state: { cookies: [cookie("bank.test", "signed-in")] },
    });
    const [file] = (await readdir(vault)).filter((name) =>
      name.startsWith("bank.test@"),
    );
    // Where the next write lands before it is moved over: a folder there refuses it, as a
    // full disk would
    await mkdir(join(vault, `${file}.saving`));
    // Lending stamps when it was used, which is a write
    await assert.rejects(keptValue("bank.test", "Keeper"));
    await rm(join(vault, `${file}.saving`), { recursive: true });
    assert.equal(await keptValue("bank.test", "Keeper"), "signed-in");
    assert.deepEqual(
      (await readdir(vault)).filter((name) => name.endsWith(".saving")),
      [],
    );
  } finally {
    await removeSignIn(held.site, held.account);
  }
});

test("the Skills screen lists each bot's own — its kit and what it found or wrote — and only the latter can be changed", async () => {
  const { findAllSkills, deleteSkill, writeSkillFile } = await import(
    "../features/skills/skills.query.ts"
  );
  const { WORKSPACE } = await import("../features/workspace/workspace.ts");
  const { createBot, deleteBot } = await import("../features/bot/bot.query.ts");
  const { existsSync } = await import("node:fs");
  const made = await createBot({
    name: "Writer",
    description: "Writing",
    toolIds: [],
  });
  // Installed under the seed's old name, and kept by that name
  const kept = await createBot({
    name: "Marketer",
    description: "Marketing",
    toolIds: [],
  });
  const own = join(
    WORKSPACE,
    "bots",
    "Jarvis",
    ".agents",
    "skills",
    "notes-style",
  );
  await mkdir(own, { recursive: true });
  await writeFile(
    join(own, "SKILL.md"),
    "---\nname: notes-style\ndescription: Writes notes as they like them. Use it for notes.\n---\nBody\n",
  );
  try {
    const all = await findAllSkills();
    const found = all.find((skill) => skill.source === "own:Jarvis");
    assert.equal(found?.name, "notes-style");
    assert.equal(found?.bot, "Jarvis");
    const kit = all.find(
      (skill) => skill.source === "kit:Writer" && skill.name === "marketing",
    );
    assert.equal(kit?.bot, "Writer");
    // The bot installed under the old name still lists the kit it reads
    assert.ok(
      all.some(
        (skill) =>
          skill.source === "kit:Marketer" && skill.name === "marketing",
      ),
    );
    // Every bot's still come first and last, as before
    assert.equal(all[0]?.source, "default");

    // What a bot wrote is the user's to change; what ships with a bot is not
    await writeSkillFile(
      "own:Jarvis",
      "notes-style",
      "SKILL.md",
      "---\nname: notes-style\ndescription: Changed. Use it.\n---\n",
    );
    await assert.rejects(
      writeSkillFile("kit:Writer", "marketing", "SKILL.md", "x"),
      /read-only/,
    );
    await assert.rejects(
      deleteSkill("kit:Writer", "marketing"),
      /switched off/,
    );
    await deleteSkill("own:Jarvis", "notes-style");
    assert.equal(existsSync(own), false);
  } finally {
    await rm(own, { recursive: true, force: true });
    if (made) await deleteBot("Writer");
    if (kept) await deleteBot("Marketer");
  }
});

test("a deleted bot's finished work stays a shelf under its name, sets and all", async () => {
  const { readShelf, deleteArtifact } = await import(
    "../features/artifact/artifact.query.ts"
  );
  const { WORKSPACE, removeBotFolder } = await import(
    "../features/workspace/workspace.ts"
  );
  const { createBot, deleteBot } = await import("../features/bot/bot.query.ts");
  await createBot({ name: "Tutor", description: "Explains", toolIds: [] });
  const shelf = join(WORKSPACE, "artifacts", "Tutor");
  await mkdir(join(shelf, "book-1"), { recursive: true });
  await writeFile(join(shelf, "note.html"), "<p>note</p>");
  await writeFile(join(shelf, "book-1", "book-1.html"), "<p>book</p>");
  await writeFile(join(shelf, ".DS_Store"), "");
  try {
    await deleteBot("Tutor");
    await removeBotFolder("Tutor");
    const { entries } = await readShelf(50);
    const tutor = entries
      .filter((entry) => entry.bot === "Tutor")
      .map((entry) => `${entry.kind} ${entry.name}`)
      .sort();
    // Both of its things, each a row of its own, and nothing hidden among them
    assert.deepEqual(tutor, ["file note.html", "set book-1"]);
    // Its whole folder is not one artifact to delete, as a live bot's is not
    await assert.rejects(
      deleteArtifact("artifacts/Tutor"),
      /a bot's whole folder/,
    );
  } finally {
    await rm(shelf, { recursive: true, force: true });
  }
});

test("a bot's runs in one thread send the same instructions and cache key, and the thread adds up what the cache served", async () => {
  const { threadTable } = await import("../database/tables.ts");
  const system = (prompt: string) => JSON.stringify(JSON.parse(prompt)[0]);
  usage.inputTokens.cacheRead = 60 as never;
  usage.inputTokens.cacheWrite = 30 as never;
  // A minute in the instructions made every later run miss the cache; the half day does not move here
  mock.timers.enable({ apis: ["Date"], now: new Date(2026, 8, 26, 13, 5) });
  try {
    plans.set("Alpha", [() => text("First pass")]);
    const id = await startThread({
      bot: "Alpha",
      request: "Cache fixture",
      label: "Cache",
      from: "user",
    });
    await waitFor(id, "done");
    mock.timers.setTime(new Date(2026, 8, 26, 17, 40).getTime());
    plans.set("Alpha", [() => text("Second pass")]);
    await answerThread(id, "Once more.");
    await waitFor(id, "done");
    const [first, second] = (inputs.get("Alpha") ?? []).slice(-2);
    assert.equal(system(second), system(first));
    const [key, again] = (cacheKeys.get("Alpha") ?? []).slice(-2);
    assert.match(String(key), /^[0-9a-f]{32}$/);
    assert.equal(again, key);

    plans.set("Alpha", [() => text("Elsewhere")]);
    const other = await startThread({
      bot: "Alpha",
      request: "Another cache fixture",
      label: "Cache elsewhere",
      from: "user",
    });
    await waitFor(other, "done");
    assert.notEqual(cacheKeys.get("Alpha")?.at(-1), key);

    const [row] = await database
      .select({
        input: threadTable.inputTokens,
        read: threadTable.cacheReadTokens,
        write: threadTable.cacheWriteTokens,
      })
      .from(threadTable)
      .where(eq(threadTable.id, id));
    assert.deepEqual(row, { input: 200, read: 120, write: 60 });
  } finally {
    mock.timers.reset();
    usage.inputTokens.cacheRead = undefined;
    usage.inputTokens.cacheWrite = undefined;
  }
});

test("a bot that opens a note sends the same instructions on its next run in the thread", async () => {
  const { createNoteWithFacts, readNotes, deleteAllNotes } = await import(
    "../features/memory/memory.query.ts"
  );
  const system = (prompt: string) => JSON.stringify(JSON.parse(prompt)[0]);
  const fact = (text: string) => [{ text }];
  await createNoteWithFacts("topics/apples", "Apples", fact("Red"), "user");
  await createNoteWithFacts("topics/pears", "Pears", fact("Green"), "user");
  try {
    plans.set("Alpha", [() => text("First pass")]);
    const id = await startThread({
      bot: "Alpha",
      request: "Memory order fixture",
      label: "Memory order",
      from: "user",
    });
    await waitFor(id, "done");
    // What `memory_recall` does to a note (memory.tool countReads): it is the warmest now
    await readNotes(["topics/pears"], { touch: true });
    plans.set("Alpha", [() => text("Second pass")]);
    await answerThread(id, "Once more.");
    await waitFor(id, "done");
    const [first, second] = (inputs.get("Alpha") ?? []).slice(-2);
    assert.match(system(first), /topics\/apples.*topics\/pears/);
    assert.equal(system(second), system(first));
  } finally {
    await deleteAllNotes();
  }
});

test("a bot reads how the user wants things done in its instructions, not by opening the note", async () => {
  const { createNoteWithFacts, deleteAllNotes, readNotes } = await import(
    "../features/memory/memory.query.ts"
  );
  const { createMemoryTools } = await import(
    "../features/ai/tools/memory.tool.ts"
  );
  const fact = (text: string) => [{ text }];
  // The root notes may be there already (memory.query ensureRootNotes): a fact goes into it
  const [kept] = (await readNotes(["preferences"], { touch: false })).notes;
  if (kept)
    await createMemoryTools("user", null)[T.memory_remember].execute!(
      { path: "preferences", facts: fact("Metric units, always") },
      { toolCallId: "prefs", messages: [], context: {} },
    );
  else
    await createNoteWithFacts(
      "preferences",
      "How they want things done",
      fact("Metric units, always"),
      "user",
    );
  await createNoteWithFacts("topics/apples", "Apples", fact("Red"), "user");
  let system = "";
  try {
    plans.set("Alpha", [
      (prompt) => {
        system = JSON.stringify(JSON.parse(prompt)[0]);
        return text("Done in metres.");
      },
    ]);
    const id = await startThread({
      bot: "Alpha",
      request: "Preferences fixture",
      label: "Preferences",
      from: "user",
    });
    await waitFor(id, "done");
    assert.match(system, /preferences:(\\n- [^\\]*)*\\n- Metric units, always/);
    // Written out, so not listed again; another note is still only its line
    assert.doesNotMatch(system, /- preferences — /);
    assert.match(system, /- topics\/apples — Apples \(1\)/);
    assert.doesNotMatch(system, /Red/);
  } finally {
    await deleteAllNotes();
  }
});

test("a note about a file reaches the thread that reported it, even after that thread was taken up again", async () => {
  const { readFileThread, tellFileThread } = await import(
    "../features/bot/thread.file.ts"
  );
  const page = `${botArtifacts("Alpha")}/note-plan.html`;
  await mkdir(join(WORKSPACE, botArtifacts("Alpha")), { recursive: true });
  await writeFile(join(WORKSPACE, page), "<p>plan</p>");
  plans.set("Alpha", [() => text(`The plan is at ${page}`)]);
  const id = await startThread({
    bot: "Alpha",
    request: "Plan fixture",
    label: "Plan",
    from: "user",
  });
  await waitFor(id, "done");
  // Taken up again and ended without naming it: the outcome forgets the file, the report does not
  plans.set("Alpha", [() => text("Nothing else changed.")]);
  await answerThread(id, "Anything else?");
  await waitFor(id, "done");
  assert.equal((await findThread(id))?.outcome, "Nothing else changed.");
  assert.deepEqual(await readFileThread(page), {
    state: "open",
    thread: { id, label: "Plan", bot: "Alpha" },
    status: "done",
    to: "Alpha",
    coordinator: "Alpha",
    paused: null,
  });

  plans.set("Alpha", [
    (prompt) => {
      assert.ok(prompt.includes(`About \`${page}\``));
      assert.ok(prompt.includes("Make the title shorter."));
      return text("Shortened.");
    },
  ]);
  assert.deepEqual(await tellFileThread(page, "Make the title shorter."), {
    id,
    label: "Plan",
    to: "Alpha",
  });
  await waitFor(id, "done");
  assert.equal((await findThread(id))?.outcome, "Shortened.");

  assert.deepEqual(
    await readFileThread(`${botArtifacts("Alpha")}/never-made.html`),
    { state: "gone" },
  );
  const unreported = `${botArtifacts("Alpha")}/note-unreported.html`;
  await writeFile(join(WORKSPACE, unreported), "<p>x</p>");
  assert.deepEqual(await readFileThread(unreported), {
    state: "none",
    bot: "Alpha",
    threadDeleted: false,
  });
  await assert.rejects(
    tellFileThread(unreported, "Hello"),
    /No thread's report names this file/,
  );

  // Deleted while the file was open from it: said as that, and its report went with it
  const { removeThread } = await import("../features/bot/bot.runner.ts");
  await removeThread(id);
  assert.deepEqual(await readFileThread(page, id), {
    state: "none",
    bot: "Alpha",
    threadDeleted: true,
  });
  await assert.rejects(
    tellFileThread(page, "Hello", id),
    /This file's thread was deleted/,
  );
  assert.deepEqual(await readFileThread(page), {
    state: "none",
    bot: "Alpha",
    threadDeleted: false,
  });
});

test("a note about a helper's file reaches the helper, and none is sent to a thread waiting on a question or left without its bot", async () => {
  const { readFileThread, tellFileThread } = await import(
    "../features/bot/thread.file.ts"
  );
  const chart = `${botArtifacts("Beta")}/note-chart.html`;
  await mkdir(join(WORKSPACE, botArtifacts("Beta")), { recursive: true });
  await writeFile(join(WORKSPACE, chart), "<p>chart</p>");
  plans.set("Alpha", [
    () => ask("Beta", "Draw the chart"),
    () => text("Waiting."),
    () => text(`Done: ${chart}`),
  ]);
  plans.set("Beta", [() => text(`Drew ${chart}`)]);
  const id = await startThread({
    bot: "Alpha",
    request: "Chart fixture",
    label: "Chart",
    from: "user",
  });
  await waitFor(id, "done");
  const found = await readFileThread(chart);
  assert.equal(found.state === "open" && found.to, "Beta");
  plans.set("Beta", [
    (prompt) => {
      assert.ok(prompt.includes(`About \`${chart}\``));
      return text("Recoloured.");
    },
  ]);
  plans.set("Alpha", [
    (prompt) => {
      assert.ok(prompt.includes("Recoloured."));
      return text(`Updated: ${chart}`);
    },
  ]);
  assert.equal((await tellFileThread(chart, "Use warmer colours.")).to, "Beta");
  await waitFor(id, "done");

  // Asked: a note now would be taken as the answer, so it is not sent
  plans.set("Alpha", [
    () => ask("Thursday", "Which colour?"),
    () => text("Waiting for the user."),
  ]);
  await answerThread(id, "One more change.");
  await waitFor(id, "waiting");
  const asking = await readFileThread(chart, id);
  assert.equal(asking.state, "asking");
  assert.equal(asking.state === "asking" && asking.bot, "Alpha");
  await assert.rejects(
    tellFileThread(chart, "Blue.", id),
    /Alpha is waiting on your answer to a question/,
  );
  await cancelThread(id);

  // Its bot deleted, or its model out of reach: said before anything is sent
  const report = `${botArtifacts("Gamma")}/note-report.html`;
  await mkdir(join(WORKSPACE, botArtifacts("Gamma")), { recursive: true });
  await writeFile(join(WORKSPACE, report), "<p>report</p>");
  plans.set("Gamma", [() => text(`Report: ${report}`)]);
  const own = await startThread({
    bot: "Gamma",
    request: "Report fixture",
    label: "Report",
    from: "user",
  });
  await waitFor(own, "done");
  const [gamma] = await database
    .select()
    .from(botTable)
    .where(eq(botTable.name, "Gamma"));
  try {
    await database
      .update(botTable)
      .set({ model: "refused" })
      .where(eq(botTable.name, "Gamma"));
    assert.deepEqual(await readFileThread(report), {
      state: "refused",
      thread: { id: own, label: "Report", bot: "Gamma" },
      reason: "model",
      why: "No key for refused.",
    });
    await database.delete(botTable).where(eq(botTable.name, "Gamma"));
    const gone = await readFileThread(report);
    assert.equal(gone.state, "refused");
    assert.match(gone.state === "refused" ? gone.why : "", /Gamma was deleted/);
    await assert.rejects(tellFileThread(report, "Again."), /Gamma was deleted/);
  } finally {
    await database
      .insert(botTable)
      .values(gamma)
      .onConflictDoUpdate({ target: botTable.name, set: { model: "Gamma" } });
  }
});

test("every command and write in a shell tells a file open on screen to look again", async () => {
  const { appEvents } = await import("../app/api/events/app-event.server.ts");
  const { openWorkspace } = await import("../features/workspace/workspace.ts");
  let told = 0;
  const stop = appEvents.subscribe((event) => {
    if (event.type === "files") told += 1;
  });
  try {
    const sandbox = await openWorkspace();
    // A job an earlier test finished closes its browsers on its own time (bot.runner), and
    // listing them is a command too: each call here tells at least once more
    let seen = told;
    await sandbox.exec("true");
    assert.ok(told > seen);
    seen = told;
    await sandbox.writeFile("scratch/files-signal.txt", "x");
    assert.ok(told > seen);
    seen = told;
    // A command that failed may have written part of a file
    assert.equal((await sandbox.exec("exit 3")).exitCode, 3);
    assert.ok(told > seen);
  } finally {
    stop();
  }
});

test("a file of a set its report did not name finds the thread that named another file of the set", async () => {
  const { readFileThread } = await import("../features/bot/thread.file.ts");
  const shelf = botArtifacts("Alpha");
  const set = `${shelf}/note-set`;
  await mkdir(join(WORKSPACE, set), { recursive: true });
  await writeFile(join(WORKSPACE, `${set}/flyer.html`), "<p>flyer</p>");
  // A skill's overview picture, beside the page the report names
  await writeFile(join(WORKSPACE, `${set}/boards.png`), "png");
  await writeFile(join(WORKSPACE, `${shelf}/note-set-loose.png`), "png");
  plans.set("Alpha", [() => text(`The flyer: ${set}/flyer.html`)]);
  const id = await startThread({
    bot: "Alpha",
    request: "Set fixture",
    label: "Set",
    from: "user",
  });
  await waitFor(id, "done");
  const found = await readFileThread(`${set}/boards.png`);
  assert.equal(found.state === "open" && found.thread.id, id);
  // A file on the shelf beside the set is not one of it, however its name begins
  assert.equal(
    (await readFileThread(`${shelf}/note-set-loose.png`)).state,
    "none",
  );
});

test("a report naming a file by a full path, from a data folder since moved, still finds its thread", async () => {
  const { readFileThread } = await import("../features/bot/thread.file.ts");
  const { PATHS } = await import("../config.ts");
  const page = `${botArtifacts("Alpha")}/note-moved.html`;
  await mkdir(join(WORKSPACE, botArtifacts("Alpha")), { recursive: true });
  await writeFile(join(WORKSPACE, page), "<p>moved</p>");
  plans.set("Alpha", [
    () =>
      text(`Written to /Users/someone/.thursday/${PATHS.workspace}/${page}`),
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Moved fixture",
    label: "Moved",
    from: "user",
  });
  await waitFor(id, "done");
  const found = await readFileThread(page);
  assert.equal(found.state === "open" && found.thread.id, id);
});

test("a job handed over from the screen keeps the user's words as its name up to THREAD_LABEL_CHARS, cut at a word", async () => {
  const { THREAD_LABEL_CHARS } = await import("../config.ts");
  const { labelOfWords } = await import("../features/bot/bot.schema.ts");
  // A request of a sentence is its own name, on one line
  const sentence =
    "Compare the three cheapest flights from Lisbon to Berlin next Friday";
  assert.equal(
    labelOfWords(`  ${sentence.replace(" to ", "\n to ")}  `),
    sentence,
  );
  // A longer one ends on a whole word within the count
  const long = `${sentence} and book the one with the shortest layover, then add it to my calendar with the booking reference`;
  const named = labelOfWords(long);
  assert.ok(named.length <= THREAD_LABEL_CHARS);
  assert.ok(named.endsWith("…"));
  assert.ok(long.startsWith(named.slice(0, -1)));
  assert.equal(long[named.length - 1], " ");
  // Words written without spaces are cut where the count ends
  const unspaced = "字".repeat(THREAD_LABEL_CHARS * 2);
  assert.equal(
    labelOfWords(unspaced),
    `${"字".repeat(THREAD_LABEL_CHARS - 1)}…`,
  );
});

test("clearing finished threads lists the workspace's browsers once and closes each thread's own", async () => {
  const { removeFinishedThreads } = await import(
    "../features/bot/bot.runner.ts"
  );
  const ids: string[] = [];
  await rm(join(home, "listed.txt"), { force: true });
  for (const label of ["First", "Second", "Third"]) {
    plans.set("Alpha", [() => text(`${label} is done.`)]);
    const id = await startThread({
      bot: "Alpha",
      request: `${label} clearing fixture`,
      label: `Clearing ${label}`,
      from: "user",
    });
    await waitFor(id, "done");
    ids.push(id);
  }
  // Each finish lists for its own hidden browsers; those are not what is counted below
  await linesReach("listed.txt", 3);
  // The second left a browser with no window, and a job that is not over has one too
  await writeFile(
    join(home, "browsers.json"),
    JSON.stringify({
      browsers: [
        { name: `thread-${ids[1]}`, headed: false },
        { name: "thread-still-working", headed: false },
      ],
    }),
  );
  for (const name of ["listed.txt", "closed.txt"])
    await rm(join(home, name), { force: true });
  try {
    assert.ok((await removeFinishedThreads()) >= 3);
    for (const id of ids) assert.equal(await findThread(id), null);
    // One `list` for all of them, where each thread asked for its own
    assert.equal(await readFile(join(home, "listed.txt"), "utf8"), "list\n");
    assert.equal(
      await readFile(join(home, "closed.txt"), "utf8"),
      `thread-${ids[1]}\n`,
    );
    // A thread removed by itself still asks for itself
    plans.set("Alpha", [() => text("Alone is done.")]);
    const alone = await startThread({
      bot: "Alpha",
      request: "Alone clearing fixture",
      label: "Clearing alone",
      from: "user",
    });
    await waitFor(alone, "done");
    // Its finish lists once for its own hidden browsers
    await linesReach("listed.txt", 2);
    const { removeThread } = await import("../features/bot/bot.runner.ts");
    await removeThread(alone);
    assert.equal(
      await readFile(join(home, "listed.txt"), "utf8"),
      "list\nlist\nlist\n",
    );
  } finally {
    await rm(join(home, "browsers.json"), { force: true });
  }
});

test("a job that finishes closes the browsers nobody can see, and leaves a window on their screen and their own Chrome", async () => {
  const finish = gate();
  plans.set("Alpha", [
    async () => {
      await finish.shut;
      return text("Found it.");
    },
  ]);
  const id = await startThread({
    bot: "Alpha",
    request: "Finish closes fixture",
    label: "Finish closes",
    from: "user",
  });
  await writeFile(
    join(home, "browsers.json"),
    JSON.stringify({
      browsers: [
        { name: `thread-${id}-bot-hidden`, headed: false },
        { name: `thread-${id}-bot-window`, headed: true },
        { name: `thread-${id}-bot-theirs`, headed: false, attached: true },
        { name: "thread-someone-else", headed: false },
      ],
    }),
  );
  for (const name of ["listed.txt", "closed.txt"])
    await rm(join(home, name), { force: true });
  try {
    finish.open();
    await waitFor(id, "done");
    await linesReach("closed.txt", 1);
    assert.equal(
      await readFile(join(home, "closed.txt"), "utf8"),
      `thread-${id}-bot-hidden\n`,
    );
  } finally {
    await rm(join(home, "browsers.json"), { force: true });
  }
});

test("idle browsers close for a job past BROWSER_IDLE, and not for one used since", async () => {
  const { closeIdleBrowsers } = await import("../features/bot/bot.runner.ts");
  const { BROWSER_IDLE } = await import("../config.ts");
  const { threadTable } = await import("../database/tables.ts");
  const ids: string[] = [];
  await rm(join(home, "listed.txt"), { force: true });
  for (const label of ["Idle", "Recent"]) {
    plans.set("Alpha", [() => text(`${label} is done.`)]);
    const id = await startThread({
      bot: "Alpha",
      request: `${label} sweep fixture`,
      label: `Sweep ${label}`,
      from: "user",
    });
    await waitFor(id, "done");
    ids.push(id);
  }
  await linesReach("listed.txt", 2);
  // Both still have one, as if their own close had been missed; only the first is old
  await database
    .update(threadTable)
    .set({
      updatedAt: new Date(Date.now() - BROWSER_IDLE.closeAfterMs - 60_000),
    })
    .where(eq(threadTable.id, ids[0]));
  await writeFile(
    join(home, "browsers.json"),
    JSON.stringify({
      browsers: ids.map((id) => ({ name: `thread-${id}`, headed: false })),
    }),
  );
  await rm(join(home, "closed.txt"), { force: true });
  try {
    await closeIdleBrowsers();
    assert.equal(
      await readFile(join(home, "closed.txt"), "utf8"),
      `thread-${ids[0]}\n`,
    );
  } finally {
    await rm(join(home, "browsers.json"), { force: true });
  }
});

test("a browser list that failed is not an empty one: nothing is closed, and the thread still goes", async () => {
  const { removeThread } = await import("../features/bot/bot.runner.ts");
  const { listBrowsers, jobShellEnv, openWorkspace } = await import(
    "../features/workspace/workspace.ts"
  );
  plans.set("Alpha", [() => text("Done.")]);
  const id = await startThread({
    bot: "Alpha",
    request: "Failed list fixture",
    label: "Failed list",
    from: "user",
  });
  await waitFor(id, "done");
  await writeFile(
    join(home, "browsers.json"),
    JSON.stringify({ browsers: [{ name: `thread-${id}`, headed: false }] }),
  );
  await writeFile(join(home, "list-fails"), "");
  await rm(join(home, "closed.txt"), { force: true });
  try {
    await assert.rejects(
      listBrowsers(await openWorkspace(), jobShellEnv(id)),
      /playwright-cli list failed \(1\)/,
    );
    assert.equal(await removeThread(id), true);
    assert.equal(await findThread(id), null);
    await assert.rejects(readFile(join(home, "closed.txt"), "utf8"), /ENOENT/);
  } finally {
    await rm(join(home, "list-fails"), { force: true });
    await rm(join(home, "browsers.json"), { force: true });
  }
});

test("the thread history finds words across every thread on the server: label, ending or bot, any case, and a % is only a %", async () => {
  const { insertThread, deleteThread, listThreadHistory } = await import(
    "../features/bot/thread.query.ts"
  );
  const { threadTable } = await import("../database/tables.ts");
  const made: string[] = [];
  try {
    for (const [label, outcome] of [
      ["Lisbon weather lookup", "Sunny, 21°C."],
      ["Budget sheet", "Spent 40% on GROCERIES this month."],
      ["Packing list", null],
    ] as const) {
      const thread = await insertThread({
        bot: "Alpha",
        label,
        request: "History search fixture",
        opening: "History search fixture",
      });
      made.push(thread.id);
      await database
        .update(threadTable)
        .set({ status: "done", outcome })
        .where(eq(threadTable.id, thread.id));
    }
    const found = async (search: string) =>
      (await listThreadHistory({ search, limit: 500 }))
        .filter((thread) => made.includes(thread.id))
        .map((thread) => thread.label);
    assert.deepEqual(await found("LISBON"), ["Lisbon weather lookup"]);
    assert.deepEqual(await found("groceries"), ["Budget sheet"]);
    assert.deepEqual(await found("40%"), ["Budget sheet"]);
    assert.deepEqual(await found("%"), ["Budget sheet"]);
    assert.deepEqual(await found("no such words"), []);
    assert.equal((await found("alpha")).length, 3);
  } finally {
    for (const id of made) await deleteThread(id);
  }
});
