/**
 * Baked-in knobs: names, roots, paths, limits. Nothing here is a secret or
 * user-settable; that lives in features/config.
 */

/** Only the log level reads this (lib/logger). */
export const IS_DEV = process.env.NODE_ENV === "development";

export const APP_NAME = "Thursday";

/**
 * Live call limits. Startup and close deadlines release stalled connections;
 * transcriptGapMs groups nearby fragments for captions, never for tool execution.
 * transcriptSaveMs sets the checkpoint interval; appendMs bounds update acknowledgements.
 * backendOutputTokens bounds each delegated answer, including reasoning tokens.
 * reasoningCheckMs bounds asking whether the backend model takes the chosen reasoning
 * settings, once per model and effort; past it the call opens with them as chosen.
 * keyCheckMs bounds asking OpenAI about a key as it is saved; past it the key is kept
 * unasked, so a slow network never stands between a user and saving one.
 * openingHoldMs holds the caller's input off while she opens a call, until her first words
 * or this long: with any sound in the room she often waited for the caller rather than
 * greet (a quiet living room under the line, 09-26: a first call spoke first 2 of 6, held
 * 6 of 6; an ordinary one 16 of 32, held 10 of 10). Longer gives her more time to begin,
 * and what the caller says in it is not heard; 0 never holds.
 * instructionsTokens is GPT-Live's own limit on the voice's instructions (Managing GPT-Live
 * sessions): a call whose instructions run past it is refused, on the plan as a line closed
 * before it opens (1006). A refused open names it when the app's estimate is past it.
 */
export const LIVE_CALL = {
  startupMs: 30_000,
  closeMs: 15_000,
  transcriptGapMs: 1_500,
  transcriptSaveMs: 500,
  appendMs: 15_000,
  backendOutputTokens: 4_096,
  reasoningCheckMs: 5_000,
  keyCheckMs: 5_000,
  openingHoldMs: 3_000,
  instructionsTokens: 16_384,
};

/**
 * A spoken call on the GPT subscription (features/thursday/thursday.plan), where the app runs
 * her backend for the voice instead of the provider.
 * - `delegationBytes`  the most of the voice's request, and of what was said since the hand-over
 *   before it, that each hand-over carries to her backend; past it the request keeps its start
 *   and the talk its end. Codex's own bound (codex-rs core context/realtime_delegation.rs
 *   `MAX_REALTIME_DELEGATION_FIELD_BYTES`). More hands the backend more of the talk at more
 *   input; less cuts a long request short.
 * - `pictureBytes`  the largest picture put down on a call (features/thursday/picture.ts) the
 *   page sends her backend on this line, where it goes over HTTP instead of a data channel with
 *   a limit of its own: about what Chrome's channel takes on a key's call. More costs the
 *   backend more to read, less blurs small text.
 */
export const PLAN_CALL = {
  delegationBytes: 4 * 1024,
  pictureBytes: 262_144,
};

/**
 * Background work put to the voice during a call (useThursday). Live never speaks
 * unprompted, so what waits on the user reaches them only when the page puts it in.
 * Each item goes in once a call; once she has voiced it, not on a later call either,
 * while the page stays open. A job that asks or ends again is a new item.
 * - `quietMs`  how long neither side's words have been transcribed before open work goes
 *   in. Transcripts arrive after the words and the clock looks once a second, so the line
 *   has been quiet a little longer than this. Shorter talks over the user, and at 0 an
 *   update goes in mid-sentence; longer leaves a result that is ready waiting through the
 *   small talk around it.
 * - `perTurn`  how many items of one kind go in at once. More puts several updates in
 *   one breath; fewer spreads them over more quiet moments.
 * - `readMs`  how long an update she never voices holds back the next one. Shorter can
 *   put the next update over one she is about to say; longer stalls the queue.
 * - `chars`  how much of one bot message goes in. A message is written for the screen;
 *   more has her read captions and source lists aloud, fewer drops what a short
 *   answer needed. The rest stays in the thread.
 */
export const CALL_RELAY = {
  quietMs: 2_000,
  perTurn: 3,
  readMs: 15_000,
  chars: 600,
};

/**
 * The activity line under her face (thursday.tsx, filled by useThursday and use-text-call). A
 * backend that uses three tools in a second reports three lines in a second, and none of them
 * can be read.
 * - `dwellMs`  the least time one line is drawn before the next takes its place; the ones
 *   behind it wait their turn. Longer reads better and runs further behind the work; her
 *   voice starting drops whatever still waits, since it is the answer those lines led to.
 * - `lingerMs`  how long a finished tool stays on the line before it clears, on a call aloud
 *   and in writing alike; in writing a bot's update she has answered clears after it too. A
 *   tool that starts within it swaps the words rather than drawing the line again. Longer
 *   leaves finished work up after it is done; shorter clears it before it is read.
 * - `relayLingerMs`  the same for a bot's update on a spoken call, once she has voiced it: it
 *   carries more to read than a tool's line.
 * - `thinkingTailMs`  how long the line keeps saying she is at work once the backend's turn is
 *   over, while it waits for her voice. Her first word is what normally ends it; this ends a
 *   turn that never reaches one. Shorter can drop the line while her answer is still coming;
 *   longer keeps it up over a turn that ended in silence.
 */
export const CALL_LINE = {
  dwellMs: 2_000,
  lingerMs: 2_500,
  relayLingerMs: 5_000,
  thinkingTailMs: 6_000,
};

/**
 * What the page of a spoken call keeps (useThursday).
 * - `scrollback`  turns of the call held for the side-by-side layout; the call view draws at
 *   most three of them. The call's row keeps every turn whatever this is: more lets the side
 *   scroll further back in a long call, fewer drops older turns from it sooner.
 * - `saveFailures`  saves of one kind (turns, thoughts) that may fail before the call stops
 *   saving that kind and says so, once. Higher rides out more failures before the warning;
 *   lower stops sooner, and what the call says after that is not kept.
 */
export const CALL_PAGE = { scrollback: 24, saveFailures: 3 };

/**
 * When a quiet call ends itself (useThursday).
 * - `hangUpMs`  how long the user has said nothing and she has neither spoken nor worked
 *   before the page hangs up, with no goodbye. Updates she voices on her own (CALL_RELAY) do
 *   not count, so waiting results cannot hold a call open, and neither do sounds transcribed
 *   in brackets ("[sigh]"). Noise transcribed as words does. Longer keeps a silent line open,
 *   billed by the minute; 40 s was too long a silence to sit through (the maintainer, 09-26).
 * - `warnMs`  how much of `hangUpMs` counts down on screen.
 */
export const CALL_IDLE = {
  hangUpMs: 25_000,
  warnMs: 10_000,
};

