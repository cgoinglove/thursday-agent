import { and, count, eq, inArray, notInArray, sql } from "drizzle-orm";
import { appEvents } from "@/app/api/events/app-event.server";
import { database } from "@/database/db";
import {
  botMcpToolTable,
  mcpServerTable,
  mcpToolTable,
} from "@/database/tables";
import { lostWords } from "@/features/config/config.const";
import {
  isRemoteConfig,
  type MCPOAuthData,
  type MCPServerConfig,
  type MCPStoredOAuth,
  type MCPToolInfo,
} from "@/features/connectors/mcp.schema";
import { publicError } from "@/lib/public-error";
import {
  isSealed,
  openSecret,
  sealSecret,
  UnreadableSecret,
} from "@/lib/secret";
import { stringsIn } from "@/lib/utils";

/**
 * `oauth` holds tokens, so reads that reach the browser select columns
 * explicitly. Headers, env and the OAuth client are credentials too and stay
 * server-side with it.
 */
function publicConfig(config: MCPServerConfig): MCPServerConfig {
  return isRemoteConfig(config)
    ? { url: config.url }
    : { command: config.command, args: config.args };
}

export async function findAllServers() {
  const rows = await database
    .select({
      name: mcpServerTable.name,
      config: mcpServerTable.config,
      lastError: mcpServerTable.lastError,
      // leftJoin: a server with no tools is still a row with count 0
      toolCount: count(mcpToolTable.id),
    })
    .from(mcpServerTable)
    .leftJoin(mcpToolTable, eq(mcpToolTable.serverName, mcpServerTable.name))
    .groupBy(mcpServerTable.name);
  return rows.map((row) => ({ ...row, config: publicConfig(row.config) }));
}

/** One server with its tools. */
export async function findServerDetail(name: string) {
  const [server] = await database
    .select({
      name: mcpServerTable.name,
      config: mcpServerTable.config,
      lastError: mcpServerTable.lastError,
      toolsSyncedAt: mcpServerTable.toolsSyncedAt,
    })
    .from(mcpServerTable)
    .where(eq(mcpServerTable.name, name));
  if (!server) return null;

  return {
    ...server,
    config: publicConfig(server.config),
    tools: await findServerTools(name),
  };
}

/** A server's tools with ids; pins point at the id. */
async function findServerTools(name: string) {
  return database
    .select({
      id: mcpToolTable.id,
      name: mcpToolTable.name,
      description: mcpToolTable.description,
      inputSchema: mcpToolTable.inputSchema,
      outputSchema: mcpToolTable.outputSchema,
    })
    .from(mcpToolTable)
    .where(eq(mcpToolTable.serverName, name))
    .orderBy(mcpToolTable.name);
}

/** Every tool of every server, light columns only (the bot form's pin picker). */
export function findAllTools() {
  return database
    .select({
      id: mcpToolTable.id,
      name: mcpToolTable.name,
      serverName: mcpToolTable.serverName,
      description: mcpToolTable.description,
    })
    .from(mcpToolTable)
    .orderBy(mcpToolTable.serverName, mcpToolTable.name);
}

/** Server and tool names only, for the prompt; schemas are the heavy column and stay behind `tool_search`. */
export function listToolNames(server?: string) {
  const query = database
    .select({ server: mcpToolTable.serverName, name: mcpToolTable.name })
    .from(mcpToolTable);
  return server
    ? query
        .where(eq(mcpToolTable.serverName, server))
        .orderBy(mcpToolTable.name)
    : query.orderBy(mcpToolTable.serverName, mcpToolTable.name);
}

/** Definitions of the named tools; the one read that carries schemas to the model. */
export function findToolSchemas(server: string, names: string[]) {
  if (!names.length) return Promise.resolve([]);
  return database
    .select({
      name: mcpToolTable.name,
      description: mcpToolTable.description,
      inputSchema: mcpToolTable.inputSchema,
    })
    .from(mcpToolTable)
    .where(
      and(
        eq(mcpToolTable.serverName, server),
        inArray(mcpToolTable.name, names),
      ),
    )
    .orderBy(mcpToolTable.name);
}

