import { format } from "date-fns";
import { ImapFlow } from "imapflow";
import { authenticate } from "mailauth";
import { type AddressObject, type ParsedMail, simpleParser } from "mailparser";
import { createTransport } from "nodemailer";
import { getDomain } from "tldts";
import { APP_NAME, REACH } from "@/config";
import { readConfig, writeConfig } from "@/features/config/config.query";
import { logger } from "@/lib/logger";
import {
  type Button,
  type Channel,
  ChannelRefusal,
  type Incoming,
  type OutgoingFile,
} from "./channel";
import { type ChatText, chatPieces } from "./chat-text";
import {
  IMAP_TLS_PORT,
  type MailServer,
  parseServer,
  SMTP_TLS_PORT,
  serverWords,
  systemResolver,
} from "./mail-servers";

/**
 * A mailbox of Thursday's own as a reach channel: its inbox read over IMAP — told of new mail
 * while the connection idles, so nothing calls in — and her answers sent over SMTP, each in
 * the thread of what was written. Signed in with an app password its mail service made for
 * her, over TLS only.
 *
 * Anyone can write to an address, and anyone can put another's address in From. So who may
 * write is named on the screen (`named`), and a mail reaches her only once the sender's own
 * mail service vouches for it: DMARC passes on a signature of that domain (mailauth), checked
 * here rather than taken from a header the receiving service wrote. It must also be written to
 * her address and be recent (REACH.mailFreshMs) — an old mail of theirs, still signed, could
 * otherwise be sent to her again by anyone it once went to. The inbox is only read: nothing in
 * it is marked, moved or deleted.
 */

const MB = 1024 * 1024;
/**
 * The largest mail read, all it carries included; past it the mail is named to them as not
 * read. Gmail takes mail up to 50 MB, and few services send larger.
 */
const MAIL_TAKE = 50 * MB;
/**
 * The most an answer attaches. The big services take a 20–25 MB mail (Outlook and iCloud 20,
 * Gmail and Yahoo 25), and a file travels a third larger inside one (base64).
 */
const MAIL_SEND = 14 * MB;
/** A day, the unit IMAP searches by date in (RFC 3501 §6.4.4). */
const DAY_MS = 24 * 60 * 60_000;

/** Where the inbox was read up to, kept across restarts (a domain row, config.query). */
export const EMAIL_SEEN_KEY = "REACH_EMAIL_SEEN";

type Seen = {
  /** The mailbox it was read in: another address starts over. */
  address: string;
  /** The server's UIDVALIDITY: when it changes, the old numbers mean nothing (RFC 3501 §2.3.1.1). */
  validity: string;
  uid: number;
  ids: string[];
};

/** DNS as mailauth asks it (`resolver`), bounded so one slow domain cannot hold up the inbox. */
export type Resolve = (
  domain: string,
  type: string,
) => Promise<string[][] | string[]>;

/** The system's DNS for one mail's check: made for it, never kept (mail-servers systemResolver). */
function systemDns(): Resolve {
  const dns = systemResolver();
  return (domain, type) =>
    type === "TXT"
      ? dns.resolveTxt(domain)
      : (dns.resolve(domain, type) as Promise<string[]>);
}

/**
 * The sender's records did not answer: the mail waits and is checked again. Its message is
 * what did not answer, for the screen and for a bot.
 */
export class CheckLater extends Error {}

/** DNS errors that say "not now" rather than "no such record": worth waiting on. */
const DNS_LATER = new Set([
  "ETIMEOUT",
  "ESERVFAIL",
  "ECONNREFUSED",
  "EAI_AGAIN",
]);

/** One message as reach takes it. */
type Written = Extract<Incoming, { kind: "message" }>;

/** A mail, read: who wrote, and what, as reach takes it, with what threads an answer under it. */
export type Mail = Written & {
  subject: string;
  id: string | null;
  refs: string[];
  /** Why it is not taken as from `chat`, in words for anyone (`unproven` is the same, for them). */
  why?: string;
  /**
   * Sent by a machine (Auto-Submitted, RFC 3834): reach never answers one, since an
   * out-of-office answering her would be answered back. A site's code comes marked so too.
   */
  auto: boolean;
};

/** Whether a mail from this address is wanted at all, asked before any of it is checked. */
export type Wanted = (address: string) => boolean | Promise<boolean>;