/**
 * Reaching Thursday from a phone (features/reach): a chat app the server asks for what was
 * written, so no port is opened and nothing outside can call in.
 * - `pollSeconds`  how long one ask waits for a message before it is asked again. The chat
 *   service holds the request open, so longer is fewer requests, not slower answers.
 * - `retryMs`  the wait after an ask that failed (no network, the service down).
 * - `idleMs`  how long nothing is written before the conversation is closed as a call,
 *   unless work it started is still running. What is written next opens a new one, which
 *   reads this one back under Earlier calls. Shorter and an evening is many calls; longer and
 *   a finished thread raises no desktop notice meanwhile (an open call is taken to be listening).
 * - `messages`  how much of the conversation she is sent with a turn. Every turn sends all of
 *   it again, so this bounds what a long day of writing costs a turn, not what the model can
 *   hold. Only words are counted: what a tool answered and what she thought leave an older
 *   turn before this is looked at.
 * - `trimTo`  what is left once `messages` is passed, cut where the user speaks. Below it on
 *   purpose: a conversation that loses one message a turn opens differently every turn, and
 *   the provider's prompt cache never matches.
 * - `oldChars`  the most an older message keeps. The turn just answered is never cut.
 * - `files`  how many of the files her answer names are sent along with it. The rest are named
 *   in the chat as left on this computer.
 * - `fileBytes`  the largest file taken from a chat or sent to one, since each is held in
 *   memory whole. A service that takes less says so itself (its channel's `limits`); a file
 *   past either is named in the chat instead.
 * - `rateRetries`  how many times one request waits out a service's "too many requests"
 *   before its refusal stands. Higher rides out a longer burst; lower gives up on a long
 *   answer's last pieces sooner.
 * - `rateWaitMs`  the longest one such wait. A service asking for more is refused rather than
 *   waited on: a turn that waits holds up everything written after it.
 * - `codeDigits`  how long the code is that someone asking to be let in is sent, and the
 *   screen's Allow shows beside their name. Longer is harder to guess at a glance; shorter is
 *   quicker to compare.
 * - `held`  how many messages someone waiting to be let in may write before the rest are
 *   dropped; those kept are answered once they are let in. More keeps a longer first request;
 *   fewer bounds what a stranger can pile up in memory before being turned away.
 * - `pictures`  how many pictures of a page go with it (reach/pictures): its first slides or
 *   boards, or its first screens from the top. With the page's PDF that is ten files, what
 *   one Discord message carries and one Telegram album holds; the PDF has the rest.
 * - `drawMs`  how long drawing them may take before the page goes without them. Nine slides
 *   draw in a few seconds; a page that never finishes loading would otherwise hold up
 *   everything sent after it.
 * - `lookMs`  how long a change to the threads waits before open work is looked for, so the
 *   changes after it in the same burst are one look: a working bot changes threads many times
 *   a second. Longer holds a bot's question or ending that much longer before the phone gets
 *   it; shorter reads the inbox more often while bots work.
 * - `mailFreshMs`  how old a mail may be and still be read (reach/email), by when it was
 *   written and when it arrived. It bounds the backlog answered after the app was off, and
 *   an old mail of theirs, still carrying their mail service's signature, being sent to her
 *   again by someone it once went to. Longer answers mail from further back; shorter turns
 *   away one that was slow on its way.
 * - `mailCheckAgainMs`  how long a mail waits to be checked again when its sender's records
 *   could not be looked up (no network, a resolver down). Only mail from the one who may write
 *   is checked at all, so it is not passed over: the mailbox waits on it and the screen says
 *   why. Shorter answers sooner once the network is back; longer asks DNS less while it is down.
 * - `mailHoldMs`  how long such a mail is held before it is refused, with that as the reason
 *   they are told. Everything they write waits behind it meanwhile. Longer rides out a longer
 *   DNS outage; shorter tells them sooner that a domain whose records never answer is the
 *   trouble, and lets their next mail through.
 * - `mailPushAfterMs`  how long the mailbox's connection is quiet before the server is asked
 *   to say when mail arrives (IMAP IDLE). A mail that arrives before then waits for it: the
 *   library's own 15 seconds made every answer to a quick reply that much later. Lower asks
 *   sooner, at two extra round trips when a command follows within it.
 * - `mailIdleMs`  how long the mailbox's connection idles before it is renewed. A server may
 *   drop an idle one after 30 minutes (RFC 3501 §5.4), and some drop it sooner without a word;
 *   longer risks a connection that is gone before anyone knows, shorter renews it for nothing.
 * - `mailDnsMs`  how long a sender's DNS records may take to look up before the mail is set
 *   aside to be checked again (`mailCheckAgainMs`). Longer waits out a slow resolver; shorter lets
 *   one slow domain hold up the inbox for less time.
 * - `mailIdsKept`  how many Message-IDs of mail already answered are kept, so one sent to her
 *   again is not answered again. More remembers further back, in the one config row.
 * - `mailLookMs`  how often the mailbox is looked through even when the mail server has not
 *   said anything arrived. A server's word that mail arrived can be lost with a connection
 *   that drops quietly; shorter finds such a mail sooner, longer asks the server less.
 */
export const REACH = {
  pollSeconds: 50,
  retryMs: 5_000,
  idleMs: 10 * 60_000,
  messages: 40,
  trimTo: 30,
  oldChars: 1_000,
  files: 3,
  fileBytes: 45 * 1024 * 1024,
  rateRetries: 3,
  rateWaitMs: 30_000,
  codeDigits: 4,
  held: 5,
  pictures: 9,
  drawMs: 60_000,
  lookMs: 2_000,
  mailFreshMs: 48 * 60 * 60_000,
  mailCheckAgainMs: 30_000,
  mailHoldMs: 60 * 60_000,
  mailPushAfterMs: 1_000,
  mailIdleMs: 4 * 60_000,
  mailDnsMs: 5_000,
  mailIdsKept: 200,
  mailLookMs: 5 * 60_000,
};

/**
 * A bot reading her mailbox for a site's mail — a code, a link to confirm the address
 * (tools/mail.tool, reach/email checkMail).
 * - `backMs`  how long ago a mail may have arrived and still be the one waited for: a site
 *   mails as its form is sent, often before the bot asks. Longer finds a slower mail but
 *   also one from an earlier try; shorter misses one that came while the bot did something
 *   else first.
 * - `waitMs`  how long it waits for one when the bot does not say.
 * - `waitMaxMs`  the most a bot may ask to wait: its job waits the whole time.
 * - `chars`  how much of the mail the bot reads. A code or a link sits near the top, and a
 *   footer of links and small print is most of the rest.
 */
export const MAIL_CHECK = {
  backMs: 30 * 60_000,
  waitMs: 120_000,
  waitMaxMs: 300_000,
  chars: 6_000,
};

/**
 * A call-back rings on the call screen instead of opening the line (use-call-ring).
 * - `ringMs`  how long it rings before it stops by itself. What rang stays in the room's
 *   inbox, and only work that changes after the ring starts rings again.
 */
export const CALL_BACK = {
  ringMs: 30_000,
};

/**
 * How long the idle hint says why the last call ended (thursday.tsx Hint) before the
 * screen goes back to its usual line. Longer and a reason from hours ago is still the
 * only thing on screen, in place of the way back in; shorter and someone who stepped
 * away as the line dropped never learns why.
 */
export const CALL_ENDED_MS = 12_000;

/**
 * How the page hangs up once the backend calls `end_call` (useThursday): her goodbye is let
 * finish, within bounds.
 * - `quietMs`  silence after her voice that counts as the goodbye being over, and the least
 *   time the tool's own result gets to go out. Shorter clips a goodbye at a pause; longer
 *   leaves dead air before the line drops.
 * - `unsaidMs`  how long to wait for a goodbye that has not started; voice heard this
 *   long before `end_call` counts as the goodbye already said.
 * - `maxMs`  the longest the line stays open after `end_call`, however long she talks.
 */
export const CALL_END = {
  quietMs: 600,
  unsaidMs: 2_000,
  maxMs: 8_000,
};

/**
 * How far a heard word may be from a word of the wake phrase and still count (use-wake-word),
 * as edits per letter of the wanted word ("hey" = 1 edit, "thursday" = 3; never below one).
 * Lower misses accents; higher lets ordinary speech wake her.
 */
export const WAKE_TOLERANCE = 0.34;

/**
 * The app's own files (build, migrations, shipped skills). `THURSDAY_APP_DIR`
 * overrides; defaults to the cwd.
 */
export const APP_DIR = process.env.THURSDAY_APP_DIR?.trim() || process.cwd();

/**
 * The user's files (database, workspace, installed skills). `THURSDAY_HOME`
 * overrides; defaults to the cwd. Never touched by an upgrade.
 */
export const DATA_DIR = process.env.THURSDAY_HOME?.trim() || process.cwd();

/**
 * Where the browser reaches this app: `THURSDAY_URL`, else localhost on `PORT`,
 * which both starters set to the free port they found (bin/port.mjs). Used as
 * the MCP OAuth redirect URL, which fails silently after login when wrong.
 */
export const APP_URL =
  process.env.THURSDAY_URL?.trim() ||
  `http://localhost:${process.env.PORT?.trim() || 3000}`;