/**
 * This bot's pinned tools with schemas; they become tools directly, without
 * `tool_search`. Tools a server stopped reporting cascade away with their row.
 */
export function findPinnedTools(botName: string) {
  return database
    .select({
      server: mcpToolTable.serverName,
      name: mcpToolTable.name,
      description: mcpToolTable.description,
      inputSchema: mcpToolTable.inputSchema,
    })
    .from(botMcpToolTable)
    .innerJoin(mcpToolTable, eq(botMcpToolTable.toolId, mcpToolTable.id))
    .where(eq(botMcpToolTable.botName, botName))
    .orderBy(mcpToolTable.serverName, mcpToolTable.name);
}

/** Registered server names, for answering a missed lookup. */
export function listServerNames() {
  return database
    .select({ name: mcpServerTable.name })
    .from(mcpServerTable)
    .orderBy(mcpServerTable.name);
}

/**
 * A server's credentials are sealed at rest (lib/secret): the values of its headers and env, and
 * its OAuth client, tokens and verifier. Its url, command and args are not, since the lists show
 * them, and neither is the OAuth `state`, which the callback looks up in SQL.
 */
function sealConfig(config: MCPServerConfig): MCPServerConfig {
  if (isRemoteConfig(config))
    return config.headers
      ? { ...config, headers: sealValues(config.headers) }
      : config;
  return config.env ? { ...config, env: sealValues(config.env) } : config;
}

function openConfig(config: MCPServerConfig): MCPServerConfig {
  if (isRemoteConfig(config))
    return config.headers
      ? { ...config, headers: openValues(config.headers) }
      : config;
  return config.env ? { ...config, env: openValues(config.env) } : config;
}

/** Each value sealed; one sealed already stays as it is, so sealing twice is sealing once. */
const sealValues = (values: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      isSealed(value) ? value : sealSecret(value),
    ]),
  );

const openValues = (values: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, openSecret(value)]),
  );

/** The client, tokens and verifier sealed together (mcp.schema MCPStoredOAuth). */
function sealOAuth(oauth: MCPOAuthData): MCPStoredOAuth {
  const { state, authorizationServer, ...secret } = oauth;
  const held = Object.values(secret).some((value) => value !== undefined);
  return {
    state,
    authorizationServer,
    ...(held && { sealed: sealSecret(JSON.stringify(secret)) }),
  };
}

/**
 * What `sealOAuth` stored. A row from before sealing holds it in the clear and comes back as it
 * is; one holding both — a server with no folder lock, from before 0.17.2, saving over a sealed
 * row beside this one — has its clear fields win, as they are the later.
 */
function openOAuth(stored: MCPStoredOAuth): MCPOAuthData {
  const { sealed, ...rest } = stored;
  return sealed
    ? { ...(JSON.parse(openSecret(sealed)) as MCPOAuthData), ...rest }
    : rest;
}

/** A config with its credentials opened; null when this data folder's key cannot open one. */
function openedConfig(config: MCPServerConfig): MCPServerConfig | null {
  try {
    return openConfig(config);
  } catch (cause) {
    if (cause instanceof UnreadableSecret) return null;
    throw cause;
  }
}

/** The OAuth blob opened; null when this data folder's key cannot open it. */
function openedOAuth(stored: MCPStoredOAuth): MCPOAuthData | null {
  try {
    return openOAuth(stored);
  } catch (cause) {
    if (cause instanceof UnreadableSecret) return null;
    throw cause;
  }
}

/**
 * What a connector says when its key cannot be opened. Added again under the same name, its
 * config is replaced and its tool rows stay (upsertServer), so no bot loses a pin; deleting it
 * would take them.
 */
const lostKeyWords = (name: string) =>
  lostWords(
    `The key saved for "${name}"`,
    "Add it again under the same name, with its key: bots keep the tools they pinned.",
  );

const lostSignInWords = (name: string) =>
  lostWords(`The sign-in saved for "${name}"`, "Reconnect to sign in again.");