/**
 * One mail, read, or null when it is no one's: no single From, or from an address `wanted`
 * turns down — asked before the sender's records are looked up, so a stranger's mail costs no
 * DNS and a stranger's broken DNS holds up nothing. A mail that cannot be vouched for comes
 * with `unproven`, which reach says only to the one who may write. Throws `CheckLater` when
 * the sender's records could not be looked up.
 */
export async function readMail(
  source: Buffer,
  at: {
    mailbox: string;
    arrived: Date;
    now?: number;
    resolve?: Resolve;
    wanted?: Wanted;
    /**
     * It has waited long enough on records that do not answer: that is now why it is not
     * read, rather than a reason to wait on (CheckLater).
     */
    giveUp?: boolean;
  },
): Promise<Mail | null> {
  const mail = await simpleParser(source, {
    skipImageLinks: true,
    skipTextToHtml: true,
  });
  const froms = mail.headerLines.filter((line) => line.key === "from");
  const [from, ...more] = mail.from?.value ?? [];
  if (froms.length !== 1 || more.length || !from?.address) return null;
  const address = from.address.toLowerCase();
  if (at.wanted && !(await at.wanted(address))) return null;
  const submitted = mail.headers.get("auto-submitted");
  const auto =
    (typeof submitted === "string"
      ? submitted
      : ((submitted as { value?: string })?.value ?? "no")
    )
      .trim()
      .toLowerCase() !== "no";

  const subject = (mail.subject ?? "").trim();
  const body = withoutQuote(mail.text ?? "");
  const files = mail.attachments.map((file, at) => {
    const name = file.filename || `attachment-${at + 1}`;
    return {
      name,
      size: file.size,
      fetch: async () =>
        new File([new Uint8Array(file.content)], name, {
          type: file.contentType,
        }),
    };
  });
  const refused = await unproven(mail, source, address, at);
  return {
    kind: "message",
    chat: address,
    name: from.name?.trim() || address,
    handle: address,
    words: body,
    files,
    voice: null,
    unreadable: false,
    ...(refused
      ? {
          why: refused.why,
          unproven: notRead(at.arrived, refused.why, refused.advice),
        }
      : {}),
    auto,
    subject,
    id: mail.messageId ?? null,
    refs: [...referencesOf(mail), ...(mail.messageId ? [mail.messageId] : [])],
  };
}

/**
 * What the one who may write is told of a mail in their name that was not read (reach take).
 * It is named by when it arrived, never by its subject: the mail may be a stranger's, and its
 * words are not repeated from her address.
 */
const notRead = (arrived: Date, why: string, advice = "") =>
  `Your mail of ${format(arrived, "d MMM, HH:mm")} was not read: ${why}.${advice ? ` ${advice}` : ""}`;

/**
 * Why this mail is not taken as from `address`, and what its sender can do about it;
 * undefined when it is.
 */
