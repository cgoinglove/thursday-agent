import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { parseEnv } from "node:util";
import { ENV_PATH } from "@/config";

/**
 * The secrets the app keeps in its database — API keys, the phone's bot tokens, the ChatGPT
 * sign-in, a connector's headers and OAuth tokens — are sealed with one key before they are
 * written, so a copy of `local.db` on its own (a backup, a synced folder, a file attached to an
 * issue, a table a command dumped) carries none of them.
 *
 * The key is the data folder's own: its `.env`, and nothing else. Not the environment: a
 * checkout's `.env`, which Next loads into the environment of every start from that checkout,
 * would be taken for the key of another data folder started from it (`--home`, THURSDAY_HOME),
 * and a start that does not carry the variable — the background job's, whose launchd entry sets
 * three variables of its own (bin/background.mjs) — would make a key of its own beside the one
 * the database was sealed with.
 *
 * What it does not do is keep them from anything that runs as the user: a bot's shell runs as
 * the user and can read the `.env` (SECURITY.md). The key never reaches its environment —
 * `lib/sandbox` strips every THURSDAY_ variable and every name with KEY in it.
 */

export const ENCRYPTION_KEY_NAME = "THURSDAY_ENCRYPTION_KEY";

/** What a sealed value starts with. The version lets a later scheme tell its values from these. */
const SEALED = "enc:v1:";

// AES-256-GCM: a 32-byte key, a fresh 12-byte nonce for every seal, and a 16-byte tag that
// fails the open on a wrong key or any changed byte
const CIPHER = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** 32 bytes in base64, as `openssl rand -base64 32` prints them, or in base64url. */
const KEY_SHAPE = /^[A-Za-z0-9+/_-]{43}=?$/;

/** A line of a `.env` that starts with the key's name, whatever follows it. */
const NAMED = new RegExp(
  `^[ \\t]*(?:export[ \\t]+)?${ENCRYPTION_KEY_NAME}(?![\\w.-])`,
  "m",
);

/** Written above a key this app made, for whoever opens the file. */
const KEY_NOTE =
  "# Thursday seals the API keys and sign-ins it saves in local.db with this key. Keep it with\n" +
  "# local.db: without it they cannot be read, and each has to be entered again.\n";

/** A sealed value this key cannot open: it was sealed under another key, or it is damaged. */
export class UnreadableSecret extends Error {}

type EncryptionKey = {
  key: Buffer;
  /** `made` is a key this load created and wrote down. */
  from: "file" | "made";
};

/**
 * The key `envFile` holds, or a new one made and appended there when it holds none — so a
 * first start asks nothing of the user, and a data folder that lost its `.env` gets a new one.
 * An empty or blank value is none: `NAME=` is how a file leaves a value to fill in.
 *
 * A malformed value is thrown, never replaced: a new key would leave every secret sealed under
 * the old one unreadable, and only the person who wrote the value can say what it should be. A
 * file that exists but cannot be read, or a key that cannot be written, is thrown for the same
 * reason. Each says what to do.
 */
export function loadEncryptionKey(envFile: string): EncryptionKey {
  const kept = keptKey(envFile);
  if (!kept) return { key: makeKey(envFile), from: "made" };
  const key = parseKey(kept, envFile);
  // A .env put back from a backup, or written by hand, has the umask's 644
  ownerOnly(envFile);
  return { key, from: "file" };
}

/**
 * The key this process holds. On globalThis: the server loads this module more than once —
 * boot, the routes, the actions — and each copy holding a key of its own read at another moment
 * is two keys in one process.
 */
const pinned = globalThis as { __thursdayEncryptionKey?: Buffer };

/**
 * This data folder's key (config ENV_PATH). The first load in a process — boot's, before
 * anything asks — reads it, or makes it when the file holds none, and boot says so. After that
 * the file is read again at each use: a `.env` put back from a backup is used from then on, so a
 * key entered again meanwhile is sealed under the key it will be read with. A file that loses
 * its key while the app runs leaves the process on the key it holds; only a start makes one.
 */
export function encryptionKey(): EncryptionKey {
  const held = pinned.__thursdayEncryptionKey;
  if (!held) {
    const loaded = loadEncryptionKey(ENV_PATH);
    pinned.__thursdayEncryptionKey = loaded.key;
    return loaded;
  }
  const kept = keptKey(ENV_PATH);
  if (!kept) return { key: held, from: "file" };
  const key = parseKey(kept, ENV_PATH);
  if (!key.equals(held)) {
    // Put back from a backup, with the umask's 644 as a first load would find it
    ownerOnly(ENV_PATH);
    pinned.__thursdayEncryptionKey = key;
  }
  return { key, from: "file" };
}

/**
 * The key as text, in each form its file may hold it — base64 or base64url, the padding left
 * off — for a shell to hide from what it prints (workspace heldSecrets).
 */
export function encryptionKeyTexts(): string[] {
  const { key } = encryptionKey();
  return [key.toString("base64"), key.toString("base64url")].map((text) =>
    text.replace(/=+$/, ""),
  );
}