/**
 * Moving to a newer version (features/settings/update). npm's registry is asked which version
 * is `latest` only when a browser opens the app, never on a timer.
 * - `checkMs`  how long npm's answer is believed before it is asked again. Longer asks npm
 *   less often and hears of a release that much later.
 * - `againMs`  how long an ask that got no answer (no network, a VPN's certificate) stands
 *   before npm is asked again. Shorter hears of a release sooner once the network is back;
 *   longer asks a registry that cannot be reached less often.
 * - `timeoutMs`  one ask's wait. The page that opened waits on it, so longer holds the
 *   notice back on a slow network.
 * - `quietMs`  how long the notice stays away once it is closed. Shorter says a release
 *   again sooner to someone who put it off.
 * - `waitMs`  how long the page waits for the new version to answer once Update is pressed
 *   before it says the update did not come up: an install from npm, then a first boot that
 *   may migrate the database (bin/background.mjs gives that boot 90 seconds by itself).
 *   Shorter calls a slow install a failure; longer leaves "Updating" up over one that died.
 * - `pollMs`  how often the page asks meanwhile. The server is down for part of it, so this
 *   is also how soon after it is back the page reloads.
 */
export const UPDATE = {
  checkMs: 24 * 60 * 60_000,
  againMs: 10 * 60_000,
  timeoutMs: 5_000,
  quietMs: 24 * 60 * 60_000,
  waitMs: 5 * 60_000,
  pollMs: 2_000,
};

/** The database file. Absolute because the process may not run inside DATA_DIR. */
export const DB_PATH = `${DATA_DIR}/local.db`;

/** libsql URL of DB_PATH. */
export const DB_FILE_NAME = `file:${DB_PATH}`;

/**
 * The data folder's own `.env`, where the key that seals the secrets in DB_PATH is kept when
 * the environment does not set it (lib/secret). Beside the database, so it goes wherever the
 * database goes: a copy of the folder carries both.
 */
export const ENV_PATH = `${DATA_DIR}/.env`;

/**
 * Relative paths; readers join them with the root that owns them (APP_DIR for
 * the app's, DATA_DIR for the user's).
 */
// Dot-prefixed so it never reads as part of the app.
const WORKSPACE = ".ai-workspace";

export const PATHS = {
  workspace: WORKSPACE,
  /**
   * Workspace folders a bot may write into, relative to the workspace. They are
   * split by how long what is in them lives: `artifacts/<bot>` finished results
   * the user opens and `projects` code that outlives any one job are the user's
   * and stay; `scratch/<job>` goes with its job, or once the job has ended
   * WORKSPACE_KEEP ago; `bots/<name>` lasts as long as the bot. The workspace
   * root is refused.
   */
  artifacts: "artifacts",
  projects: "projects",
  scratch: "scratch",
  /**
   * A bot's own corner, one folder per bot: its memory (`memory/`, features/bot/bot.memory),
   * a sign-in it kept, a script it wrote once and reuses, a table it built — anything
   * worth having on the next job. Kept apart from `scratch` because the two die at
   * different times: a job's material dies with the job, a bot's kit lives as long as
   * the bot.
   */
  bots: "bots",
  /** Where tool output over TOOL_OUTPUT is written in full. */
  output: ".output",
  /**
   * The sites the user signed in to (features/signins), one file per account. Under DATA_DIR
   * and outside the workspace, so no bot comes across another's session among its files;
   * named here because `pnpm reset` has to find it without the app.
   */
  signIns: ".sign-ins",
  skills: {
    default: "skills", // ships with the app, read-only
    // The user's own, inside the workspace; where `npx skills add` installs.
    custom: `${WORKSPACE}/.agents/skills`,
    // One bot's own, inside its folder (`bots/<name>/.agents/skills`): listed to that bot
    // alone. The same shape as `custom`, so `npx skills add` run from the bot's folder
    // installs here and what that tool leaves beside it goes when the bot's folder does.
    own: ".agents/skills",
    // Inside a skill, what its scripts draw with — a page's shell, a deck's drawing — and a
    // bot never opens: `load_skill` leaves it out of the files it lists
    runtime: "runtime",
    // A ready-made bot's own skills, shipped with the app beside `default`:
    // `seed-skills/<the bot's name, lowercased>/`, listed to the bot of that name alone and read
    // where they ship, never copied, so an update of the app reaches them
    seeds: "seed-skills",
  },
};

/** Rows per page for every scrolling list. */
export const PAGE_SIZE = 50;

/**
 * How long a list's search box waits after the last key before it asks the server
 * (Settings › Threads). Shorter asks once a letter; longer feels like the box is not listening.
 */
export const SEARCH_WAIT_MS = 250;

/**
 * Ended jobs, done or stopped, the inbox carries beside everything still running
 * or waiting, read or not, so the room sees each one end (a stop is read by
 * whoever made it); older ones are under History only. The room in the call
 * screen's corner and the Threads badge read that one list. Unread endings, and
 * endings a call has not relayed, remain regardless of this limit (INBOX_UNREAD).
 * More keeps older endings in reach at the cost of a larger inbox read.
 */
export const INBOX_FINISHED = 5;

/**
 * The newest unread endings, and endings a call has not relayed, the inbox carries; older
 * ones stay unread under History. What reads them takes fewer still: the corner shows
 * FINISHED_NOTICE.rows, the pill a dot per bot, a call the ones that end while it is open.
 * Uncapped, a routine nobody opened made the one list every thread event re-reads grow
 * by a row a run: 320 rows and 519 KB, read for 1.1 s before the page's other requests
 * (UX test, 2026-10-01). Fewer drops an older unread ending's dot from the pill sooner.
 */
export const INBOX_UNREAD = 20;

/**
 * How often the page reads the thread inbox again on its own (useThursday), besides the
 * `threads` signal the event stream sends for every change and the full read a reconnected
 * stream makes. A safety net only: shorter reads the inbox more often for nothing while the
 * stream is healthy; longer leaves a change whose signal was missed off the screen longer.
 */
export const INBOX_POLL_MS = 30_000;

/** Jobs returned to the call: prioritize open work, then fill with recent endings. */
export const THREAD_STATUS_LIMIT = 10;

/** History page size in calls, not rows; each call carries every turn. */
export const CALL_HISTORY_PAGE = 10;

/**
 * The Workspace section (features/workspace), which browses what bots wrote.
 * - `rows`  entries one folder listing returns; the rest load on demand. Only
 *           the ones returned are `stat`ed, so a folder of 20,000 files costs
 *           the same readdir as a folder of 20.
 * - `textMax`  text handed to a page or a dialog. Past it only the head is
 *           read and the view says so; the whole file stays behind Download.
 * - `elementMax`  an image or page drawn as an element. Past it nothing is
 *           drawn: an `<img>` decodes whole and a huge DOM cannot be scrolled.
 *           Audio and video are not capped — they stream over Range.
 * - `autoCloseMs`  how long a file Thursday put up on a call stands before it
 *           closes itself. It is the glance, not the read: long enough to see
 *           what arrived, short enough that a caller who is not looking gets
 *           their screen back without touching anything. The first real input
 *           cancels it for good, so raising this only lengthens the glance.
 *           A file the user opened is never on this clock.
 */
export const WORKSPACE_VIEW = {
  rows: 200,
  textMax: 512 * 1024,
  autoCloseMs: 5_000,
  elementMax: 50 * 1024 * 1024,
};

/**
 * A page's edits its file would not take — the file changed under them, or the save
 * failed — kept aside in this browser for that file until a later save or the reader lets
 * them go (features/workspace/page-drafts.ts). Browser storage holds a few million
 * characters for the whole app, so one page is held to a share of it.
 * - `perFile`  how many sets of one file's edits, each written on another version of it,
 *   are kept at once. One more is refused and the page says it could not keep them aside;
 *   none is ever let go to make room.
 * - `chars`    the most characters one file's kept edits may hold together. Larger
 *   leaves a page more room and the rest of the app less.
 */
export const PAGE_DRAFTS = {
  perFile: 8,
  chars: 1_000_000,
};