async function unproven(
  mail: ParsedMail,
  source: Buffer,
  address: string,
  at: {
    mailbox: string;
    arrived: Date;
    now?: number;
    resolve?: Resolve;
    giveUp?: boolean;
  },
): Promise<{ why: string; advice?: string } | undefined> {
  const mailbox = at.mailbox.toLowerCase();
  if (!addressesOf(mail.to, mail.cc).includes(mailbox))
    return {
      why: `it was not written to ${mailbox}`,
      advice: "Thursday reads only mail with her address in To or Cc.",
    };
  const now = at.now ?? Date.now();
  const written = Math.min(
    mail.date?.getTime() ?? at.arrived.getTime(),
    at.arrived.getTime(),
  );
  if (now - written > REACH.mailFreshMs)
    return {
      why: `it was written more than ${Math.round(REACH.mailFreshMs / 3_600_000)} hours ago`,
      advice: "Write it again if it still stands.",
    };

  const domain = address.slice(address.lastIndexOf("@") + 1);
  /** Records that did not answer: waited on, until that has gone on long enough to be the reason. */
  const notYet = (what: string) => {
    if (!at.giveUp) throw new CheckLater(what);
    return {
      why: `its sender could not be checked: ${what}`,
      advice:
        "Write it again. If this keeps happening, the trouble is that domain's DNS records.",
    };
  };
  let checked: Awaited<ReturnType<typeof authenticate>>;
  try {
    checked = await authenticate(source, {
      resolver: at.resolve ?? systemDns(),
      disableArc: true,
      disableBimi: true,
    });
  } catch (cause) {
    const code = (cause as { code?: string }).code ?? "";
    if (DNS_LATER.has(code))
      return notYet(`${domain}'s records did not answer (${code})`);
    // Not a wait that ends by itself: said as the reason, rather than held for
    return { why: `its sender could not be checked (${reasonOf(cause)})` };
  }
  const dmarc = checked.dmarc;
  const result = dmarc ? dmarc.status.result : "none";
  // A signing key that could not be fetched leaves DMARC failing though nothing is wrong
  // with the mail: the key lookup not answering is as much "not yet" as the policy's. Only
  // for a signature of the sender's own domain (mailauth's `aligned`): any other can never
  // make DMARC pass, and anyone can add one whose domain never answers — each such mail
  // written in the sender's name would hold every mail behind it for REACH.mailHoldMs.
  const keyUnread = (checked.dkim?.results ?? []).some(
    (one) => one.status.result === "temperror" && one.status.aligned,
  );
  if (
    result === "temperror" ||
    result === "temperr" ||
    (result !== "pass" && keyUnread)
  )
    return notYet(`${domain}'s records did not answer`);
  if (!dmarc || result !== "pass")
    return {
      why: `${domain}'s mail service does not vouch that it came from ${address}, so it could be anyone's (its DMARC check said: ${result})`,
      advice:
        "Thursday reads only mail its sender's service signs and stands behind. Gmail, iCloud, Fastmail and most others do; a domain of your own needs DKIM and DMARC set up.",
    };
  // A signature over only the start of the body (l=) leaves the rest free for anyone to write
  if (dmarc.alignment?.dkim.underSized)
    return {
      why: "its signature covers only part of it, so the rest could be anyone's",
    };
  return undefined;
}

/** Every address in To and Cc, lowercased. */
function addressesOf(
  ...fields: (AddressObject | AddressObject[] | undefined)[]
): string[] {
  return fields
    .flatMap((field) => (Array.isArray(field) ? field : field ? [field] : []))
    .flatMap((group) => group.value)
    .flatMap((one) => [
      ...(one.address ? [one.address.toLowerCase()] : []),
      // An address inside a named group ("team: a@x, b@y;")
      ...(one.group ?? []).flatMap((inner) =>
        inner.address ? [inner.address.toLowerCase()] : [],
      ),
    ]);
}

function referencesOf(mail: ParsedMail): string[] {
  const refs = mail.references;
  return Array.isArray(refs) ? refs : refs ? [refs] : [];
}

/**
 * Their words, without the earlier mail quoted under them. A quote is lines that open with
 * ">" (RFC 3676 §4.5); only a run of them that ends the mail goes, so a reply written between
 * quoted lines keeps its quotes. The line introducing the quote is in the sender's own words
 * and language, so it stays.
 */
export function withoutQuote(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").trimEnd().split("\n");
  let end = lines.length;
  let quoted = false;
  while (end > 0) {
    const line = lines[end - 1];
    if (line.startsWith(">")) quoted = true;
    else if (line.trim()) break;
    end--;
  }
  return (quoted ? lines.slice(0, end) : lines).join("\n").trim();
}

/** A subject without the "Re:" replies put in front of it (RFC 5322 §3.6.5). */
const bareSubject = (subject: string) =>
  subject.replace(/^(\s*re\s*:\s*)+/i, "").trim();

/** The conversation with one address: the thread an answer goes into. */
type Thread = { subject: string; last: string | null; refs: string[] };

/**
 * `resolve` is how senders' records are looked up: the system's DNS (systemDns) when left
 * out, or a test standing in for the domains its mail is signed by.
 */