/**
 * A row with its credentials opened, as the manager connects with them. One this data folder's
 * key cannot open is said in words — the connect that asked shows it (mcp.action), as does the
 * row (sealMcpSecrets). A sign-in that cannot be opened is not started over by a connect nobody
 * asked for, a bot's tool call or a routine's, which would write over the one a `.env` put back
 * could still open: Reconnect does that (`forgetLostSignIn`).
 */
function openRow<
  Row extends {
    name: string;
    config: MCPServerConfig;
    oauth: MCPStoredOAuth | null;
  },
>(row: Row) {
  const config = openedConfig(row.config);
  if (!config) publicError(lostKeyWords(row.name));
  const oauth = row.oauth && openedOAuth(row.oauth);
  if (row.oauth && !oauth) publicError(lostSignInWords(row.name));
  return { ...row, config, oauth };
}

/**
 * Lets go of a sign-in this data folder's key cannot open, keeping what was never secret — the
 * state and the server's metadata — so the connect that follows signs in afresh. Reconnect alone
 * calls it: that is the user asking for the sign-in again. True when there was one to let go.
 */
export async function forgetLostSignIn(name: string): Promise<boolean> {
  const [row] = await database
    .select({ oauth: mcpServerTable.oauth })
    .from(mcpServerTable)
    .where(eq(mcpServerTable.name, name));
  if (!row?.oauth || openedOAuth(row.oauth)) return false;
  await database
    .update(mcpServerTable)
    .set({
      oauth: {
        state: row.oauth.state,
        authorizationServer: row.oauth.authorizationServer,
      },
    })
    .where(eq(mcpServerTable.name, name));
  changed();
  return true;
}

/** The whole row including credentials, opened; for the manager, never a route. */
export async function findServer(name: string) {
  const [server] = await database
    .select()
    .from(mcpServerTable)
    .where(eq(mcpServerTable.name, name));
  return server ? openRow(server) : null;
}

/** Signals the screen to re-read; called at every write. */
const changed = () => appEvents.emit({ type: "mcp" });

/** Re-registering a name replaces its config. */
export async function upsertServer(input: {
  name: string;
  config: MCPServerConfig;
}) {
  const config = sealConfig(input.config);
  await database
    .insert(mcpServerTable)
    .values({ name: input.name, config, lastError: null })
    .onConflictDoUpdate({
      target: mcpServerTable.name,
      // Tools are left alone; the connect that follows syncs them
      set: { config, lastError: null },
    });
  changed();
}

/**
 * After a successful connect. Upserts on (server_name, name) rather than
 * delete-and-insert: new ids would silently empty every bot's pins. Tools no
 * longer reported are deleted and their pins cascade.
 */
export async function syncServerTools(name: string, tools: MCPToolInfo[]) {
  await database.transaction(async (tx) => {
    if (tools.length) {
      await tx
        .insert(mcpToolTable)
        .values(tools.map((tool) => ({ ...tool, serverName: name })))
        .onConflictDoUpdate({
          target: [mcpToolTable.serverName, mcpToolTable.name],
          set: {
            description: excluded(mcpToolTable.description),
            inputSchema: excluded(mcpToolTable.inputSchema),
            outputSchema: excluded(mcpToolTable.outputSchema),
          },
        });
    }

    await tx.delete(mcpToolTable).where(
      tools.length
        ? and(
            eq(mcpToolTable.serverName, name),
            notInArray(
              mcpToolTable.name,
              tools.map((tool) => tool.name),
            ),
          )
        : eq(mcpToolTable.serverName, name),
    );

    await tx
      .update(mcpServerTable)
      .set({ lastError: null, toolsSyncedAt: new Date() })
      .where(eq(mcpServerTable.name, name));
  });
  changed();
}

/** The value the insert would have written. */
function excluded(column: { name: string }) {
  return sql.raw(`excluded."${column.name}"`);
}

/** After a failed connect. Tool rows stay: dropping them would clear every bot's pins on one timeout. */
export async function saveConnectionError(name: string, lastError: string) {
  await database
    .update(mcpServerTable)
    .set({ lastError })
    .where(eq(mcpServerTable.name, name));
  changed();
}

