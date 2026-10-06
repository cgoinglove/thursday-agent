import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

// Secrets at rest: the key a data folder keeps in its `.env`, what is sealed with it and what
// is not, what an older build wrote in the clear, and a key that cannot open what was sealed.
// No network.
const home = await mkdtemp(join(tmpdir(), "thursday-secrets-"));
process.env.THURSDAY_HOME = home;
const ROOT = join(import.meta.dirname, "..");

// What this machine exports stays out of it: the environment wins over a row (readConfig)
const OPENAI = "OPENAI_API_KEY";
const CHATGPT = "CHATGPT_SIGN_IN";
const ANTHROPIC = "ANTHROPIC_API_KEY";
const { EXA_API_KEY, DEFAULT_MODEL_KEY, DEFAULT_EFFORT_KEY } = await import(
  "../features/config/config.const.ts"
);
const {
  reachPersonKey,
  SLACK_APP_TOKEN_KEY,
  SLACK_BOT_TOKEN_KEY,
  TELEGRAM_TOKEN_KEY,
} = await import("../features/reach/reach.schema.ts");
for (const name of [
  "THURSDAY_ENCRYPTION_KEY",
  OPENAI,
  CHATGPT,
  ANTHROPIC,
  EXA_API_KEY,
  TELEGRAM_TOKEN_KEY,
  SLACK_APP_TOKEN_KEY,
  SLACK_BOT_TOKEN_KEY,
  DEFAULT_MODEL_KEY,
  DEFAULT_EFFORT_KEY,
])
  delete process.env[name];

const secret = await import("../lib/secret.ts");
const { DB_PATH, ENV_PATH } = await import("../config.ts");
const { migrateDatabase } = await import("../database/migrate.ts");
await migrateDatabase();
const { database } = await import("../database/db.ts");
const { configTable, mcpServerTable } = await import("../database/tables.ts");
const config = await import("../features/config/config.query.ts");
const mcp = await import("../features/connectors/mcp.query.ts");
const { isPublicError } = await import("../lib/public-error.ts");
const { sql } = await import("drizzle-orm");

after(() => rm(home, { recursive: true, force: true }));

const SEALED = /^enc:v1:[A-Za-z0-9_-]+$/;

/** A config row as it lies in the file, unopened. */
async function rawConfig(key: string): Promise<string | undefined> {
  const rows = await database.all<{ value: string }>(
    sql`select value from config where key = ${key}`,
  );
  return rows[0]?.value;
}

/** Written as an older build wrote it, or under a key this folder does not have. */
async function putConfig(key: string, value: string) {
  await database
    .insert(configTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: configTable.key, set: { value } });
}

/** A connector's row as it lies in the file: its config and oauth as JSON text. */
async function rawServer(name: string) {
  const rows = await database.all<{ config: string; oauth: string | null }>(
    sql`select config, oauth from mcp_server where name = ${name}`,
  );
  assert.ok(rows[0], `no row for ${name}`);
  return rows[0];
}

/** What the Connectors screen shows on a connector's row. */
async function lastErrorOf(name: string) {
  const server = (await mcp.findAllServers()).find((one) => one.name === name);
  assert.ok(server, `no server ${name}`);
  return server.lastError;
}

/**
 * Whether `words` lie anywhere in the database's files, byte for byte: the pages in use, the
 * pages a change freed, and the write-ahead log beside them — all a copy of the folder carries.
 */
async function inDatabaseFiles(words: string): Promise<boolean> {
  for (const file of [DB_PATH, `${DB_PATH}-wal`]) {
    const bytes = await readFile(file).catch(() => Buffer.alloc(0));
    if (bytes.includes(words)) return true;
  }
  return false;
}

/** A connector's config as the manager connects with it: its credentials opened. */
async function openedConfig(name: string) {
  const server = await mcp.findServer(name);
  assert.ok(server, `no server ${name}`);
  return server.config;
}

/** Settings' own reads, as the screen asks for them. */
async function get<T>(route: {
  GET: (request: Request, context: never) => Promise<Response>;
}): Promise<T> {
  const response = await route.GET(new Request("http://127.0.0.1/api"), {
    params: Promise.resolve({}),
  } as never);
  const body = (await response.json()) as {
    $ok: boolean;
    data?: T;
    message?: string;
  };
  assert.equal(body.$ok, true, body.message ?? "the route failed");
  return body.data as T;
}

const refusedAs = (words: RegExp) => (error: unknown) =>
  isPublicError(error) && words.test(error.message);

/** What a server action returned; its refusal fails the test, in its words. */
function dataOf<T>(
  result: { $ok: true; data: T } | { $ok: false; message?: string },
): T {
  if (!result.$ok) assert.fail(result.message ?? "the action was refused");
  return result.data;
}

/**
 * An MCP server that takes OAuth, on loopback, as far as a sign-in begins: it turns every call
 * away, and answers discovery and client registration. `hits` is every request it was sent.
 */
async function signInServer() {
  const hits: string[] = [];
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", origin).pathname;
    hits.push(`${request.method} ${path}`);
    const json = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (path.startsWith("/.well-known/oauth-protected-resource"))
      return json(200, {
        resource: `${origin}/mcp`,
        authorization_servers: [origin],
      });
    if (path.startsWith("/.well-known/oauth-authorization-server"))
      return json(200, {
        issuer: origin,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        registration_endpoint: `${origin}/register`,
        response_types_supported: ["code"],
        code_challenge_methods_supported: ["S256"],
      });
    if (path === "/register") {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () =>
        json(201, { ...JSON.parse(body), client_id: "fresh-client" }),
      );
      return;
    }
    response.writeHead(401, {
      "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
    });
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url: `${origin}/mcp`,
    origin,
    hits,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/**
 * What `next dev` loads from each folder's .env into process.env, which this app reads first.
 * Its loader is resolved through `next`, the copy Next itself runs, not a dependency of this
 * repo's own (knip.json ignores it for that).
 */
function nextReads(dirs: string[]): (string | undefined)[] {
  const require = createRequire(import.meta.url);
  const loader = require.resolve("@next/env", {
    paths: [require.resolve("next")],
  });
  const run = spawnSync(
    process.execPath,
    [
      "-e",
      `const { loadEnvConfig } = require(${JSON.stringify(loader)});
       const read = ${JSON.stringify(dirs)}.map((dir) => {
         delete process.env.THURSDAY_ENCRYPTION_KEY;
         loadEnvConfig(dir, true, { info() {}, error() {} }, true);
         return process.env.THURSDAY_ENCRYPTION_KEY ?? null;
       });
       process.stdout.write(JSON.stringify(read));`,
    ],
    // As `next dev` runs: nothing of this process's own environment to win over a file
    {
      env: { PATH: process.env.PATH, NODE_ENV: "development" },
      encoding: "utf8",
    },
  );
  assert.equal(run.stderr, "");
  return (JSON.parse(run.stdout) as (string | null)[]).map(
    (value) => value ?? undefined,
  );
}