export function createEmail(
  address: string,
  password: string,
  imapServer: string,
  smtpServer: string,
  resolve?: Resolve,
): Channel {
  const mailbox = address.trim().toLowerCase();
  /** The mail each conversation is in, so an answer is threaded under what was written. */
  const threads = new Map<string, Thread>();
  /**
   * The mail being held for a sender who cannot be checked yet: its source, so each check
   * again costs DNS alone and not another download, and since when, so it is given up on
   * after REACH.mailHoldMs. Kept across connections.
   */
  let held: { uid: number; source: Buffer; since: number } | null = null;

  /** A server as it was saved, or the step that holds it refused (REACH_KEYS order). */
  const server = (value: string, key: number, what: string): MailServer => {
    const parsed = parseServer(value);
    if (!parsed)
      throw new ChannelRefusal(
        `“${value}” is not a ${what} server as host:port. Save her mailbox again.`,
        key,
      );
    return parsed;
  };

  const smtpOf = (smtp: MailServer) =>
    createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === SMTP_TLS_PORT,
      // Never a password over a line that is not encrypted
      requireTLS: smtp.port !== SMTP_TLS_PORT,
      auth: { user: address, pass: password },
    });

  /** A sign-in the server turned away is the user's to fix; asking again would not change it. */
  const refusedBy = (where: MailServer) => (cause: unknown) => {
    const failed = cause as {
      authenticationFailed?: boolean;
      code?: string;
      responseText?: string;
      response?: unknown;
      message?: string;
    };
    if (failed.authenticationFailed || failed.code === "EAUTH") {
      const said =
        failed.responseText ||
        (typeof failed.response === "string" ? failed.response : "") ||
        failed.message ||
        "no";
      throw new ChannelRefusal(
        `${where.host} said “${said}”: it did not take ${address} with this app password. An app password stops working when the account's own password changes — create a new one for her mailbox and save it here.`,
        1,
      );
    }
    throw new Error(
      `Could not reach ${serverWords(where)}: ${reasonOf(cause)}`,
      {
        cause,
      },
    );
  };

  async function readSeen(validity: string, next: number): Promise<Seen> {
    try {
      const kept = JSON.parse((await readConfig(EMAIL_SEEN_KEY)) ?? "") as Seen;
      if (kept.address === mailbox && kept.validity === validity) return kept;
    } catch {}
    // A mailbox new to her, or renumbered: what is in it already is not written to her now
    const fresh = { address: mailbox, validity, uid: next - 1, ids: [] };
    await writeConfig(EMAIL_SEEN_KEY, JSON.stringify(fresh));
    return fresh;
  }

  async function send(
    chat: string,
    text: ChatText,
    buttons: Button[] = [],
    files: OutgoingFile[] = [],
  ) {
    const smtp = server(smtpServer, 3, "sending");
    const thread = threads.get(chat);
    const plain = chatPieces(text, "plain", Number.POSITIVE_INFINITY).join(
      "\n\n",
    );
    // Telegram's marks are a small, escaped subset of HTML, which a mail draws as it is
    const html = chatPieces(text, "telegram", Number.POSITIVE_INFINITY).join(
      "\n\n",
    );
    const choices = buttons.length
      ? {
          plain: `\n\nAnswer by replying with one of:\n${buttons.map((button) => `• ${button.text}`).join("\n")}`,
          html: `<p>Answer by replying with one of:</p><ul>${buttons.map((button) => `<li>${chatPieces({ plain: button.text }, "telegram", Number.POSITIVE_INFINITY).join("")}</li>`).join("")}</ul>`,
        }
      : { plain: "", html: "" };
    const subject = thread
      ? `Re: ${thread.subject || APP_NAME}`
      : firstLine(plain) || APP_NAME;
    const sent = await smtpOf(smtp)
      .sendMail({
        from: { name: APP_NAME, address },
        to: chat,
        subject,
        text: plain + choices.plain,
        html: `<div style="white-space:pre-wrap">${html}</div>${choices.html}`,
        ...(thread?.last
          ? { inReplyTo: thread.last, references: thread.refs }
          : {}),
        // Written by a machine, so an out-of-office does not answer it (RFC 3834 §5)
        headers: {
          "Auto-Submitted": thread ? "auto-replied" : "auto-generated",
        },
        attachments: files.map((file) => ({
          filename: file.name,
          content: Buffer.from(file.bytes),
        })),
      })
      .catch(refusedBy(smtp));
    const id = sent.messageId;
    threads.set(chat, {
      subject: thread?.subject ?? bareSubject(subject),
      last: id ?? thread?.last ?? null,
      refs: [...(thread?.refs ?? []), ...(id ? [id] : [])],
    });
  }

  return {
    named: true,
    attaches: true,
    limits: { take: MAIL_TAKE, file: MAIL_SEND, picture: MAIL_SEND },

    async listen(on, signal) {
      const imap = server(imapServer, 2, "reading");
      const smtp = server(smtpServer, 3, "sending");
      const client = imapClient(address, password, imap);
      const shut = () => client.close();
      signal.addEventListener("abort", shut, { once: true });
      try {
        await client.connect().catch(refusedBy(imap));
        // Sending is checked too, so a password one server takes and the other refuses is found now
        await smtpOf(smtp).verify().catch(refusedBy(smtp));
        on.ready(address, `mailto:${address}`, mailbox);
        const box = await client.mailboxOpen("INBOX", { readOnly: true });
        let seen = await readSeen(String(box.uidValidity), box.uidNext);

        /** Mail arrived since the last look began: the next look starts at once. */
        let rung = false;
        client.on("exists", () => {
          rung = true;
        });
        while (!signal.aborted) {
          rung = false;
          const looked = await look(
            client,
            seen,
            on.incoming,
            // A channel that is not told who is wanted reads everyone's, and reach sorts them
            on.wanted ?? (() => true),
          );
          seen = looked.seen;
          // Their mail waits where it is, and what came after it behind it: said, and
          // checked again, on the connection that stands
          on.holding?.(looked.later);
          const again = looked.later !== null;
          if ((again || !rung) && !signal.aborted)
            await ring(
              client,
              imap.host,
              again ? REACH.mailCheckAgainMs : REACH.mailLookMs,
              signal,
              again,
            );
        }
      } finally {
        signal.removeEventListener("abort", shut);
        client.close();
      }
    },

    say: send,

    async typing() {},

    // No mail has buttons to take off: a choice comes back as the words of a reply
    async settle() {},

    async sendFiles(chat, files) {
      await send(
        chat,
        { plain: files.map((file) => file.name).join("\n") },
        [],
        files,
      );
    },
  };

  /**
   * Hands over what arrived past `seen`, oldest first, and keeps how far it got after each
   * one, so a mail is neither answered twice nor skipped across a restart. It stops at a mail
   * whose sender cannot be checked yet (`later` says why): the next look starts there.
   */
  async function look(
    client: ImapFlow,
    seen: Seen,
    incoming: (incoming: Incoming) => void,
    wanted: Wanted,
  ): Promise<{ seen: Seen; later: string | null }> {
    // Listed first: the connection runs one command at a time, and a fetch holds it. With
    // who each says it is from: her address is what bots give to sites, so most of what
    // arrives is nobody's to answer, and is passed over without being fetched (take)
    const arrived = (
      await client.fetchAll(
        `${seen.uid + 1}:*`,
        { uid: true, size: true, internalDate: true, envelope: true },
        { uid: true },
      )
    )
      // `n:*` always names the newest mail, even one below n (RFC 3501 §6.4.8)
      .filter((one) => one.uid > seen.uid)
      .sort((a, b) => a.uid - b.uid);
    let now = seen;
    for (const one of arrived) {
      let mail: Mail | null;
      try {
        mail = await take(
          client,
          one.uid,
          one.size ?? 0,
          one.internalDate,
          wanted,
          one.envelope?.from?.[0]?.address?.toLowerCase() ?? null,
        );
      } catch (cause) {
        if (!(cause instanceof CheckLater)) throw cause;
        return { seen: now, later: cause.message };
      }
      const repeat = Boolean(mail?.id && now.ids.includes(mail.id));
      now = {
        ...now,
        uid: one.uid,
        ids: mail?.id
          ? [...now.ids.filter((id) => id !== mail.id), mail.id].slice(
              -REACH.mailIdsKept,
            )
          : now.ids,
      };
      await writeConfig(EMAIL_SEEN_KEY, JSON.stringify(now));
      if (!mail || repeat) continue;
      const thread = threads.get(mail.chat);
      // A new subject says what the mail is about; the same one again says nothing new. It is
      // named as one, as a mail shows it: bare above the words, she took it for a line of them
      const words =
        mail.subject && bareSubject(mail.subject) !== (thread?.subject ?? null)
          ? [`Subject: ${mail.subject}`, mail.words]
              .filter(Boolean)
              .join("\n\n")
          : mail.words;
      // Only a mail vouched for is answered in its thread: one that is not may be a stranger's,
      // whose subject and Message-ID her next answer would otherwise carry
      if (!mail.unproven)
        threads.set(mail.chat, {
          subject: bareSubject(mail.subject),
          last: mail.id,
          refs: mail.refs,
        });
      incoming({
        kind: "message",
        chat: mail.chat,
        name: mail.name,
        handle: mail.handle,
        words,
        files: mail.files,
        voice: null,
        unreadable: false,
        unproven: mail.unproven,
      });
    }
    return { seen: now, later: null };
  }

  /**
   * One mail read whole, or null for one that is nobody's to answer: from someone reach does
   * not want, or sent by a machine (readMail). `listed` is who the server says it is from,
   * when the listing said: a mail from someone not wanted is left where it is, not fetched
   * and parsed whole — attachments and all — to learn the same. One from someone wanted is
   * still checked on its own header and vouched for once read (readMail).
   */
  async function take(
    client: ImapFlow,
    uid: number,
    size: number,
    internalDate: Date | string | undefined,
    wanted: Wanted,
    listed: string | null,
  ): Promise<Mail | null> {
    const arrived = new Date(internalDate ?? Date.now());
    if (listed && !(await wanted(listed))) return null;
    if (size > MAIL_TAKE) {
      // Not read, so not vouched for: said only to the one who may write, in whose name it came
      const from =
        listed ??
        (await client
          .fetchOne(String(uid), { envelope: true }, { uid: true })
          .then(
            (head) =>
              (head && head.envelope?.from?.[0]?.address?.toLowerCase()) ||
              null,
          ));
      if (!from || !(await wanted(from))) return null;
      return {
        kind: "message",
        chat: from,
        name: from,
        handle: from,
        words: "",
        files: [],
        voice: null,
        unreadable: false,
        unproven: notRead(
          arrived,
          `it is ${Math.ceil(size / MB)} MB, and the most she reads is ${MAIL_TAKE / MB} MB`,
        ),
        auto: false,
        subject: "",
        id: null,
        refs: [],
      };
    }
    const kept = held?.uid === uid ? held : null;
    const source =
      kept?.source ??
      (await client
        .fetchOne(String(uid), { source: true }, { uid: true })
        .then((whole) => (whole && whole.source) || null));
    if (!source) return null;
    try {
      // A sender who cannot be checked yet throws CheckLater: only mail from the one who may
      // write gets this far, so it waits to be checked again rather than being passed over
      const mail = await readMail(source, {
        mailbox,
        arrived,
        resolve,
        wanted,
        giveUp: Boolean(kept && Date.now() - kept.since > REACH.mailHoldMs),
      });
      held = null;
      return mail?.auto ? null : mail;
    } catch (cause) {
      if (cause instanceof CheckLater)
        held = kept ?? { uid, source, since: Date.now() };
      throw cause;
    }
  }
}