/**
 * A file's face before it is opened (workspace file-thumb): a page in miniature, the
 * head of a text.
 * - `pageWidth`  the width an html page is laid out at before it is scaled into its
 *   tile. Narrower draws the page's phone layout; wider makes its words smaller.
 * - `textWidth`  the same for markdown and text. Narrower reads larger and shows less.
 * - `textBytes`  how much of a text file is fetched for its face. The tile shows a
 *   screenful; more is downloaded and never seen.
 * - `pages`  how many live pages one message draws. Each is a real page load, scripts
 *   and all; the ones past this show their glyph and open as before.
 * - `imageWidth`  the width a picture's face is optimized to before it is sent. A tile is
 *   at most ~180 CSS px, so this is the retina size; the source is whatever a bot made,
 *   often a few megabytes. One width for every tile, so the same picture in two places is
 *   optimized once. Raising it costs bandwidth and decode time on every screen that lists
 *   files; lowering it shows in the largest tile first.
 * - `cacheSeconds`  how long an optimized face is reused before it is made again. A bot
 *   can overwrite a file under the same name, and the optimizer keys on the url alone, so
 *   this is also how stale a tile can be. Making one again costs ~50ms on the server.
 */
export const FILE_THUMB = {
  pageWidth: 1024,
  textWidth: 512,
  textBytes: 4096,
  pages: 2,
  imageWidth: 384,
  cacheSeconds: 300,
};

/**
 * The Artifacts section (features/artifact), which lists every bot's folder in
 * `artifacts/` and what is loose there — one entry is one artifact.
 * - `rows`  entries the menu returns; the rest load on demand.
 * - `setFiles`  files one opened set draws before the sheet asks for more.
 * What the browser is handed is capped by WORKSPACE_VIEW: the two sections
 * open files with the same reader.
 */
export const ARTIFACT_VIEW = { rows: 200, setFiles: 120 };

/**
 * Files the user hands over from the screen (the write line). They are kept in the
 * workspace under `dir`, so a bot or the call reads one by its path and nothing else
 * stores it; a bot cannot write there.
 * - `maxBytes`    the largest one file taken. `next.config.ts` sets the server action
 *   body limit and the proxy's from the same two numbers, so raise them together.
 * - `perMessage`  how many one message carries; more reads as a folder, which is better
 *   named in words.
 */
export const GIVEN_FILES = {
  dir: "inbox",
  maxBytes: 25 * 1024 * 1024,
  perMessage: 8,
};

/**
 * The corner where finished work lands on the call screen
 * (workspace/components/artifact-view). Nothing about it is kept: a reload
 * clears it, and what the user has not opened still waits in the bot room.
 * - `rows`   finished jobs it holds before the oldest drops off. More turns the
 *   corner into a second inbox, and the room already is one.
 * - `shown`  cards drawn at once. One card stands clear of what she is saying
 *   beside her face, whatever length that runs to; two leave 38px of it and three
 *   cover 236px (measured at 1280x860). The rest of `rows` wait behind it, counted,
 *   and step forward as the one in front is opened or closed.
 * - `words`  characters of the answer a card is sent. It draws two lines of
 *   them; the rest only makes the event heavier.
 */
export const FINISHED_NOTICE = { rows: 5, shown: 1, words: 240 };

/**
 * The pill's faces with nothing going on (room-pill, the maintainer's pick 10-01), and the faces
 * on finished jobs' cards (artifact-view): awake for `awakeMs` after the screen opens, a card
 * lands, or the window comes back to the front, to say a team is here, then at rest — still, eyes
 * open, a blink or a glance now and then and nothing drawn between (bot-mark `resting`); shut
 * eyes read as dead (the maintainer, 10-01). A bot working or waiting on the user is never at
 * rest. Faces drawn every frame were the largest part of an idle screen's cost: on an M4 the
 * idle call screen's GPU went from 35-40% to 19-22% with the pill's asleep, and to 9-13% with
 * the cards' too (headless Chrome, 10 samples).
 * - `awakeMs`  how long they stay awake. Longer shows the team longer and costs that much more
 *              drawing each time the window comes back.
 */
export const CREW_REST = { awakeMs: 4_000 };

/**
 * Cap on the text a single tool result returns to the model (chars). Beyond
 * `max`, only `head` + `tail` are kept and the full text goes to PATHS.output.
 * Shell output and MCP results share it.
 */
export const TOOL_OUTPUT = { max: 8_000, head: 5_500, tail: 1_500 };

/**
 * The shortest secret hidden from what a shell prints (chars; workspace heldSecrets). A
 * connector's headers and env are sealed whole, plain values beside the credentials, and a
 * short one — `info`, a port, a name — would be hidden everywhere it appears (one naming a
 * path that exists is never hidden, however long). Lower hides more ordinary text; higher
 * shows a short credential.
 */
export const HIDDEN_SECRET_MIN = 12;

/**
 * Limits on one bot run (features/bot/bot.run).
 * - `steps`  steps per segment; at the limit the last step is forced to `answer`
 *            and the job waits for the user to continue.
 * - `compactAt`  context size in tokens at which the run compacts when the model's
 *            window cannot be known (model.ts compactBudget asks the gateway's
 *            catalog, and a provider used directly carries one per model). Set
 *            for the windows current models carry: a smaller model the app
 *            knows nothing about can reach its limit first, and its refusal
 *            then lowers that job's own threshold (`overflowShrink`).
 * - `compactHeadroom`  fraction of a known window used as the budget. Not
 *            tidiness: the summarising call sends the whole context plus its
 *            instructions and must get a summary back, so it needs room above
 *            the threshold that triggered it.
 * - `summaryWords`  summary length: one word per `perTokens` of budget, clamped
 *            to `min`..`max`.
 * - `participants`  distinct bots allowed in one room. Existing participants remain reusable.
 * - `concurrent`  participant turns allowed to run together in one thread. A bot still runs once at a time.
 * - `turns`  automatic turns across the whole room between user messages or manual resumes.
 * - `queuedMessages`  open exchanges allowed in one room, including questions waiting on the user.
 * - `silenceMs`  how long a model call may send nothing before the run takes the
 *            connection for dead and stops (bot.run silenceWatch). Not counted
 *            while a tool or a compaction does the work; those bound themselves.
 *            A model that thinks before its first word is silent that long, so
 *            this is minutes. A one-shot call (compaction)
 *            sends nothing until it is done and gets it whole.
 * - `overflowShrink`  what a job's compaction threshold is multiplied by when the
 *            model refuses its context as too long, so the resume compacts first.
 * - `retryMs`  wait before the one more try a turn gets when its model call breaks
 *            (a dropped or garbled stream, an overload, a model gone quiet, a context
 *            refused as too long). A second break, a provider's refusal (the key, the
 *            credit, the model id), the content filter and the step limit wait for a
 *            person. Longer rides out a longer outage; the turn holds its place meanwhile.
 * - `compactFiles`  files the app lists under a compaction summary — what the job
 *            has on disk, the newest kept (bot.run filesUnder). Past it the list
 *            says how many older ones there are; all of them stay in the Workspace.
 */
export const BOT_RUN = {
  steps: 100,
  compactAt: 500_000,
  compactHeadroom: 0.8,
  summaryWords: { min: 600, max: 3000, perTokens: 200 },
  // Bound concurrent work and the whole conversation between user interjections.
  participants: 8,
  concurrent: 8,
  turns: 120,
  queuedMessages: 200,
  silenceMs: 5 * 60_000,
  overflowShrink: 0.6,
  retryMs: 10_000,
  compactFiles: 40,
};

/**
 * How many bots can exist, switched off or not: an off bot is one switch from the roster.
 * Past it, making one is refused with the number, and ready-made bots are added only as far
 * as it goes. Every bot that is on is a line in every prompt and one more for Thursday to
 * choose between (PROMPT_CROWDED says so first); higher lets the roster outgrow what a call
 * picks from well.
 */
export const BOT_ROSTER = { max: 14 };

