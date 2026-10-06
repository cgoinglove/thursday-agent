import { eq } from "drizzle-orm";
import { appEvents } from "@/app/api/events/app-event.server";
import { ENV_PATH } from "@/config";
import { database } from "@/database/db";
import { configTable } from "@/database/tables";
import { planCallsOf, TEXT_MODEL_PROVIDERS } from "@/features/ai/model.schema";
import {
  ENCRYPTION_KEY_NAME,
  isSealed,
  openSecret,
  sealSecret,
  UnreadableSecret,
} from "@/lib/secret";
import { stringsIn } from "@/lib/utils";
import {
  CONFIG_ENTRIES,
  CONFIG_GROUPS,
  CONFIG_KEYS,
  groupSatisfied,
  isSecretKey,
  lostWords,
  VOICE_GROUP_ID,
} from "./config.const";

/**
 * Env var wins over the row the settings screen wrote. A secret this data folder's key cannot
 * open reads as unset, as a key may be anywhere: a use that can go without it — search, a studio
 * model, one phone service among several — goes on without it rather than stopping. Settings
 * marks it to be entered again (`configState`), boot names it, and a use that needs that one key
 * says why it has none (`missingKeyWords`).
 */
export async function readConfig(key: string) {
  return (await stored(key)).value;
}

/**
 * What a use that needs this one key says when `readConfig` found none: why, when it was saved
 * and can no longer be read, else `unset` — the caller's words for a key never given.
 */
export async function missingKeyWords(
  key: string,
  unset: string,
): Promise<string> {
  return (await configState(key)) === "unreadable"
    ? unreadableWords(key)
    : unset;
}

/**
 * What Settings shows of a key: set, unset, or saved but unreadable — sealed under a key this
 * data folder no longer has. The last is not set, since nothing can use it; it is kept rather
 * than deleted, so the data folder's old `.env`, put back, opens it again, and entering the key
 * again replaces it.
 */
export async function configState(
  key: string,
): Promise<"set" | "unset" | "unreadable"> {
  return (await stored(key)).state;
}

/** Whether a key is set and can be read: what `isCallable` and the providers list count. */
export async function hasConfig(key: string): Promise<boolean> {
  return (await configState(key)) === "set";
}

/** Whether the environment sets this key, which then wins over its row (`readConfig`). */
export function configFromEnv(key: string): boolean {
  return Boolean(process.env[key]?.trim());
}

/** A key's value and whether it can be used: the environment's, else the row's, opened. */
async function stored(key: string): Promise<{
  state: "set" | "unset" | "unreadable";
  value?: string;
}> {
  const fromEnv = process.env[key]?.trim();
  if (fromEnv) return { state: "set", value: fromEnv };
  const row = await readRow(key);
  if (row === undefined) return { state: "unset" };
  const value = opened(row)?.trim();
  if (value === undefined) return { state: "unreadable" };
  return value ? { state: "set", value } : { state: "unset" };
}

async function readRow(key: string): Promise<string | undefined> {
  const [row] = await database
    .select({ value: configTable.value })
    .from(configTable)
    .where(eq(configTable.key, key));
  return row?.value;
}

/** A stored value, opened when it is sealed (lib/secret); null when this data folder's key cannot open it. */
function opened(stored: string): string | null {
  try {
    return openSecret(stored);
  } catch (cause) {
    if (cause instanceof UnreadableSecret) return null;
    throw cause;
  }
}

/** How a use of a secret the key cannot open says so, with the file to put back if there is one. */
function unreadableWords(key: string): string {
  const entry = CONFIG_ENTRIES[key];
  const what = entry?.signIn ? "sign-in" : "key";
  const again = entry?.signIn ? "Sign in again" : "Enter it again";
  return lostWords(
    `The saved ${entry?.label ?? key} ${what}`,
    `${again} in Settings.`,
    `${ENCRYPTION_KEY_NAME} in ${ENV_PATH}`,
  );
}

/**
 * A key, sign-in or pick that Settings lists changed, whoever changed it: every open tab reads
 * them again (`config`). The table's other rows belong to a domain that reads its own.
 */