export const isSealed = (value: string) => value.startsWith(SEALED);

/** `plain`, sealed. A fresh nonce each time, so two equal secrets never look alike. */
export function sealSecret(plain: string, key?: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, key ?? encryptionKey().key, iv, {
    authTagLength: TAG_BYTES,
  });
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return (
    SEALED +
    Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url")
  );
}

/**
 * What `sealSecret` sealed. A value that is not sealed was written before sealing began and comes
 * back as it is, until boot seals it (config.query, mcp.query) — without loading the key, so
 * reading a plain row never makes one. Throws `UnreadableSecret` when the key cannot open it.
 */
export function openSecret(value: string, key?: Buffer): string {
  if (!isSealed(value)) return value;

  // Outside the try: a key that cannot be loaded is its own failure, not this value's
  const opener = key ?? encryptionKey().key;
  const raw = Buffer.from(value.slice(SEALED.length), "base64url");
  if (raw.length < IV_BYTES + TAG_BYTES) {
    throw new UnreadableSecret("The sealed value is cut short.");
  }
  try {
    const decipher = createDecipheriv(
      CIPHER,
      opener,
      raw.subarray(0, IV_BYTES),
      { authTagLength: TAG_BYTES },
    );
    decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
    return Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
  } catch (cause) {
    throw new UnreadableSecret(
      "It was sealed under another encryption key, or it is damaged.",
      { cause },
    );
  }
}

/** The 32 bytes a value holds; null for anything else — hex, a passphrase, a key cut short. */
function keyBytes(value: string): Buffer | null {
  const key = KEY_SHAPE.test(value) ? Buffer.from(value, "base64") : null;
  return key?.length === KEY_BYTES ? key : null;
}

function parseKey(value: string, envFile: string): Buffer {
  const key = keyBytes(value);
  if (!key) {
    throw new Error(
      `${ENCRYPTION_KEY_NAME} in ${envFile} is not a key: it takes ${KEY_BYTES} random bytes in base64, as \`openssl rand -base64 ${KEY_BYTES}\` prints them. Put back the line it had, from a backup of that file; or delete the line, and a new key is made — the keys saved in Settings are then entered again.`,
    );
  }
  return key;
}

/**
 * The key `envFile` holds, read as Next reads it: quotes, `export`, a trailing comment, a name
 * set twice taking its last value, and — which Node's `parseEnv` does not do on its own — a
 * byte-order mark and CR or CRLF line ends. A line naming the key in a form `parseEnv` does not
 * take, `NAME: value` as Next also does, is thrown rather than read as no key: that would make a
 * new one, and strand what the key on that line sealed.
 */
function keptKey(envFile: string): string | undefined {
  let text: string;
  try {
    text = readFileSync(envFile, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return undefined;
    throw new Error(
      `Cannot read ${envFile}, where ${ENCRYPTION_KEY_NAME} is kept (${code ?? error}): let this account read it.`,
      { cause: error },
    );
  }
  const plain = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const value = parseEnv(plain)[ENCRYPTION_KEY_NAME];
  if (value === undefined && NAMED.test(plain)) {
    throw new Error(
      `A line of ${envFile} names ${ENCRYPTION_KEY_NAME} without setting it as ${ENCRYPTION_KEY_NAME}=<key>, the one form it is read in: write it that way. Or delete the line, and a new key is made — the keys saved in Settings are then entered again.`,
    );
  }
  return value?.trim() || undefined;
}

/**
 * A new key, appended to `envFile` below what is already there — the file may be a checkout's
 * own `.env`, with the person's other variables in it. Appended last, it is the value that
 * counts however many times the name was set above it.
 */
function makeKey(envFile: string): Buffer {
  const key = randomBytes(KEY_BYTES).toString("base64");

  // Read by keptKey just before, which threw on anything but a file not there yet
  const before = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
  const gap = !before ? "" : /\r?\n$|\r$/.test(before) ? "\n" : "\n\n";
  try {
    mkdirSync(dirname(envFile), { recursive: true });
    // `mode` applies only when this creates the file
    appendFileSync(
      envFile,
      `${gap}${KEY_NOTE}${ENCRYPTION_KEY_NAME}=${key}\n`,
      { mode: 0o600 },
    );
  } catch (error) {
    throw new Error(
      `Cannot write a new ${ENCRYPTION_KEY_NAME} to ${envFile} (${(error as NodeJS.ErrnoException).code ?? error}): let this account write there.`,
      { cause: error },
    );
  }
  ownerOnly(envFile);

  // Read back as the next start will: a key is kept only once the file says it
  if (keptKey(envFile) !== key) {
    throw new Error(
      `A new ${ENCRYPTION_KEY_NAME} was added to ${envFile}, but the file does not read back as it: something changed that file while the app started. Start it again.`,
    );
  }
  return Buffer.from(key, "base64");
}

/**
 * The file holds the key: only this account may read it, as with the database beside it
 * (database/db.ts ownerOnly).
 */
function ownerOnly(file: string): void {
  try {
    chmodSync(file, 0o600);
  } catch {
    // A file this account does not own
  }
}