/**
 * The longest, in characters, a few things the user or a model writes and the app keeps. The
 * screen's fields stop at it, and a save past it is refused, whoever wrote it.
 * - `name`  a bot's name: what Thursday calls it when she hands it work. It cannot be renamed.
 * - `description`  what a bot is for, as the user wrote it: a line in every prompt that lists
 *   the roster, and the one the call picks a bot by.
 * - `shortDescription`  the line a bot may write about itself (`describe_self`), which the
 *   roster reads after that description.
 * - `prompt`  a bot's own instructions, and each of Thursday's two (Settings › Thursday).
 * Longer lets more in, and all of it is paid for in every prompt that carries it. A ready-made
 * bot's fields stay within these (bot.seed, checked by test:bot): lowering one past a seed's
 * makes that field one its page cannot save.
 */
export const COMMON_VALIDATE = {
  name: { max: 16 },
  shortDescription: { max: 60 },
  description: { max: 100 },
  prompt: { max: 4000 },
};

/**
 * How much a bot's own memory (`bots/<name>/memory/`, features/bot/bot.memory) holds. Its
 * prompt lists every file by its first line, paid on every step of every job that bot runs,
 * and a job that opens a file reads all of it. A `bash` or `write_file` that leaves more files,
 * or a longer file, is undone and its result names the limit, so the bot deletes, merges or
 * shortens and writes again. Lowering either removes nothing already kept; the bot hears of it
 * on its next write there.
 * - `files`  files the folder keeps, every one of them listed.
 * - `chars`  characters in one file, not counting whitespace at either end. Characters rather
 *            than tokens because a bot can count them itself (`wc -m`).
 * Many small files rather than a few long ones (the maintainer's pick, 10-01): one thing
 * learned to a file, so a job opens only the one it needs. At 60 lines of about 100
 * characters the listing is some 1,500 tokens on each step, read back from the cache.
 */
export const BOT_MEMORY_LIMITS = { files: 60, chars: 3_000 };

/**
 * What a bot keeps for itself, as the screen shows and puts back (features/bot/bot.lesson).
 * - `fileChars`  the longest file of a skill held as text, before and after a command, so a
 *                change can be put back; a longer one, or one that is not text, is named as
 *                changed and left as it is. Higher holds more of a large skill in the database
 *                at each change; lower leaves more of one that cannot be put back.
 * - `listed`     lessons a bot's page lists, newest first.
 * - `shownChars`  how much of the memory file or SKILL.md a lesson's row opens to; the rest is
 *                on disk. Higher carries more text in every list of lessons.
 */
export const BOT_LESSON = { fileChars: 64_000, listed: 40, shownChars: 2_000 };

/**
 * When a job is done, each bot that worked in it looks back once and keeps what it learned
 * about working (bot.runner reflect): Hermes Agent writes a skill after a task of five or more
 * tool calls, OpenClaw has its agent save before compaction. Here no job of 40 overnight
 * compacted, and a bot kept something on its own in one of them, so the look back is at
 * the end. It is one more turn on a conversation the provider has cached, its tokens added
 * to the job's; the user turns it off with the bots' memory (Settings › Bots). Checked on two
 * comparison pages (10-01): after the one that went smoothly it kept nothing, after the one
 * where a site would show prices only in the local currency both bots kept the way round it;
 * the look backs came to 10% and 13.5% of the jobs' input, read 84-92% from the cache.
 * - `minTools`  tool calls a bot made in the job before it looks back; a job of fewer taught
 *               it little a later one would have to find out again. Lower looks back on more
 *               jobs, each costing a turn.
 * - `steps`  steps the look back may take: a file or two written, a skill changed.
 */
export const BOT_REFLECT = { minTools: 5, steps: 8 };

/**
 * Connected tools one bot may be pinned to (Settings › Bots). A pinned tool is handed to the bot
 * as a tool of its own, its schema sent on every step of every job it runs, where the rest are
 * reached through `tool_search`. A prompt-size budget, not a database limit: more spares the
 * bot that search for more tools and makes each of its steps carry their schemas.
 */
export const MAX_PINNED_TOOLS = 10;

/**
 * How many of the most recently changed threads a label is matched against when a thread is
 * named by its label rather than its id (thread.query resolveThread), as the call's thread
 * tools may name one. An older thread is found by its id alone. More reaches further back and
 * reads that many rows for each label named; fewer sends the model to the id sooner.
 */
export const THREAD_LABEL_REACH = 20;

/**
 * Characters of the user's own words a job handed over from the screen keeps as its label
 * (bot.schema labelOfWords), cut at a word. The label names the thread on screen and to the
 * model, which quotes it back whole to find the thread, so every update Thursday is given
 * carries it. More keeps more of a long request in the name and in each of those lines; fewer
 * cuts it sooner.
 */
export const THREAD_LABEL_CHARS = 120;

/**
 * Lines of one tool's result read when the room opens it whole (thread.query readToolResult);
 * a web search's is read as far in the thread's list, to find the pages its row names. Past it
 * the rest is not sent, so one log file cannot flatten the browser; more sends and draws more
 * of a long output.
 */
export const FULL_RESULT_LINES = 400;

/**
 * How many of its other threads a bot's prompt lists (thread.query `listBotWork`): the ones
 * it coordinates and the ones it was called into, each as one line with its own last words
 * there. It is what a new thread knows of the bot's earlier work without anything being kept
 * for it. Paid on every turn that bot runs; more reaches further back at that cost.
 * - `open`    threads still running or waiting, newest first.
 * - `recent`  threads that ended, newest first.
 * - `said`    characters of those last words a line carries. A line cut here carries an id,
 *             and only then is the bot handed the tool that opens one whole: nothing cut,
 *             no tool. Longer lines cost every turn; shorter ones send the bot to the tool.
 * - `files`   paths one line names from those last words.
 * - `reads`   threads that tool opens in one turn, so a model that opens them out of habit
 *             spends this many steps on it and no more.
 * - `asked`, `readChars`  characters of what it was asked there, and of its last words, that
 *             one opening returns.
 */
export const BOT_WORK = {
  open: 5,
  recent: 5,
  said: 80,
  files: 2,
  reads: 2,
  asked: 400,
  readChars: 4_000,
};

/**
 * Routines: jobs that start by themselves (features/routine). Every start is a model run
 * nobody asked for that minute, so what bounds them is here rather than in a prompt.
 * - `tickMs`    how often the clock looks for a routine that is due. A start is late by at
 *               most this; shorter buys nothing a person would notice.
 * - `max`       routines that can exist. Past it, making one is refused with the number.
 * - `minHours`  the shortest `every` interval. Lower starts more runs nobody watches.
 * - `runsShown` a routine's latest runs listed on its sheet; the rest are in Threads.
 * - `watchMs`   how long a routine's watch (routine_watch) may run before it counts as failed,
 *               which wakes its bot. The clock waits on it, so a longer one holds every
 *               routine due after it by as much.
 * - `watchChars` how much of what a watch prints is compared, kept and told to the bot. A
 *               watch that prints more changes on what is cut off without anyone woken.
 */
export const ROUTINE = {
  tickMs: 30_000,
  max: 12,
  minHours: 1,
  runsShown: 5,
  watchMs: 60_000,
  watchChars: 2_000,
};

/**
 * Shipped skills a seed bot claims by name (PATHS.skills.default), because they are the tool
 * of that bot's trade rather than one method among many. Every other
 * skill a bot finds through its own description.
 */
export const ARTIFACT_SKILL = "artifact";
/** The Writer's own, shipped in `seed-skills/writer/` (PATHS.skills.seeds). */
export const MARKETING_SKILL = "marketing";
/** The Concierge's own, shipped in `seed-skills/concierge/`. */
export const TRAVEL_SKILL = "travel";

/**
 * Shipped skill names that were folded into another, and the one they are in now. A role
 * copied into a bot before the fold still names the old one (bot.seed): `load_skill` opens
 * the new one for it and says so, rather than answering that no such skill exists.
 */
export const SKILLS_FOLDED: Record<string, string> = {
  design: ARTIFACT_SKILL,
  "picture-book": ARTIFACT_SKILL,
  "interactive-page": ARTIFACT_SKILL,
};