/** Her inbox's connection, over TLS only, told of new mail while it idles. */
function imapClient(
  address: string,
  password: string,
  imap: MailServer,
): ImapFlow {
  const client = new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: imap.port === IMAP_TLS_PORT,
    // Never a password over a line that is not encrypted
    ...(imap.port === IMAP_TLS_PORT ? {} : { doSTARTTLS: true }),
    auth: { user: address, pass: password },
    logger: false,
    maxIdleTime: REACH.mailIdleMs,
    autoIdleDelay: REACH.mailPushAfterMs,
    maxLiteralSize: MAIL_TAKE,
    maxResponseSize: MAIL_TAKE + MB,
  });
  // A connection that fails says so in `close`; an error event with no listener would end the app
  client.on("error", (cause: Error) =>
    logger.warn(`reach email: ${imap.host}: ${cause.message}`),
  );
  return client;
}

/** A mail a bot asked for (checkMail): who sent it, when it arrived, and what it says. */
export type Checked =
  | {
      kind: "found";
      from: string;
      subject: string;
      arrived: Date;
      text: string;
    }
  /** None came in time; `unproven` names each that came from the sender and was not read, and why. */
  | { kind: "none"; unproven: string[] };

/**
 * What a bot may name as a sender: one address, or a domain someone registered — never a
 * public suffix (com, co.uk) or a name anyone can take a part of (github.io), which would
 * match every mail under it. Null when it is neither.
 */