test("a pick or a domain's own row is written as it is, and reading it makes no key", async () => {
  await config.writeConfig(DEFAULT_MODEL_KEY, "xai/grok-4");
  await config.writeConfig("INTRO_PASSED", "on");
  assert.equal(await rawConfig(DEFAULT_MODEL_KEY), "xai/grok-4");
  assert.equal(await rawConfig("INTRO_PASSED"), "on");
  assert.equal(await config.readConfig(DEFAULT_MODEL_KEY), "xai/grok-4");
  assert.equal(existsSync(ENV_PATH), false);
});

test("a key is sealed before it is written, and the first one makes the folder's key in its .env", async () => {
  await config.writeConfig(OPENAI, "sk-test-0123456789");
  const stored = await rawConfig(OPENAI);
  assert.match(stored ?? "", SEALED);
  assert.ok(!stored?.includes("sk-test"));
  assert.equal(await config.readConfig(OPENAI), "sk-test-0123456789");
  assert.equal(await config.hasConfig(OPENAI), true);
  assert.equal(await config.isCallable(), true);

  const kept = await readFile(ENV_PATH, "utf8");
  assert.match(kept, /^THURSDAY_ENCRYPTION_KEY=[A-Za-z0-9+/]{43}=$/m);
  if (process.platform !== "win32")
    assert.equal((await stat(ENV_PATH)).mode & 0o777, 0o600);
});

test("the ChatGPT sign-in and a phone's token are secrets too; a pick is not", async () => {
  await config.writeConfig(CHATGPT, JSON.stringify({ access: "at-secret" }));
  await config.writeConfig(TELEGRAM_TOKEN_KEY, "123:token-secret");
  await config.writeConfig(DEFAULT_EFFORT_KEY, "low");
  assert.match((await rawConfig(CHATGPT)) ?? "", SEALED);
  assert.match((await rawConfig(TELEGRAM_TOKEN_KEY)) ?? "", SEALED);
  assert.equal(await rawConfig(DEFAULT_EFFORT_KEY), "low");
  assert.equal(await config.readConfig(TELEGRAM_TOKEN_KEY), "123:token-secret");
  // An emptied token reads as none, as it did in the clear
  await config.writeConfig(TELEGRAM_TOKEN_KEY, "");
  assert.equal(await config.readConfig(TELEGRAM_TOKEN_KEY), undefined);
  assert.equal(await config.hasConfig(TELEGRAM_TOKEN_KEY), false);
});

test("the environment still wins over a sealed row", async () => {
  await config.writeConfig(EXA_API_KEY, "exa-from-settings");
  process.env[EXA_API_KEY] = "exa-from-env";
  try {
    assert.equal(await config.readConfig(EXA_API_KEY), "exa-from-env");
    assert.equal(await config.hasConfig(EXA_API_KEY), true);
  } finally {
    delete process.env[EXA_API_KEY];
  }
  assert.equal(await config.readConfig(EXA_API_KEY), "exa-from-settings");
});

test("a key the environment sets is marked env, and Settings refuses to replace or remove it rather than report it done", async () => {
  const { removeConfigAction, setConfigAction } = await import(
    "../features/config/config.action.ts"
  );
  const route = await import("../app/api/config/route.ts");
  await config.writeConfig(EXA_API_KEY, "exa-from-settings");
  const saved = await rawConfig(EXA_API_KEY);
  process.env[EXA_API_KEY] = "exa-from-env";
  try {
    const status =
      await get<{ key: string; set: boolean; env?: true }[]>(route);
    assert.deepEqual(
      status.find((one) => one.key === EXA_API_KEY),
      { key: EXA_API_KEY, set: true, env: true },
    );

    // Refused in the words the screen shows, and the row is as it was
    for (const refused of [
      await removeConfigAction(EXA_API_KEY),
      await setConfigAction(EXA_API_KEY, "exa-typed-into-settings"),
    ]) {
      assert.equal(refused.$ok, false);
      assert.match(
        (refused as { message?: string }).message ?? "",
        /set in the environment the app started with/,
      );
    }
    assert.equal(await rawConfig(EXA_API_KEY), saved);
    assert.equal(await config.readConfig(EXA_API_KEY), "exa-from-env");
  } finally {
    delete process.env[EXA_API_KEY];
  }

  // Without it, the row is Settings' own again: not marked, and removed when asked
  const status = await get<{ key: string; env?: true }[]>(route);
  assert.equal(status.find((one) => one.key === EXA_API_KEY)?.env, undefined);
  dataOf(await removeConfigAction(EXA_API_KEY));
  assert.equal(await rawConfig(EXA_API_KEY), undefined);
  await config.writeConfig(EXA_API_KEY, "exa-from-settings");
});

test("keys an older build wrote in the clear read as before, and are sealed at boot once", async () => {
  await putConfig(TELEGRAM_TOKEN_KEY, "456:legacy-token");
  await putConfig(EXA_API_KEY, "exa-legacy");
  await putConfig(DEFAULT_EFFORT_KEY, "high");
  assert.equal(await config.readConfig(TELEGRAM_TOKEN_KEY), "456:legacy-token");

  const first = await config.sealConfigSecrets();
  assert.deepEqual(first, { sealed: 2, unreadable: [] });
  assert.match((await rawConfig(TELEGRAM_TOKEN_KEY)) ?? "", SEALED);
  assert.match((await rawConfig(EXA_API_KEY)) ?? "", SEALED);
  assert.equal(await rawConfig(DEFAULT_EFFORT_KEY), "high");
  assert.equal(await config.readConfig(TELEGRAM_TOKEN_KEY), "456:legacy-token");
  assert.equal(await config.readConfig(EXA_API_KEY), "exa-legacy");

  // Every start runs it: the rows sealed already stay exactly as they are
  const before = await rawConfig(EXA_API_KEY);
  assert.deepEqual(await config.sealConfigSecrets(), {
    sealed: 0,
    unreadable: [],
  });
  assert.equal(await rawConfig(EXA_API_KEY), before);
});