const changed = (key: string) => {
  if (CONFIG_KEYS.includes(key)) appEvents.emit({ type: "config" });
};

/** A secret (config.const isSecretKey) is sealed before it is written; a pick or a domain's own row is not. */
export async function writeConfig(key: string, value: string) {
  const stored = isSecretKey(key) ? sealSecret(value) : value;
  await database
    .insert(configTable)
    .values({ key, value: stored })
    .onConflictDoUpdate({ target: configTable.key, set: { value: stored } });
  changed(key);
}

export async function removeConfig(key: string) {
  await database.delete(configTable).where(eq(configTable.key, key));
  changed(key);
}

/**
 * Seals the secrets written before sealing began, and names the sealed ones this data folder's
 * key cannot open — but for one the environment sets, which wins over its row, so the row is
 * never read (`readConfig`). Run at boot, after the migrations (config.seal); a second run
 * seals nothing. One transaction, so a start that dies halfway leaves the rows as they were.
 */
export async function sealConfigSecrets(): Promise<{
  sealed: number;
  unreadable: string[];
}> {
  return database.transaction(async (tx) => {
    const rows = await tx.select().from(configTable);
    const unreadable: string[] = [];
    let sealed = 0;
    for (const row of rows) {
      if (isSealed(row.value)) {
        if (opened(row.value) === null && !process.env[row.key]?.trim())
          unreadable.push(row.key);
      } else if (isSecretKey(row.key)) {
        await tx
          .update(configTable)
          .set({ value: sealSecret(row.value) })
          .where(eq(configTable.key, row.key));
        sealed++;
      }
    }
    return { sealed, unreadable };
  });
}

/**
 * Every secret Settings holds, as a command could print it (workspace heldSecrets): each key,
 * the environment's where it sets one, and each text a sign-in keeps — its tokens. One this data
 * folder's key cannot open has no value to hide.
 */
export async function configSecretValues(): Promise<string[]> {
  const rows = await database.select().from(configTable);
  const values = rows.flatMap((row) => {
    if (!isSecretKey(row.key)) return [];
    const value = opened(row.value)?.trim();
    if (!value) return [];
    return CONFIG_ENTRIES[row.key]?.signIn ? textsOf(value) : [value];
  });
  const fromEnv = CONFIG_KEYS.filter(isSecretKey).flatMap((key) => {
    const value = process.env[key]?.trim();
    if (!value) return [];
    return CONFIG_ENTRIES[key]?.signIn ? textsOf(value) : [value];
  });
  return [...values, ...fromEnv];
}

/** The texts a sign-in's JSON holds; the whole value when it is not JSON. */
function textsOf(value: string): string[] {
  try {
    return stringsIn(JSON.parse(value));
  } catch {
    return [value];
  }
}

/** Whether a call can open (the keys group's `requireKeys`, a sign-in on a plan with calls); decides call screen vs intro. */
export async function isCallable(): Promise<boolean> {
  const voice = CONFIG_GROUPS.find((group) => group.id === VOICE_GROUP_ID);
  if (!voice) return true;

  // The keys the group counts, which are not all among its rows: the GPT Subscription's
  // sign-in opens a call too, and is listed with the easy ways
  const set = await Promise.all(
    (voice.requireKeys ?? voice.entries.map((entry) => entry.key)).map(
      async (key) => [key, await hasConfig(key)] as const,
    ),
  );
  const has = new Map(set);
  // A sign-in opens a call on a plan that has calls (model.schema planCallsOf). Read here
  // rather than imported: ai/chatgpt reads its sign-in through this module
  const signIn = TEXT_MODEL_PROVIDERS.chatgpt.apiKeyName;
  if (has.get(signIn)) {
    const { readChatGptPlan } = await import("@/features/ai/chatgpt");
    has.set(signIn, planCallsOf({ plan: await readChatGptPlan() }));
  }
  return groupSatisfied(voice, (key) => has.get(key) ?? false);
}