export function senderOf(from: string): string | null {
  const wanted = from.trim().toLowerCase().replace(/^@/, "");
  const domain = wanted.slice(wanted.lastIndexOf("@") + 1);
  if (!getDomain(domain, { allowPrivateDomains: true })) return null;
  return wanted;
}

/**
 * Whether `from` — one address, or a domain and its subdomains (senderOf) — sent `address`.
 * A domain is matched whole, never as the end of another name (evilgithub.com is not github.com).
 */
export function sentBy(address: string, from: string): boolean {
  const wanted = from.trim().toLowerCase().replace(/^@/, "");
  const sender = address.toLowerCase();
  if (wanted.includes("@")) return sender === wanted;
  const domain = sender.slice(sender.lastIndexOf("@") + 1);
  return domain === wanted || domain.endsWith(`.${wanted}`);
}

/**
 * The mail checkMail handed a bot, by mailbox (address and UIDVALIDITY): who sent it and its
 * UID, so "only new" passes over what was read already and anything before it. Pinned, as
 * reach's state is: a dev reload would forget it otherwise.
 */
type Handed = { uid: number; from: string };
const pinned = globalThis as { __mailHanded?: Map<string, Handed[]> };
const handed: Map<string, Handed[]> = (pinned.__mailHanded ??= new Map());
/** How many handed mails a mailbox keeps: a bot reads a few a job. */
const HANDED_KEPT = 50;