test("a key sealed under a key this folder no longer has is asked for again — never used, never in the way, and Settings still opens", async () => {
  const lost = randomBytes(32);
  await putConfig(OPENAI, secret.sealSecret("sk-sealed-elsewhere", lost));
  await putConfig(CHATGPT, secret.sealSecret('{"access":"x"}', lost));
  await putConfig(EXA_API_KEY, secret.sealSecret("exa-sealed-elsewhere", lost));

  // Read as none, as anywhere a key may be absent: what can go without it goes on
  assert.equal(await config.readConfig(OPENAI), undefined);
  assert.equal(await config.readConfig(EXA_API_KEY), undefined);
  assert.equal(await config.hasConfig(OPENAI), false);
  assert.equal(await config.configState(OPENAI), "unreadable");

  // A use that needs that one key says why, where to put the file back, and what to do otherwise
  assert.match(
    await config.missingKeyWords(OPENAI, "No OpenAI key"),
    /^The saved OpenAI key can't be unlocked any more: the \.env in the data folder that unlocks it was lost or replaced \(THURSDAY_ENCRYPTION_KEY in .*\.env\)\. Enter it again in Settings\.$/,
  );
  assert.match(
    await config.missingKeyWords(CHATGPT, "Not signed in"),
    / sign-in can't be unlocked any more: .* Sign in again in Settings\.$/,
  );
  assert.equal(
    await config.missingKeyWords(ANTHROPIC, "No Anthropic key"),
    "No Anthropic key",
  );
  const { getTextModel } = await import("../features/ai/model.ts");
  await assert.rejects(
    getTextModel({ provider: "openai", model: "gpt-5-mini" }),
    refusedAs(/^The saved OpenAI key can't be unlocked any more: /),
  );
  // The first screen asks for the voice key again rather than failing to draw
  assert.equal(await config.isCallable(), false);
  const { unreadable } = await config.sealConfigSecrets();
  assert.deepEqual(unreadable.sort(), [CHATGPT, EXA_API_KEY, OPENAI].sort());

  // Settings draws both as unset and marked to be entered again, and the plan of a sign-in it
  // cannot open is not read
  const status = await get<{ key: string; set: boolean; unreadable?: true }[]>(
    await import("../app/api/config/route.ts"),
  );
  assert.deepEqual(
    status.find((one) => one.key === OPENAI),
    { key: OPENAI, set: false, unreadable: true },
  );
  assert.deepEqual(
    status.find((one) => one.key === CHATGPT),
    { key: CHATGPT, set: false, unreadable: true },
  );
  assert.deepEqual(
    status.find((one) => one.key === DEFAULT_EFFORT_KEY),
    { key: DEFAULT_EFFORT_KEY, set: true, value: "high" },
  );
  // The model picker's providers say it as Settings does, not as a key never given
  const providers = await get<
    { id: string; hasKey: boolean; lostKey?: true; plan?: string | null }[]
  >(await import("../app/api/llm-model/route.ts"));
  const openai = providers.find((one) => one.id === "openai");
  assert.equal(openai?.hasKey, false);
  assert.equal(openai?.lostKey, true);
  assert.equal(providers.find((one) => one.id === "chatgpt")?.plan, null);
  assert.equal(providers.find((one) => one.id === "chatgpt")?.lostKey, true);
  assert.equal(
    providers.find((one) => one.id === "anthropic")?.lostKey,
    undefined,
  );

  // Entering it again replaces it, and the mark goes with it
  await config.writeConfig(OPENAI, "sk-entered-again");
  assert.equal(await config.readConfig(OPENAI), "sk-entered-again");
  assert.equal(await config.isCallable(), true);
  assert.equal(await config.configState(OPENAI), "set");
  // Removed, it is gone rather than lost
  await config.removeConfig(CHATGPT);
  assert.equal(await config.configState(CHATGPT), "unset");
  await config.writeConfig(EXA_API_KEY, "exa-entered-again");
});

test("a key the environment sets is not named as lost: its row is never read", async () => {
  await putConfig(ANTHROPIC, secret.sealSecret("sk-ant-lost", randomBytes(32)));
  process.env[ANTHROPIC] = "sk-ant-from-env";
  try {
    assert.equal(await config.configState(ANTHROPIC), "set");
    assert.equal(await config.readConfig(ANTHROPIC), "sk-ant-from-env");
    assert.deepEqual((await config.sealConfigSecrets()).unreadable, []);
  } finally {
    delete process.env[ANTHROPIC];
  }
  // Without it, the row is what counts again
  assert.deepEqual((await config.sealConfigSecrets()).unreadable, [ANTHROPIC]);
  await config.removeConfig(ANTHROPIC);
  assert.deepEqual((await config.sealConfigSecrets()).unreadable, []);
});

test("a connector's headers and env are sealed; its url, command and args are not", async () => {
  await mcp.upsertServer({
    name: "remote",
    config: {
      url: "https://mcp.example.com/mcp",
      headers: { Authorization: "Bearer ghp_secret" },
    },
  });
  await mcp.upsertServer({
    name: "local",
    config: {
      command: "npx",
      args: ["-y", "some-server"],
      env: { SOME_TOKEN: "tok_secret" },
    },
  });

  const remote = await rawServer("remote");
  assert.ok(!remote.config.includes("ghp_secret"));
  assert.match(JSON.parse(remote.config).headers.Authorization, SEALED);
  assert.equal(JSON.parse(remote.config).url, "https://mcp.example.com/mcp");
  const local = await rawServer("local");
  assert.ok(!local.config.includes("tok_secret"));
  assert.deepEqual(JSON.parse(local.config).args, ["-y", "some-server"]);

  // The manager connects with them opened
  assert.deepEqual(await openedConfig("remote"), {
    url: "https://mcp.example.com/mcp",
    headers: { Authorization: "Bearer ghp_secret" },
  });
  assert.deepEqual(await openedConfig("local"), {
    command: "npx",
    args: ["-y", "some-server"],
    env: { SOME_TOKEN: "tok_secret" },
  });
  // Registering again replaces what it had
  await mcp.upsertServer({
    name: "remote",
    config: {
      url: "https://mcp.example.com/mcp",
      headers: { Authorization: "Bearer ghp_rotated" },
    },
  });
  assert.deepEqual(await openedConfig("remote"), {
    url: "https://mcp.example.com/mcp",
    headers: { Authorization: "Bearer ghp_rotated" },
  });
});

test("OAuth tokens are sealed, and the state the callback looks a server up by is not", async () => {
  await mcp.saveOAuthData("remote", {
    state: "st-123",
    codeVerifier: "verifier-secret",
    tokens: {
      access_token: "at-secret",
      refresh_token: "rt-secret",
      token_type: "Bearer",
    },
    clientInformation: { client_id: "cid", client_secret: "cs-secret" },
    authorizationServer: { issuer: "https://auth.example.com" },
  });
  const { oauth } = await rawServer("remote");
  for (const word of ["at-secret", "rt-secret", "cs-secret", "verifier-secret"])
    assert.ok(!oauth?.includes(word), `${word} is in the clear`);
  assert.equal(JSON.parse(oauth ?? "{}").state, "st-123");
  assert.match(JSON.parse(oauth ?? "{}").sealed, SEALED);

  const byState = await mcp.findServerByOAuthState("st-123");
  assert.equal(byState?.name, "remote");
  assert.equal(byState?.oauth?.codeVerifier, "verifier-secret");
  assert.deepEqual(byState?.oauth?.tokens, {
    access_token: "at-secret",
    refresh_token: "rt-secret",
    token_type: "Bearer",
  });
  assert.equal(
    byState?.oauth?.authorizationServer?.issuer,
    "https://auth.example.com",
  );

  // With the handshake's one-shot values and every credential gone, nothing is left to seal
  await mcp.saveOAuthData("remote", {
    state: "st-123",
    authorizationServer: { issuer: "https://auth.example.com" },
  });
  assert.deepEqual(JSON.parse((await rawServer("remote")).oauth ?? "{}"), {
    state: "st-123",
    authorizationServer: { issuer: "https://auth.example.com" },
  });
  await mcp.saveOAuthData("remote", null);
  assert.equal((await rawServer("remote")).oauth, null);
});

test("a connector an older build wrote in the clear reads as before, and is sealed at boot once", async () => {
  // Through the table, as an older build wrote it: nothing sealed
  await database.insert(mcpServerTable).values({
    name: "legacy",
    config: {
      url: "https://legacy.example/mcp",
      headers: { "X-Api-Key": "legacy-key" },
    },
    oauth: {
      state: "st-legacy",
      tokens: { access_token: "legacy-at", token_type: "Bearer" },
    },
  });
  assert.equal(
    (await mcp.findServerByOAuthState("st-legacy"))?.oauth?.tokens
      ?.access_token,
    "legacy-at",
  );

  // "remote" and "local" were sealed as they were written: "legacy" alone is left to seal
  assert.deepEqual(await mcp.sealMcpSecrets(), { sealed: 1, unreadable: [] });
  const row = await rawServer("legacy");
  assert.ok(!row.config.includes("legacy-key"));
  assert.ok(!row.oauth?.includes("legacy-at"));
  assert.equal(
    (await mcp.findServerByOAuthState("st-legacy"))?.oauth?.tokens
      ?.access_token,
    "legacy-at",
  );
  assert.deepEqual(await mcp.sealMcpSecrets(), { sealed: 0, unreadable: [] });
});

test("a sign-in holding both a sealed blob and newer credentials in the clear reads the newer, and is sealed once", async () => {
  // As a server from before the folder lock, still running on the same data folder, saved over a
  // row this build had sealed: the stored fields beside new tokens in the clear
  await database.insert(mcpServerTable).values({
    name: "mixed",
    config: { url: "https://mixed.example/mcp" },
    oauth: {
      state: "st-mixed",
      sealed: secret.sealSecret(
        JSON.stringify({
          clientInformation: { client_id: "cid-mixed" },
          tokens: { access_token: "at-older", token_type: "Bearer" },
        }),
      ),
      tokens: { access_token: "at-newer", token_type: "Bearer" },
    },
  });
  const read = async () => (await mcp.findServer("mixed"))?.oauth;
  assert.equal((await read())?.tokens?.access_token, "at-newer");
  assert.equal((await read())?.clientInformation?.client_id, "cid-mixed");

  assert.deepEqual(await mcp.sealMcpSecrets(), { sealed: 1, unreadable: [] });
  const { oauth } = await rawServer("mixed");
  assert.ok(!oauth?.includes("at-newer"), "the newer token is in the clear");
  assert.deepEqual(Object.keys(JSON.parse(oauth ?? "{}")).sort(), [
    "sealed",
    "state",
  ]);
  assert.equal((await read())?.tokens?.access_token, "at-newer");
  assert.equal((await read())?.clientInformation?.client_id, "cid-mixed");
  // Counted once: the next start finds nothing in the clear
  assert.deepEqual(await mcp.sealMcpSecrets(), { sealed: 0, unreadable: [] });
  await mcp.deleteServer("mixed");
});

test("boot leaves no key an older build kept in the clear anywhere in the file, and a rewrite a reader held back is finished by the next start", async () => {
  const { sealStoredSecrets } = await import(
    "../features/config/config.seal.ts"
  );
  const { createClient } = await import("@libsql/client");

  // Sealing alone, as the tests above did, leaves what it replaced in the page it freed
  const earlier = ["456:legacy-token", "exa-legacy", "legacy-key", "legacy-at"];
  for (const words of earlier)
    assert.equal(
      await inDatabaseFiles(words),
      true,
      `${words} was never in the file: this test would prove nothing`,
    );

  // One more an older build kept in the clear, and a reader holding the log while boot runs
  await putConfig(ANTHROPIC, "sk-ant-kept-in-the-clear");
  const reader = createClient({ url: `file:${DB_PATH}` });
  const held = await reader.transaction("read");
  let first: Awaited<ReturnType<typeof sealStoredSecrets>>;
  try {
    await held.execute("select count(*) from config");
    first = await sealStoredSecrets();
  } finally {
    held.close();
    reader.close();
  }
  assert.deepEqual(first, { sealed: 1, unreadable: [], scrub: "pending" });

  // The next start has nothing left to seal, and still finishes the rewrite
  assert.deepEqual(await sealStoredSecrets(), {
    sealed: 0,
    unreadable: [],
    scrub: "done",
  });
  for (const words of [...earlier, "sk-ant-kept-in-the-clear"])
    assert.equal(await inDatabaseFiles(words), false, `${words} is left`);
  assert.equal(await config.readConfig(ANTHROPIC), "sk-ant-kept-in-the-clear");
  // And the one after it does nothing at all
  assert.deepEqual(await sealStoredSecrets(), {
    sealed: 0,
    unreadable: [],
    scrub: "none",
  });
  await config.removeConfig(ANTHROPIC);
});

test("a connector whose key was sealed under a key this folder no longer has says to add it again, on its row too", async () => {
  await database.insert(mcpServerTable).values({
    name: "stranger",
    config: {
      url: "https://stranger.example/mcp",
      headers: {
        Authorization: secret.sealSecret("Bearer x", randomBytes(32)),
      },
    },
  });
  const addAgain =
    /^The key saved for "stranger" can't be unlocked any more: .* Add it again under the same name, with its key: bots keep the tools they pinned\.$/;
  await assert.rejects(mcp.findServer("stranger"), refusedAs(addAgain));
  assert.deepEqual((await mcp.sealMcpSecrets()).unreadable, ["stranger"]);
  // The Connectors screen says it on the row, and still lists it
  const listed = (await mcp.findAllServers()).find(
    (server) => server.name === "stranger",
  );
  assert.deepEqual(listed?.config, { url: "https://stranger.example/mcp" });
  assert.match(listed?.lastError ?? "", addAgain);

  // Added again under its name with the key: it opens, and the row is clear
  await mcp.upsertServer({
    name: "stranger",
    config: {
      url: "https://stranger.example/mcp",
      headers: { Authorization: "Bearer y" },
    },
  });
  assert.deepEqual(await openedConfig("stranger"), {
    url: "https://stranger.example/mcp",
    headers: { Authorization: "Bearer y" },
  });
  assert.equal(
    (await mcp.findAllServers()).find((server) => server.name === "stranger")
      ?.lastError,
    null,
  );
  await mcp.deleteServer("stranger");
});

test("a connector whose sign-in was sealed under a lost key says so, and nothing but Reconnect writes over it", async () => {
  const signIn = await signInServer();
  try {
    const lostBlob = secret.sealSecret(
      JSON.stringify({
        clientInformation: { client_id: "old-client" },
        tokens: { access_token: "at-gone", refresh_token: "rt-gone" },
      }),
      randomBytes(32),
    );
    await database.insert(mcpServerTable).values({
      name: "signed",
      config: { url: signIn.url },
      oauth: {
        state: "st-signed",
        authorizationServer: { issuer: signIn.origin },
        sealed: lostBlob,
      },
    });
    const again =
      /^The sign-in saved for "signed" can't be unlocked any more: .* Reconnect to sign in again\.$/;
    await assert.rejects(mcp.findServer("signed"), refusedAs(again));
    assert.deepEqual((await mcp.sealMcpSecrets()).unreadable, ["signed"]);
    assert.match((await lastErrorOf("signed")) ?? "", again);

    // A bot's tool call or a routine's reaches nothing and writes nothing: a sign-in started
    // there would put a new client over the one the old .env, put back, still opens
    const { mcpManager } = await import(
      "../features/connectors/mcp.manager.ts"
    );
    const before = await rawServer("signed");
    await assert.rejects(
      mcpManager.callTool("signed", "search", {}),
      refusedAs(again),
    );
    assert.deepEqual(await rawServer("signed"), before);
    assert.equal(signIn.hits.length, 0, signIn.hits.join(", "));

    // Reconnect, where the row sends the user, lets it go and signs in afresh
    const { refreshServerAction } = await import(
      "../features/connectors/mcp.action.ts"
    );
    const reconnected = dataOf(await refreshServerAction("signed"));
    assert.equal(reconnected.status, "auth_required", reconnected.error ?? "");
    assert.ok(
      reconnected.authorizationUrl?.startsWith(`${signIn.origin}/authorize?`),
    );
    assert.ok(signIn.hits.includes("POST /register"));
    const now = await rawServer("signed");
    assert.ok(
      !now.oauth?.includes("fresh-client"),
      "the client is in the clear",
    );
    assert.notEqual(JSON.parse(now.oauth ?? "{}").state, "st-signed");
    assert.notEqual(JSON.parse(now.oauth ?? "{}").sealed, lostBlob);
    const opened = (await mcp.findServer("signed"))?.oauth;
    assert.equal(opened?.clientInformation?.client_id, "fresh-client");
    assert.equal(opened?.tokens, undefined);
  } finally {
    await signIn.close();
    await mcp.deleteServer("signed");
  }
});

test("a .env put back while the app runs is used from then on and made the owner's alone, and one lost while it runs makes no key", async () => {
  const kept = await readFile(ENV_PATH, "utf8");
  const held = secret.encryptionKey().key;
  await mcp.upsertServer({
    name: "restored",
    config: {
      url: "https://restored.example/mcp",
      headers: { Authorization: "Bearer kept" },
    },
  });
  try {
    // Lost while the app runs: it goes on with the key it holds, and writes none
    await rm(ENV_PATH);
    assert.ok(secret.encryptionKey().key.equals(held));
    assert.equal(await config.readConfig(EXA_API_KEY), "exa-entered-again");
    assert.equal(existsSync(ENV_PATH), false);

    // Another key in its place, as the next start makes one: what the first sealed is lost,
    // and the Connectors screen says so on the row
    await writeFile(
      ENV_PATH,
      `THURSDAY_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}\n`,
      { mode: 0o600 },
    );
    assert.equal(await config.configState(EXA_API_KEY), "unreadable");
    assert.ok((await mcp.sealMcpSecrets()).unreadable.includes("restored"));
    assert.match(
      (await lastErrorOf("restored")) ?? "",
      /^The key saved for "restored" can't be unlocked any more: /,
    );

    // Put back from a backup, with the umask's mode: used at once, with no restart, so a key
    // entered now is sealed under the key the next start reads
    await writeFile(ENV_PATH, kept);
    await chmod(ENV_PATH, 0o644);
    assert.equal(await config.readConfig(EXA_API_KEY), "exa-entered-again");
    assert.ok(secret.encryptionKey().key.equals(held));
    if (process.platform !== "win32")
      assert.equal((await stat(ENV_PATH)).mode & 0o777, 0o600);
    // And the next pass takes the words off every row that opens again
    assert.deepEqual((await mcp.sealMcpSecrets()).unreadable, []);
    assert.equal(await lastErrorOf("restored"), null);
    for (const server of await mcp.findAllServers())
      assert.doesNotMatch(server.lastError ?? "", /can't be unlocked/);
    assert.deepEqual(await openedConfig("restored"), {
      url: "https://restored.example/mcp",
      headers: { Authorization: "Bearer kept" },
    });
  } finally {
    await writeFile(ENV_PATH, kept);
    await mcp.deleteServer("restored");
  }
});

test("whoever was let in from a phone stays while a lost Slack token is given again, and goes with a token taken out", async () => {
  const { removeConfigAction, setConfigAction } = await import(
    "../features/config/config.action.ts"
  );
  const lost = randomBytes(32);
  const person = JSON.stringify({ chat: "D1", name: "Sam", bot: "B1" });
  await putConfig(SLACK_APP_TOKEN_KEY, secret.sealSecret("xapp-old", lost));
  await putConfig(SLACK_BOT_TOKEN_KEY, secret.sealSecret("xoxb-old", lost));
  await config.writeConfig(reachPersonKey("slack"), person);
  try {
    // Settings asks for Slack's app token first; the bot token, still lost, is not taken out
    dataOf(
      await setConfigAction(
        SLACK_APP_TOKEN_KEY,
        "xapp-1-given-again-0123456789",
      ),
    );
    assert.equal(await config.readConfig(reachPersonKey("slack")), person);

    // A token taken out takes them with it, as it always did
    dataOf(await removeConfigAction(SLACK_BOT_TOKEN_KEY));
    assert.equal(await config.readConfig(reachPersonKey("slack")), undefined);
  } finally {
    for (const key of [
      SLACK_APP_TOKEN_KEY,
      SLACK_BOT_TOKEN_KEY,
      reachPersonKey("slack"),
    ])
      await config.removeConfig(key);
  }
});

test("an older build refuses a database this one opened, instead of sending a sealed value as a key", async () => {
  const migrations = join(ROOT, "database/migrations");
  const seal = (await readdir(migrations)).find((name) =>
    name.endsWith("_seal_secrets"),
  );
  assert.ok(seal, "no seal_secrets migration");
  // An older build is this one before the migration: without it and every one made after it
  // (their names start with when they were made). Its folder is all a build reads them from
  const since = (await readdir(migrations)).filter(
    (name) => /^\d{14}_/.test(name) && name.slice(0, 14) >= seal.slice(0, 14),
  );
  const older = await mkdtemp(join(tmpdir(), "thursday-older-"));
  try {
    await cp(migrations, join(older, "database/migrations"), {
      recursive: true,
    });
    for (const name of since)
      await rm(join(older, "database/migrations", name), { recursive: true });
    // Its boot, as far as the migrations: in a process of its own, as a second start is
    const start = join(older, "start.mts");
    await writeFile(
      start,
      `const { migrateDatabase, NewerDatabase } = await import(${JSON.stringify(join(ROOT, "database/migrate.ts"))});
       await migrateDatabase().then(
         () => console.log("opened"),
         (error) => console.log(error instanceof NewerDatabase ? "refused" : String(error)),
       );`,
    );
    const run = spawnSync(process.execPath, ["--import", "tsx", start], {
      cwd: ROOT,
      env: { ...process.env, THURSDAY_HOME: home, THURSDAY_APP_DIR: older },
      encoding: "utf8",
    });
    assert.equal(run.stdout.trim(), "refused", run.stderr);

    // And the build that ships the migration opens it as it was
    for (const name of since)
      await cp(
        join(migrations, name),
        join(older, "database/migrations", name),
        {
          recursive: true,
        },
      );
    const now = spawnSync(process.execPath, ["--import", "tsx", start], {
      cwd: ROOT,
      env: { ...process.env, THURSDAY_HOME: home, THURSDAY_APP_DIR: older },
      encoding: "utf8",
    });
    assert.equal(now.stdout.trim(), "opened", now.stderr);
  } finally {
    await rm(older, { recursive: true, force: true });
  }
});

test("the folder's key is made once and read back as the next start reads it, the owner's alone", async () => {
  const dir = await mkdtemp(join(tmpdir(), "thursday-key-"));
  try {
    const file = join(dir, "nested", ".env");
    const made = secret.loadEncryptionKey(file);
    assert.equal(made.from, "made");
    const again = secret.loadEncryptionKey(file);
    assert.equal(again.from, "file");
    assert.ok(made.key.equals(again.key));
    const sealed = secret.sealSecret("sk-kept", made.key);
    assert.equal(secret.openSecret(sealed, again.key), "sk-kept");

    // Put back from a backup or written by hand, with the umask's mode: the owner's once read
    if (process.platform !== "win32") {
      await chmod(file, 0o644);
      assert.equal(secret.loadEncryptionKey(file).from, "file");
      assert.equal((await stat(file)).mode & 0o777, 0o600);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a checkout's own .env keeps what it had, and Next reads the key this app reads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "thursday-key-"));
  try {
    const file = join(dir, ".env");
    // No newline at its end, and the name set empty above
    const mine =
      "OPENAI_API_KEY=sk-mine\n# mine\nTHURSDAY_ENCRYPTION_KEY=\nOTHER=1";
    await writeFile(file, mine, { mode: 0o644 });
    const made = secret.loadEncryptionKey(file);
    assert.equal(made.from, "made");
    const text = await readFile(file, "utf8");
    assert.ok(text.startsWith(`${mine}\n`), "what was there changed");
    if (process.platform !== "win32")
      assert.equal((await stat(file)).mode & 0o777, 0o600);

    const [next] = nextReads([dir]);
    assert.ok(Buffer.from(next ?? "", "base64").equals(made.key));
    assert.equal(secret.loadEncryptionKey(file).from, "file");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a key in the environment is not the key: every start reads its data folder's own", async () => {
  const dir = await mkdtemp(join(tmpdir(), "thursday-key-"));
  try {
    const folder = join(dir, "home");
    const start = join(dir, "start.mts");
    await writeFile(
      start,
      `const { encryptionKey } = await import(${JSON.stringify(join(ROOT, "lib/secret.ts"))});
       const { key, from } = encryptionKey();
       console.log(JSON.stringify({ key: key.toString("base64"), from }));`,
    );
    /** One start on `folder`, as a process of its own. */
    const run = (env: Record<string, string>) => {
      const ran = spawnSync(process.execPath, ["--import", "tsx", start], {
        cwd: ROOT,
        env: { ...process.env, THURSDAY_HOME: folder, ...env },
        encoding: "utf8",
      });
      assert.equal(ran.status, 0, ran.stderr);
      return JSON.parse(ran.stdout) as { key: string; from: string };
    };

    // A checkout's key, which Next loads into every start from that checkout, or one exported
    // by hand: the folder makes and keeps its own all the same
    const exported = randomBytes(32).toString("base64");
    const first = run({ THURSDAY_ENCRYPTION_KEY: exported });
    assert.equal(first.from, "made");
    assert.notEqual(first.key, exported);
    // The background job's start, which carries none, and any other, read the same one
    assert.deepEqual(run({}), { key: first.key, from: "file" });
    assert.deepEqual(run({ THURSDAY_ENCRYPTION_KEY: exported }), {
      key: first.key,
      from: "file",
    });
    assert.ok(
      !(await readFile(join(folder, ".env"), "utf8")).includes(exported),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an empty or blank key in the file is none: a key is made below it, and read back as the one — by this app and by Next alike", async () => {
  const dir = await mkdtemp(join(tmpdir(), "thursday-key-"));
  try {
    for (const [at, blank] of ['""', '"   "', "", "   ", "\t \t"].entries()) {
      const folder = join(dir, String(at));
      await mkdir(folder);
      const file = join(folder, ".env");
      // Left blank, as a template leaves it
      await writeFile(file, `THURSDAY_ENCRYPTION_KEY=${blank}\n`);
      const made = secret.loadEncryptionKey(file);
      assert.equal(made.from, "made", JSON.stringify(blank));
      assert.ok(secret.loadEncryptionKey(file).key.equals(made.key));
      const [next] = nextReads([folder]);
      assert.ok(Buffer.from(next ?? "", "base64").equals(made.key));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a key written any way a .env allows is read as Next reads it", async () => {
  const key = randomBytes(32).toString("base64");
  const shapes = [
    `THURSDAY_ENCRYPTION_KEY=${key}`,
    `THURSDAY_ENCRYPTION_KEY="${key}"`,
    `THURSDAY_ENCRYPTION_KEY='${key}'`,
    `THURSDAY_ENCRYPTION_KEY=${key} # kept by Thursday`,
    `export THURSDAY_ENCRYPTION_KEY=${key}`,
    `A=1\r\nTHURSDAY_ENCRYPTION_KEY=${key}\r\n`,
    `A=1\rTHURSDAY_ENCRYPTION_KEY=${key}\r`,
    `﻿THURSDAY_ENCRYPTION_KEY=${key}\n`,
    `THURSDAY_ENCRYPTION_KEY = ${key}`,
    `THURSDAY_ENCRYPTION_KEY=   ${key}   `,
    `THURSDAY_ENCRYPTION_KEY=\nTHURSDAY_ENCRYPTION_KEY=${key}`,
  ];
  const root = await mkdtemp(join(tmpdir(), "thursday-key-"));
  try {
    const dirs = await Promise.all(
      shapes.map(async (text, at) => {
        const dir = join(root, String(at));
        await mkdir(dir);
        await writeFile(join(dir, ".env"), text);
        return dir;
      }),
    );
    const next = nextReads(dirs);
    dirs.forEach((dir, at) => {
      const shape = JSON.stringify(shapes[at]);
      const got = secret.loadEncryptionKey(join(dir, ".env"));
      assert.equal(got.from, "file", shape);
      assert.equal(got.key.toString("base64"), key, shape);
      assert.equal(next[at]?.trim(), key, `Next reads ${shape} otherwise`);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a line that names the key in a form this app does not read stops the load, and nothing is written over it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "thursday-key-"));
  try {
    const file = join(dir, ".env");
    const key = randomBytes(32).toString("base64");
    // Next takes the first as the key: made new here, it would strand what that key sealed
    for (const text of [
      `THURSDAY_ENCRYPTION_KEY: ${key}\n`,
      "THURSDAY_ENCRYPTION_KEY\n",
      "A=1\nexport THURSDAY_ENCRYPTION_KEY\n",
    ]) {
      await writeFile(file, text);
      assert.throws(
        () => secret.loadEncryptionKey(file),
        /^Error: A line of .*\.env names THURSDAY_ENCRYPTION_KEY without setting it as THURSDAY_ENCRYPTION_KEY=<key>, the one form it is read in: write it that way\. Or delete the line, and a new key is made/,
        JSON.stringify(text),
      );
      assert.equal(await readFile(file, "utf8"), text);
    }
    // A name that only starts the same is another variable
    await writeFile(file, `THURSDAY_ENCRYPTION_KEY_OLD=${key}\n`);
    assert.equal(secret.loadEncryptionKey(file).from, "made");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a hex key, a passphrase or one cut short stops the load, saying what to do, and nothing is written over it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "thursday-key-"));
  try {
    const file = join(dir, ".env");
    for (const wrong of [
      randomBytes(32).toString("hex"),
      "hunter2",
      randomBytes(16).toString("base64"),
      `${randomBytes(32).toString("base64")}x`,
    ]) {
      const text = `THURSDAY_ENCRYPTION_KEY=${wrong}\n`;
      await writeFile(file, text);
      assert.throws(
        () => secret.loadEncryptionKey(file),
        /THURSDAY_ENCRYPTION_KEY in .*\.env is not a key: .*openssl rand -base64 32.*Put back the line it had.* delete the line, and a new key is made/,
        wrong,
      );
      assert.equal(await readFile(file, "utf8"), text);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a .env this account cannot read is not replaced by a new key", {
  skip:
    process.platform === "win32" || process.getuid?.() === 0
      ? "file modes do not stop this account"
      : false,
}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "thursday-key-"));
  const file = join(dir, ".env");
  try {
    await writeFile(file, "SOMETHING=1\n");
    await chmod(file, 0o000);
    assert.throws(
      () => secret.loadEncryptionKey(file),
      /Cannot read .*\.env, where THURSDAY_ENCRYPTION_KEY is kept \(EACCES\): let this account read it/,
    );
    await chmod(file, 0o600);
    assert.equal(await readFile(file, "utf8"), "SOMETHING=1\n");
  } finally {
    await chmod(file, 0o600).catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});

test("a folder the key cannot be written to stops the load, saying why", {
  skip:
    process.platform === "win32" || process.getuid?.() === 0
      ? "file modes do not stop this account"
      : false,
}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "thursday-key-"));
  try {
    await chmod(dir, 0o500);
    assert.throws(
      () => secret.loadEncryptionKey(join(dir, ".env")),
      /Cannot write a new THURSDAY_ENCRYPTION_KEY to .* \(EACCES\): let this account write there\.$/,
    );
  } finally {
    await chmod(dir, 0o700);
    await rm(dir, { recursive: true, force: true });
  }
});

test("a sealed value opens under its own key alone, and a changed byte is refused", () => {
  const key = randomBytes(32);
  const words = "sk-ünïcode ✓ with spaces";
  const one = secret.sealSecret(words, key);
  const two = secret.sealSecret(words, key);
  assert.notEqual(one, two, "a nonce was reused");
  assert.equal(secret.openSecret(one, key), words);
  assert.equal(secret.openSecret(secret.sealSecret("", key), key), "");

  assert.throws(
    () => secret.openSecret(one, randomBytes(32)),
    secret.UnreadableSecret,
  );
  const at = one.length - 10;
  const changed = `${one.slice(0, at)}${one[at] === "A" ? "B" : "A"}${one.slice(at + 1)}`;
  assert.throws(() => secret.openSecret(changed, key), secret.UnreadableSecret);
  assert.throws(
    () => secret.openSecret("enc:v1:c2hvcnQ", key),
    secret.UnreadableSecret,
  );
  // Written before sealing began: as it is
  assert.equal(secret.openSecret("sk-plain", key), "sk-plain");
});

test("the key never reaches a bot's shell", async () => {
  const { createSandBox } = await import("../lib/sandbox.ts");
  process.env.THURSDAY_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  try {
    const shell = createSandBox({
      workingDirectory: home,
      spill: { dir: "spill", max: 8000, head: 5500, tail: 1500 },
    });
    const { stdout } = await shell.exec("env");
    assert.ok(
      !stdout
        .split("\n")
        .some((line) => line.startsWith("THURSDAY_ENCRYPTION_KEY=")),
    );
  } finally {
    delete process.env.THURSDAY_ENCRYPTION_KEY;
  }
});

test("what a shell prints never holds a secret, whole or in part: split across what it writes, on stderr, or past where a long one is cut", async () => {
  const { createSandBox, HIDDEN } = await import("../lib/sandbox.ts");
  const KEY = "sk-test-0123456789abcdefghijKEPT";
  const TOKEN = "xoxb-9876543210-zyxwvutsTOKEN";
  const shell = createSandBox({
    workingDirectory: home,
    spill: { dir: "spill", max: 8000, head: 5500, tail: 1500 },
    secrets: async () => [KEY, TOKEN],
  });
  const partOf = (text: string, secret: string) =>
    text.includes(secret.slice(0, 8)) || text.includes(secret.slice(-8));

  const whole = await shell.exec(
    `printf 'a=${KEY}\\n' && printf '${TOKEN}' >&2`,
  );
  assert.equal(whole.stdout, `a=${HIDDEN}\n`);
  assert.equal(whole.stderr, HIDDEN);

  // Two writes a moment apart arrive as two pieces, the secret cut between them
  const split = await shell.exec(
    `printf '${KEY.slice(0, 13)}'; sleep 0.3; printf '${KEY.slice(13)} done'`,
  );
  assert.equal(split.stdout, `${HIDDEN} done`);

  // Long enough to be folded and spilled, with a secret across each cut and in the middle
  const filler = (n: number) => `head -c ${n} /dev/zero | tr '\\0' x`;
  const long = await shell.exec(
    [
      filler(5490),
      `printf '${KEY}'`,
      filler(9000),
      `printf '${TOKEN}'`,
      filler(1490),
      `printf '${KEY}'`,
      filler(20),
    ].join("; "),
  );
  assert.ok(!partOf(long.stdout, KEY) && !partOf(long.stdout, TOKEN));
  assert.ok(long.stdout.includes(HIDDEN));
  const spilled = /is at (\S+)\./.exec(long.stdout)?.[1];
  assert.ok(spilled, "the long output names the file it spilled to");
  const file = await readFile(join(home, spilled), "utf8");
  assert.ok(!partOf(file, KEY) && !partOf(file, TOKEN));
  assert.equal(file.split(HIDDEN).length - 1, 3);

  // What a connector returns goes through fold, which hides them too
  assert.equal(await shell.fold(`token: ${TOKEN}`), `token: ${HIDDEN}`);
});

test("a command whose secrets cannot be read is not run, and says why", async () => {
  const { createSandBox } = await import("../lib/sandbox.ts");
  const shell = createSandBox({
    workingDirectory: home,
    spill: { dir: "spill", max: 8000, head: 5500, tail: 1500 },
    secrets: async () => {
      throw new Error("database is closed");
    },
  });
  const ran = await shell.exec("touch ran-anyway");
  assert.equal(ran.exitCode, -1);
  assert.match(ran.stderr, /^Not run: .*database is closed/);
  assert.ok(!existsSync(join(home, "ran-anyway")));
});

test("a bot's shell hides the folder's key, every key and sign-in Settings keeps, a connector's credentials and a secret the environment holds; a pick and a short value show", async () => {
  const { HIDDEN } = await import("../lib/sandbox.ts");
  const { openWorkspace } = await import("../features/workspace/workspace.ts");
  const apiKey = "sk-proj-shown-nowhere-0123456789";
  const access = "eyJhbGciOi.access-token-of-the-plan.sig";
  const refresh = "rt_refresh-token-of-the-plan-0123";
  const bearer = "ghp_connector-token-0123456789";
  const envToken = "tok_live_connector-env-0123456789";
  const exported = "exported-in-the-shell-profile-0123";
  await config.writeConfig(OPENAI, apiKey);
  await config.writeConfig(
    CHATGPT,
    JSON.stringify({
      access,
      refresh,
      accountId: "acct-0123456789ab",
      expires: 1,
    }),
  );
  await config.writeConfig(DEFAULT_MODEL_KEY, "openai/gpt-shown-in-full");
  await mcp.upsertServer({
    name: "hidden-remote",
    config: {
      url: "https://mcp.example.com/mcp",
      headers: { Authorization: `Bearer ${bearer}` },
    },
  });
  await mcp.upsertServer({
    name: "hidden-local",
    config: {
      command: "npx",
      args: ["-y", "some-server"],
      env: { LOG_LEVEL: "info", API_TOKEN: envToken },
    },
  });
  process.env.SOME_SERVICE_TOKEN = exported;
  try {
    const shell = await openWorkspace();
    const lines = [
      apiKey,
      access,
      refresh,
      bearer,
      envToken,
      exported,
      "openai/gpt-shown-in-full",
      "level=info",
    ];
    await writeFile(join(shell.cwd, "projects", "seen.txt"), lines.join("\n"));
    const { stdout } = await shell.exec("cat ../.env projects/seen.txt");
    for (const value of [...secret.encryptionKeyTexts(), ...lines.slice(0, 6)])
      assert.ok(!stdout.includes(value), `hidden: ${value.slice(0, 12)}…`);
    assert.match(stdout, /THURSDAY_ENCRYPTION_KEY=\[hidden/);
    assert.ok(stdout.includes("openai/gpt-shown-in-full"));
    assert.ok(stdout.includes("level=info"));
    assert.equal(stdout.split(HIDDEN).length - 1, 7);
  } finally {
    delete process.env.SOME_SERVICE_TOKEN;
    await mcp.deleteServer("hidden-remote");
    await mcp.deleteServer("hidden-local");
  }
});