/**
 * Ready-made bots renamed, by the old name's kit folder and the one it ships in now. A bot
 * installed under the old name keeps it — a bot's name never changes — and its role still
 * names the kit's skills, so it reads the kit where it ships now (features/skills/seed-kit).
 */
export const SEED_KITS_RENAMED: Record<string, string> = {
  marketer: "writer",
};

/**
 * Settings › Skills (features/skills).
 * - `uploadBytes`  the largest `.md`, `.zip` or `.skill` it takes. Raising it lets a skill with
 *                  bigger files in; the file crosses as it is, in one server action under
 *                  next.config's bodySizeLimit.
 * - `inlineBytes`  the largest file it shows, and writes back, as text; one past it is listed
 *                  as a file a bot still reads from disk.
 * - `unpackedBytes`, `archiveEntries`  what an uploaded archive may hold once opened. It is
 *                  opened in the server's memory, so a few megabytes that unpack to gigabytes
 *                  would stall every job with it; raising them lets bigger kits in.
 */
export const SKILL_FILES = {
  uploadBytes: 20 * 1024 * 1024,
  inlineBytes: 512 * 1024,
  unpackedBytes: 100 * 1024 * 1024,
  archiveEntries: 1_000,
};

/**
 * A deck a bot makes with `make_deck` (ai/tools/deck.tool).
 * - `slides`  the most one deck holds. A change sends the whole deck again, so a longer one
 *   costs every change more to write; past this it is a document, not a talk.
 * - `shotsMs`  how long the pictures of its slides may take before the deck is handed back
 *   without them, unchecked. Thirty slides are drawn in well under a minute.
 */
export const DECK = { slides: 30, shotsMs: 90_000 };

/**
 * Size of the browser a job drives (workspace.ts jobShellEnv). A headed window
 * takes this, and it opens over whatever the user is doing — big enough to read
 * a real page, small enough not to be the screen.
 */
export const BROWSER_VIEWPORT = "700x700";

/**
 * How long the app waits on a browser command it sends itself, not a bot's own
 * (workspace, signins.query, ai/tools/signin.tool).
 * - `readMs`  one that only asks — `list`, the page's address — or closes a job's
 *   browsers when it is cancelled, deleted or swept. A list, and reading or setting the
 *   mark that says a browser is the one a sign-in was lent to, run before a sign-in is
 *   lent, kept or renewed too, so a browser that hangs holds each of those this long.
 * - `loadMs`  each step of lending or keeping a sign-in: `state-load`, `state-save`, and
 *   the `close`, `open` and `goto` that take its window away. Shorter fails a slow
 *   machine part way through a sign-in; longer holds the bot's step this long when the
 *   browser hangs.
 */
export const BROWSER_CLI = { readMs: 15_000, loadMs: 30_000 };

/**
 * How long one shell command may run before it is killed (lib/sandbox). Nothing
 * is watching it, so a command that stops to ask never gets an answer; the
 * number is said in the shell guide a bot reads (ai/tools/workspace.tool).
 */
export const EXEC_TIMEOUT_MS = 180_000;

/**
 * How long one shell command may run during a call (ai/load-tools, the call's
 * `bash`). She keeps listening, but the backend cannot answer until the command
 * returns, so this is how long one command can hold her answer back; anything
 * slower is a job for a bot. Raising it lets the call run slower commands itself,
 * and leaves the user waiting that much longer for the result.
 */
export const CALL_EXEC_TIMEOUT_MS = 15_000;

/**
 * A call in writing (thursday/thursday.text): the call's backend alone, answering what is
 * typed to her.
 * - `maxSteps`  how many model steps one answer may take. Each tool she uses is a step,
 *   so fewer cuts an answer short in the middle of looking something up; more lets a
 *   cheap model circle for that long before the user reads anything.
 * - `model`     what the call row carries where a voice call names its Live model, so a
 *   call kept in writing can be told from one that was spoken.
 * - `autoTurns`  how many turns a bot's update may start on its own between the user's
 *   messages (use-text-call). Past it what bots send waits on screen and goes in with the
 *   next thing the user writes: fewer leaves results unanswered in the conversation, more
 *   lets her and a bot trade replies that long with nobody reading.
 * - `chunkMs`  how long a page's turn waits on the model between two pieces of its stream
 *   before it ends in an error the page shows with Send it again. Without it a stream that
 *   went quiet partway held the turn open with nothing said (4.5 minutes in the UX test).
 *   Lower ends a turn a slow model was still thinking through; higher leaves the user
 *   waiting that long on a turn that is not coming.
 */
export const TEXT_CALL = {
  maxSteps: 12,
  model: "text",
  autoTurns: 10,
  chunkMs: 120_000,
};

/**
 * How long a shell command that was stopped — its timeout, or its job stopping —
 * gets to exit on SIGTERM before its whole process group is killed (lib/sandbox).
 * A command that ignores the first signal would otherwise hold its step, and
 * everything waiting on the job, for good.
 */
export const EXEC_KILL_GRACE_MS = 5_000;

/**
 * Name of the built-in "server" holding media tools (image, TTS, STT, video),
 * exposed to bots like an MCP server (features/ai/tools/connected). Shared so
 * connectors can refuse registering a real server under this name.
 */
export const STUDIO_SERVER = "studio";

/**
 * How long one connected tool — an MCP server's, or the studio's — may take before
 * it is given up on and the model told so (features/ai/tools/connected). Nothing else
 * bounds it: the MCP client waits forever by default. A video model is the slow end
 * of what is honest.
 */
export const CONNECTED_TOOL_TIMEOUT_MS = 10 * 60_000;

/**
 * How many tool definitions one `tool_search` returns (features/ai/tools/mcp.tool); a bot is
 * told the number in the tool's schema, and the answer names the rest to be asked for again. A
 * schema is large and rides in the run from then on: more loads a server's tools in fewer steps
 * and costs every later step more; fewer takes more steps to reach the same tools.
 */
export const TOOL_SEARCH_SCHEMAS = 8;

/**
 * How long a connected MCP server's session stays open with nothing using it
 * (features/connectors/mcp.manager); each tool call starts the wait again. Past it the session
 * closes, and the next call connects again first. Longer keeps a server's process or connection
 * up through longer quiet; shorter makes a bot wait on that connect more often.
 */
export const MCP_IDLE_MS = 30 * 60_000;

/**
 * How many files of one job's own folder are read when its files are listed
 * (features/workspace filesOnDisk, what bot.run names as the job's files). A folder of
 * generated files past it is not a list anyone reads; raising it lists more of one and
 * reads more of the disk each time.
 */
export const JOB_FOLDER_WALK = 500;

/**
 * How long what jobs leave behind stays before the app clears it by itself
 * (bot.runner sweepJobFiles). Deleting a job clears its folder at once.
 * - `forMs`  one age for all of it: a job's scratch folder, counted from when
 *            the job ended (a job running or waiting keeps its folder however
 *            old), a scratch folder no job owns, spilled tool output, and the
 *            browser's snapshots and logs. Long enough to return to a job
 *            days later; what is worth keeping goes in `artifacts/`, which is
 *            never cleared.
 * - `sweepEveryMs`  how often the app looks, besides once at boot.
 */
export const WORKSPACE_KEEP = {
  forMs: 3 * 24 * 60 * 60 * 1000,
  sweepEveryMs: 60 * 60 * 1000,
};

/**
 * When a job's browsers nobody can see are closed (workspace closeIdleBrowser). Each holds
 * hundreds of megabytes while it is up; a window put on their screen stays whatever this says.
 * A job that finishes closes them at once.
 * - `closeAfterMs`  how long a job that waits — a question unanswered, a stop on Continue —
 *   keeps them without a step. Shorter frees the memory sooner; a job picked up after it
 *   opens its page again and walks back to where it was, model steps and all, so it is
 *   long enough to answer a question after a break. Only a waiting job is held to it.
 * - `checkEveryMs`  how often the app looks, besides once at boot, so one closes up to this
 *   much after `closeAfterMs`. Each look is one `playwright-cli list`.
 */