/**
 * For a bot waiting on a site's mail — a code, a link to confirm an address: the newest mail
 * from `from` (senderOf) that reached her inbox in the last `backMs`, waiting up to `waitMs`
 * for one when none has. With `onlyNew`, mail from that sender already handed to a bot here,
 * and anything before it, is passed over: after a site is asked to send again. `passOver` is
 * never read, whoever asks: the user's own mail to her. The inbox is only read. A mail is read
 * only when its sender's domain vouches for it (readMail): one in a site's name that is not is
 * named with why, never read, since what it says could be anyone's. Throws on a sender that is
 * no one's, a sign-in refused, a server out of reach or a search it refused, in words.
 */
export async function checkMail(
  mailbox: { address: string; password: string; imap: string },
  from: string,
  times: { backMs: number; waitMs: number; onlyNew?: boolean },
  passOver: string[] = [],
  signal?: AbortSignal,
  resolve?: Resolve,
): Promise<Checked> {
  const sender = senderOf(from);
  if (!sender)
    throw new Error(
      `“${from}” is not one site's: name the domain the mail comes from, like github.com, or its address.`,
    );
  const imap = parseServer(mailbox.imap);
  if (!imap)
    throw new Error(
      `Her mailbox's reading server “${mailbox.imap}” is not host:port.`,
    );
  const address = mailbox.address.toLowerCase();
  const never = new Set(passOver.map((one) => one.toLowerCase()));
  const wanted: Wanted = (one) => sentBy(one, sender) && !never.has(one);
  const since = Date.now() - times.backMs;
  const until = Date.now() + times.waitMs;
  const client = imapClient(mailbox.address, mailbox.password, imap);
  const shut = () => client.close();
  signal?.addEventListener("abort", shut, { once: true });
  /** Mail from the sender that is not read, and why, by UID. */
  const unproven = new Map<number, string>();
  /** Mail whose sender's records did not answer: looked at again on the next pass. */
  const unchecked = new Map<number, string>();
  /** Mail already judged on an earlier pass — not read, or no one's — and not fetched again. */
  const judged = new Set<number>();
  try {
    await client
      .connect()
      .catch(
        (cause: {
          authenticationFailed?: boolean;
          responseText?: string;
          message?: string;
        }) => {
          throw new Error(
            cause.authenticationFailed
              ? `${imap.host} turned her mailbox's sign-in away (${cause.responseText || cause.message}). The user replaces its app password in Settings › Phone › Email.`
              : `Could not reach ${serverWords(imap)}: ${reasonOf(cause)}`,
          );
        },
      );
    const box = await client.mailboxOpen("INBOX", { readOnly: true });
    const kept = `${address}|${box.uidValidity}`;
    // Past what a bot here already read from this sender: the server's own numbering, not a
    // clock, which may differ from the server's by more than a mail takes to arrive
    const after = times.onlyNew
      ? Math.max(
          0,
          ...(handed.get(kept) ?? [])
            .filter((one) => sentBy(one.from, sender))
            .map((one) => one.uid),
        )
      : 0;
    let rung = false;
    client.on("exists", () => {
      rung = true;
    });
    while (!signal?.aborted) {
      rung = false;
      // SINCE is by day, in the server's own time zone (RFC 3501 §6.4.4), which may be a day
      // behind this computer's: a day earlier, and the hour is checked below from when each
      // arrived. The sender is matched on the envelope, not by the server's FROM search:
      // servers differ on whether that matches part of an address
      const found = await client.search(
        { since: new Date(since - DAY_MS) },
        { uid: true },
      );
      if (!found) throw new Error(`${imap.host} would not search her inbox.`);
      const arrived = found.length
        ? await client.fetchAll(
            found,
            { uid: true, internalDate: true, size: true, envelope: true },
            { uid: true },
          )
        : [];
      const newest = arrived
        .map((one) => ({ ...one, at: new Date(one.internalDate ?? 0) }))
        .filter(
          (one) =>
            one.uid > after &&
            !judged.has(one.uid) &&
            one.at.getTime() >= since &&
            (one.size ?? 0) <= MAIL_TAKE &&
            (one.envelope?.from ?? []).some(
              (who) => who.address && wanted(who.address.toLowerCase()),
            ),
        )
        .sort((a, b) => b.at.getTime() - a.at.getTime());
      for (const one of newest) {
        const whole = await client.fetchOne(
          String(one.uid),
          { source: true },
          { uid: true },
        );
        if (!whole || !whole.source) {
          judged.add(one.uid);
          continue;
        }
        let mail: Mail | null;
        try {
          mail = await readMail(whole.source, {
            mailbox: address,
            arrived: one.at,
            resolve,
            // The envelope said so; the one From the mail is vouched for decides
            wanted,
          });
          unchecked.delete(one.uid);
        } catch (cause) {
          if (!(cause instanceof CheckLater)) throw cause;
          unchecked.set(
            one.uid,
            `a mail whose sender could not be checked yet: ${cause.message}`,
          );
          continue;
        }
        judged.add(one.uid);
        if (!mail) continue;
        if (mail.why) {
          unproven.set(one.uid, `a mail from ${mail.chat}: ${mail.why}`);
          continue;
        }
        handed.set(
          kept,
          [
            ...(handed.get(kept) ?? []),
            { uid: one.uid, from: mail.chat },
          ].slice(-HANDED_KEPT),
        );
        return {
          kind: "found",
          from: mail.chat,
          subject: mail.subject,
          arrived: one.at,
          text: mail.words,
        };
      }
      const left = until - Date.now();
      if (left <= 0) break;
      if (!rung) await ring(client, imap.host, left, signal);
    }
    return {
      kind: "none",
      unproven: [...unproven.values(), ...unchecked.values()],
    };
  } finally {
    signal?.removeEventListener("abort", shut);
    client.close();
  }
}