export async function saveOAuthData(name: string, oauth: MCPOAuthData | null) {
  await database
    .update(mcpServerTable)
    .set({ oauth: oauth && sealOAuth(oauth) })
    .where(eq(mcpServerTable.name, name));
  changed();
}

/** The OAuth callback only knows `state`, which is kept in the clear for this (sealOAuth). */
export async function findServerByOAuthState(state: string) {
  const [server] = await database
    .select()
    .from(mcpServerTable)
    .where(sql`json_extract(${mcpServerTable.oauth}, '$.state') = ${state}`);
  return server ? openRow(server) : null;
}

/**
 * Seals the credentials written before sealing began, and names the servers whose sealed ones
 * this data folder's key cannot open — on their rows too, where the Connectors screen shows it —
 * and takes those words off a row that opens again, its `.env` put back. Run at boot (config.seal);
 * a second run seals nothing, and one transaction leaves a start that dies halfway to the next.
 */
export async function sealMcpSecrets(): Promise<{
  sealed: number;
  unreadable: string[];
}> {
  return database.transaction(async (tx) => {
    const rows = await tx
      .select({
        name: mcpServerTable.name,
        config: mcpServerTable.config,
        oauth: mcpServerTable.oauth,
        lastError: mcpServerTable.lastError,
      })
      .from(mcpServerTable);
    const unreadable: string[] = [];
    let sealed = 0;
    for (const row of rows) {
      const config = openedConfig(row.config);
      if (!config || (row.oauth && !openedOAuth(row.oauth))) {
        unreadable.push(row.name);
        await tx
          .update(mcpServerTable)
          .set({
            lastError: config
              ? lostSignInWords(row.name)
              : lostKeyWords(row.name),
          })
          .where(eq(mcpServerTable.name, row.name));
        continue;
      }
      // Words this pass wrote about a key that now opens are no longer true
      const stale =
        row.lastError === lostKeyWords(row.name) ||
        row.lastError === lostSignInWords(row.name);
      const clear = inTheClear(row);
      if (!clear && !stale) continue;
      await tx
        .update(mcpServerTable)
        .set({
          ...(clear && {
            config: sealConfig(row.config),
            // Opened first: a row holding both keeps its later, clear fields (openOAuth)
            oauth: row.oauth && sealOAuth(openOAuth(row.oauth)),
          }),
          ...(stale && { lastError: null }),
        })
        .where(eq(mcpServerTable.name, row.name));
      if (clear) sealed++;
    }
    return { sealed, unreadable };
  });
}

/**
 * Every credential a connector holds, as a command could print it (workspace heldSecrets): its
 * headers' and env's values, the token after a header's scheme (`Bearer <token>`), and each text
 * its OAuth sign-in keeps. One this data folder's key cannot open has no value to hide.
 */
export async function connectorSecretValues(): Promise<string[]> {
  const rows = await database
    .select({ config: mcpServerTable.config, oauth: mcpServerTable.oauth })
    .from(mcpServerTable);
  return rows.flatMap((row) => {
    const config = openedConfig(row.config);
    const values = Object.values(
      (config && (isRemoteConfig(config) ? config.headers : config.env)) ?? {},
    ).flatMap((value) => [value, value.split(" ").at(-1) ?? value]);
    const oauth = row.oauth && openedOAuth(row.oauth);
    const { state, authorizationServer, ...secret } = oauth || {};
    return [...values, ...stringsIn(secret)];
  });
}

/** Whether a row holds a credential in the clear: one written before sealing began. */
function inTheClear(row: {
  config: MCPServerConfig;
  oauth: MCPStoredOAuth | null;
}): boolean {
  const values = isRemoteConfig(row.config)
    ? row.config.headers
    : row.config.env;
  if (Object.values(values ?? {}).some((value) => !isSealed(value)))
    return true;
  const { state, authorizationServer, sealed, ...secret } = row.oauth ?? {};
  return Object.values(secret).some((value) => value !== undefined);
}

export async function deleteServer(name: string) {
  const removed = await database
    .delete(mcpServerTable)
    .where(eq(mcpServerTable.name, name))
    .returning();
  if (removed.length > 0) changed();
  return removed.length > 0;
}