export const BROWSER_IDLE = {
  closeAfterMs: 60 * 60 * 1000,
  checkEveryMs: 5 * 60 * 1000,
};

/**
 * How long what the app kept of its own use stays before it clears it by itself
 * (instrumentation): an ended call with its turns, a job that finished with its
 * messages, and a bot's lesson with the text it held to put a change back (the
 * change itself stays on disk). Nothing else grows without an end — every other
 * table is a standing list the user edits — and calls and jobs are the ones a daily
 * driver writes most: a ten-minute call is about 150 rows, a thirty-step job about 60
 * wider ones.
 * - `forMs`  counted from when the call ended or the job did. A job still running
 *            or waiting on the user is never touched however old, and a job's
 *            finished work is not in these rows: it is in `artifacts/`, which
 *            nothing clears. Long enough that she can still be asked about a
 *            season's worth of what was said.
 * - `sweepEveryMs`  how often the app looks, besides once at boot. Far shorter
 *            than `forMs`, so the exact moment never matters.
 */
export const HISTORY_KEEP = {
  forMs: 90 * 24 * 60 * 60 * 1000,
  sweepEveryMs: 6 * 60 * 60 * 1000,
};

/**
 * Where the user is and the weather there, read into both call prompts (features/thursday/
 * where): the browser's position, when they allowed it, named and forecast by the browser. It
 * is looked up while the page is in front, before any call; a call reads what is kept and
 * never waits on it, and one placed before it is found goes without.
 * - `lookMs`  how long the two services are given to answer a lookup. Longer leaves a page on
 *   a slow link waiting as long before it says one did not answer; shorter gives up on a
 *   service that would have answered, and calls go without until the next lookup.
 * - `keptMs`  how long what was found is read before it is looked up again, which a page in
 *   front does as it runs out (where `keepWhere`). Longer asks the device and the services
 *   less often and may name a place they have left.
 * - `waitMs`  how long the day's first call waits on the globe's map, which the app serves
 *   itself, before it opens without the globe. Longer can delay that call; shorter opens
 *   more of them without it.
 * - `holdMs`  how long the globe (features/thursday/components/here-globe), shown as the
 *   day's first call opens, stays once their country, sky and weather are all in (about 5.7 s
 *   after it starts) before she comes back. Longer leaves them up longer, and her face and the
 *   words beside it off the screen as long.
 * - `globeFps`  frames a second the globe draws. It draws two or three times her cells, so
 *   more costs a slow machine its smoothness everywhere else on the screen.
 * - `windyKmh`, `stormKmh`  gusts past which the globe draws wind blowing across it, and a
 *   storm turning over it as well. Lower draws them on more ordinary days.
 * - `coastDeg`  how far off a coast a position still counts as in the country there, when the
 *   place service named none the map has (features/thursday/here-map). Farther reaches a
 *   neighbour across a strait; nearer leaves a town on a coast this simple out at sea.
 */
export const HERE = {
  lookMs: 3_000,
  keptMs: 30 * 60_000,
  waitMs: 3_000,
  holdMs: 2_550,
  globeFps: 24,
  windyKmh: 50,
  stormKmh: 90,
  coastDeg: 1.2,
};

/**
 * How much of the previous call the prompt carries verbatim: `rows` turns are
 * fetched, then filled newest-first until `tokens` is spent.
 */
export const RECENT_CALL = { rows: 20, tokens: 600 };

/**
 * How long the event stream may have no browser on it before the app treats
 * the browser as closed (app/api/events presence): the calls its tabs held close, and
 * what finishes from then on goes to a desktop notice or a phone. Work itself runs on.
 * Long enough to cover a reload or a route change.
 */
export const BROWSER_GONE_MS = 10_000;

/**
 * How often one kind of signal goes down the event stream (app/api/events): the first at once,
 * then at most one per this long, ending on the latest; data events are not held. A bot at work
 * raises one per row it writes, several in the same millisecond at the end of a step, and each
 * one the browser gets is a read of what it names — measured, twenty `threads` signals 50ms
 * apart go out as eight. Shorter reads the inbox more often while bots work; longer leaves the
 * screen further behind them.
 */
export const SIGNAL_PACE_MS = 150;

/**
 * Size of one assembled prompt (tokens) past which the log names the chapter
 * carrying it. Not a cap — every chapter is there because something needs it —
 * but growth is in the listings (memory, skills, connected tools, bots), which
 * belong to the user, so nothing else would ever notice. Roughly twice a
 * well-used install.
 */
export const PROMPT_BUDGET = 6_000;

/**
 * What counts as too much memory to hold in one piece (features/memory), counted
 * in facts. Nothing is deleted on its own: past either of the first two the call's backend is
 * told to say so once in what it returns and settle it with the user (thursday.prompt memory).
 * Facts rather than tokens because it is the number the user sees on their own screen and the
 * number a model is told after every write — a token estimate is nobody's unit and
 * cannot be acted on. Profile and preferences are written out whole in every call's prompt,
 * so `factsPerNote` is also what bounds those two chapters.
 * - `facts`  facts held across every note, above which the listing is too long.
 * - `factsPerNote`  facts in one note, above which that note is named instead.
 * - `descriptionChars`  the longest line a note is listed by, on screen and in a
 *            prompt alike; a longer one is refused. A line is what a note is about,
 *            and past this length it has become a list of what is inside — which
 *            the facts already are.
 */
export const MEMORY_LIMITS = {
  facts: 400,
  factsPerNote: 50,
  descriptionChars: 100,
};

/**
 * An edit typed on the Memory screen (features/memory/memory.edit): one streamed run with
 * memory's tools, where only what the tools wrote lasts.
 * - `maxSteps`  how many model steps one edit may take; a run still writing past it is not
 *   converging, and it stops there with what it already wrote kept. More lets one request
 *   rework more notes; fewer cuts a long one short.
 */
export const MEMORY_EDIT = { maxSteps: 20 };

/**
 * The pass after a spoken call (features/memory/call-memory): once the call ends, a text model
 * reads what was said and keeps what the user told about themselves that the voice did not hand
 * over. It runs on the server, once per call, whichever way the call ended.
 * - `steps`  model steps one pass may take: a note opened or two, then one write per note. A
 *            pass still writing past it is not converging, and stops with what it wrote kept.
 *            Fewer cuts a call full of news short; more lets a pass that lost its way write more.
 * - `turns`  the most of one call it reads, its last turns. A call longer than this is read from
 *            where these begin; more reads longer calls whole, each turn input on every step.
 * - `stepMs`  how long one step may take before the pass is stopped and logged. Passes run one
 *            at a time, so one that hangs holds every call after it; shorter cuts off a slow
 *            model that would have finished.
 * - `catchUpMs`  how far back a start looks for spoken calls that ended with no pass — the server
 *            stopped first, or the call was still open and is swept shut at boot. Longer reads
 *            older calls at the next start, a model run each; shorter leaves more of them unread
 *            for good.
 */
export const CALL_MEMORY = {
  steps: 8,
  turns: 300,
  stepMs: 120_000,
  catchUpMs: 24 * 60 * 60 * 1000,
};

/**
 * One picture handed to a model: a look at an image (features/ai/tools/look.tool), and one
 * an image call works from (features/ai/tools/studio.tool).
 * - `maxBytes`  the largest file handed to a model as a picture. It rides in the request as
 *   base64, a third larger, on every step of the run that looked; providers refuse a request
 *   past a few tens of megabytes, and a screenshot is a few hundred kilobytes. Over this the
 *   tool says so and how to make a smaller copy, rather than sending it.
 * - `perRequest`  the most picture a conversation in writing (a page's, a phone's) sends in
 *   one request, in file bytes, a third more as base64. Every request carries its pictures
 *   again, newest first, up to this; an older one past it goes as its path, for her to look
 *   at again. Providers refuse the whole request past their size: Gemini 20 MB with pictures
 *   inline, Anthropic 32 MB. Larger keeps more pictures in view and nears those.
 */