/**
 * Until the server says mail arrived, `ms` passes (its word can be lost with a connection
 * that drops quietly), or listening stops. A connection that closes meanwhile is
 * trouble to connect again after.
 */
function ring(
  client: ImapFlow,
  host: string,
  ms: number,
  signal?: AbortSignal,
  /** Wait the whole time out: mail arriving changes nothing about what is being waited for. */
  whole = false,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const off = () => {
      clearTimeout(timer);
      client.off("exists", arrived);
      client.off("close", gone);
      signal?.removeEventListener("abort", arrived);
    };
    function arrived() {
      off();
      resolve();
    }
    function gone() {
      off();
      // Closed because the wait was called off: nothing went wrong
      if (signal?.aborted) resolve();
      else reject(new Error(`${host} closed the connection`));
    }
    const timer = setTimeout(arrived, ms);
    if (!whole) client.on("exists", arrived);
    client.once("close", gone);
    signal?.addEventListener("abort", arrived, { once: true });
    if (!client.usable) gone();
  });
}

/** The first line of a text, as a subject: at most the 78 characters a header line holds (RFC 5322 §2.1.1). */
function firstLine(text: string): string {
  const line = text.trim().split("\n")[0]?.trim() ?? "";
  return line.length > 78 ? `${line.slice(0, 77)}…` : line;
}

const reasonOf = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);