export const LOOK = { maxBytes: 4 * 1024 * 1024, perRequest: 12 * 1024 * 1024 };

/**
 * A picture put down on a spoken call, a file or a drawing (features/thursday/picture.ts).
 * - `longestSide`  the longest side, in pixels, it is sent at. Larger keeps small text in a
 *   screenshot readable, and has the picture shrink further to fit the connection's one
 *   message; smaller loses that text first.
 * - `qualities` then `scales`  what a picture too large for that message steps down through:
 *   at each size the JPEG qualities in turn, then the next size, until it fits. The scales are
 *   fractions of the size the picture starts at, its own or `longestSide` on its longest side
 *   when it is larger, largest first, so a small picture steps down as a large one does. Lower
 *   values fit a picture with much detail, and blur the text on it the model has to read;
 *   higher values, or fewer steps, leave more pictures that do not fit, and the backend is told
 *   so in words instead of shown one. Every size and quality tried is one more JPEG encode on
 *   the page, and a picture that fits early never reaches the later ones.
 */
export const CALL_PICTURE = {
  longestSide: 1600,
  qualities: [0.8, 0.6, 0.45],
  scales: [1, 0.75, 0.5, 0.35],
};

/**
 * The drawing pad (features/thursday/components/draw-pad), whose drawing is handed over as a
 * picture.
 * - `longestSide`  the longest side, in pixels, a drawing is kept at, cropped to what was drawn.
 *   Larger keeps thin strokes and writing readable to the model that looks at it, in a heavier
 *   file; it is never kept larger than it was drawn.
 */
export const DRAW_PAD = { longestSide: 1024 };

/**
 * One web search (features/ai/tools/search.tool), Exa or a model's own.
 * - `sources`  hits carried back. Each is a page's worth of tokens in the run from then on,
 *            and the first few answer most questions; a bot that needs more searches again.
 * - `excerptChars`  how much of one page rides back with it; a bot that wants
 *            the whole page fetches it.
 * - `timeoutMs`  one deadline for both ways in. Nobody is watching a search, so
 *            a request that never answers would hold the step until the job's
 *            own timeout; a line saying so is worth more than the wait.
 */
export const SEARCH = { sources: 3, excerptChars: 1_200, timeoutMs: 30_000 };

/**
 * A site's icon — beside a page a web search read, beside a connector — (lib/favicon): this server asks the
 * site for it, so neither the browser nor a third party learns which pages came up.
 * - `timeoutMs`  one site's wait; past it the chip draws the site's first letter.
 * - `maxBytes`  larger is not an icon; it is refused and the letter drawn instead.
 * - `kept`  sites whose answer — an icon, or none — is remembered for the life of the server;
 *   the oldest go first. More asks fewer sites twice at the cost of memory.
 * - `againMs`  how long a site that could not be asked (no network, a VPN's certificate) is
 *   left before it is asked again. Shorter brings icons back sooner once the network does;
 *   longer asks a site that never answers less often.
 * - `pageBytes`  how much of a front page is read for the icon it names, when the site
 *   has no `/favicon.ico`. The head is at the top; more reads pages that bury it.
 */
export const FAVICON = {
  timeoutMs: 4_000,
  maxBytes: 300_000,
  kept: 500,
  againMs: 60_000,
  pageBytes: 65_536,
};

/**
 * A pasted key or token shorter than this many characters is not taken: every field that
 * saves one keeps its save off below it, the voice-key fields do not save it on leaving,
 * and the save itself refuses it (config.action). It keeps a stray keystroke or a half
 * paste from being stored as a key; raising it also refuses a real key or token shorter
 * than it.
 */
export const KEY_MIN = 8;

/**
 * At or under this many dollars left on the gateway's or OpenRouter's key, its row in
 * Settings › Models & keys turns amber (ai/model readKeyCredits): a video clip or a long job
 * can spend that before it finishes. Raising it warns sooner; 0 warns only once nothing is left.
 */
export const KEY_LOW_CREDIT = 1;

/**
 * How long a catalog provider's model list is believed once read (ai/model readCatalog), one
 * copy per provider for the whole app: the model field's shelf, and a catalog model's context
 * window and effort steps when a run starts. A model list does not change inside a call.
 * Longer shows a model the provider added, or drops one it retired, that much later; shorter
 * asks it again more often.
 */
export const CATALOG_MS = 10 * 60_000;

/**
 * Signing in to ChatGPT (features/ai/chatgpt), whose plan runs bots in place of an API key.
 * - `waitMs`  how long the app listens for the sign-in page's answer. Past it the port is
 *            let go and signing in starts over from Config; shorter frees it sooner when
 *            a page is abandoned, too short cuts off someone still typing a password.
 * - `renewBeforeMs`  how long before the access token runs out it is renewed. Too close
 *            to the edge and a request leaves with a token that dies on the way.
 */
export const CHATGPT_SIGN_IN = {
  waitMs: 10 * 60_000,
  renewBeforeMs: 5 * 60_000,
};

/**
 * At or past this share of a GPT Subscription window used, its row in Settings › Models & keys turns
 * amber (ai/chatgpt readChatGptUsage): a long job can spend the rest before it finishes and
 * then waits for the window to reset. Lower warns sooner; 100 warns only once it is spent.
 */
export const CHATGPT_USAGE_HIGH = 80;

/**
 * How many of a skill's files `load_skill` lists beside its instructions. The list is
 * what tells a bot which references and scripts are there to open, and it is paid for
 * on every load: each is the full path it is opened by, some twenty tokens. Shallowest
 * first, so what is cut is what
 * sits deep in a bundled engine or a component kit, and the tool says how many were.
 */
export const SKILL_FILES_LISTED = 50;

/**
 * How many bots or skills may pile up before the screen says what they cost.
 * Every one of either is a line in every prompt assembled afterwards — measured,
 * a skill runs about 43 tokens in a bot's prompt and a roster entry about 48 —
 * so a long list is paid for on every call and every job, and a model picking
 * from it has more to read past. Not a cap: the screen states the cost and the
 * user decides.
 */
export const PROMPT_CROWDED = { bots: 10, skills: 20 };

/**
 * Max chars for one listing line a model reads, in a prompt or in a tool's answer. Longer is
 * paid for wherever the line is carried; shorter leaves more of it to be asked for whole.
 */
export const PROMPT_LINE = {
  /** First sentence of a skill description; bots get the full text. */
  skill: 90,
  /** Tool-call arguments; file contents or prompts may arrive as arguments. */
  toolArgs: 30,
  /** A past job's answer in the transcript; the rest is asked for with `thread`. */
  jobOutcome: 160,
  /** The first line a file in a bot's own memory is listed by (config BOT_MEMORY_LIMITS). */
  botMemory: 100,
  /** A thread's question or ending in `thread_status`'s list of them all; one named alone comes back whole. */
  threadStatus: 200,
  /** What a routine asks for, as the `routine` tool returns one. */
  routineRequest: 300,
  /** How a routine's last run ended, as the `routine` tool returns one; the run's thread holds the rest. */
  routineOutcome: 200,
  /** The first line of each hand-off still out, in the coordinator's list of them; the full words are in its transcript. */
  boardAsk: 100,
};

/**
 * Thursday's face, the one everybody sees: nothing in the app changes it. She is drawn in Apple's
 * emoji on Apple devices and in letters elsewhere (features/thursday/face-glyphs.ts).
 * - `fontSize`  glyph size in px. Smaller glyphs pack more cells into the same
 *            orb: a finer grain, and more to draw on every frame.
 * - `density`  cells per glyph pitch. Above 1 packs them tighter; below leaves
 *            air between them.
 * - `fps`    the most times a second she is drawn. Every frame costs the same,
 *            so her share of the page's time moves with it; uncapped, a 120 Hz
 *            display draws her twice as often as a 60 Hz one. Her motion runs on
 *            time, not frames, so a lower cap draws the same motion less often.
 */
export const ASCII_FACE = {
  fontSize: 8,
  density: 1.4,
  fps: 30,
} as const;
