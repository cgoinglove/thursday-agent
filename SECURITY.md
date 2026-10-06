# Security

## What this app is

Thursday runs on your machine and gives a language model a shell, a browser and
your API keys. That is the product, not an accident: a bot that can install a
package, sign into a site and write a file is a bot that can do those things
wrong. Treat it the way you would treat a new assistant with your laptop
password — useful, and worth watching at first.

What the app does to keep that narrow:

- **Your keys stay on your machine.** They live in the local SQLite database (or
  the environment), are read only where a model is built, and are passed to a
  provider explicitly. Nothing is sent anywhere else.
- **Saved keys are sealed.** In the database, the API keys, the phone's bot
  tokens, the ChatGPT sign-in and a connector's headers, env and OAuth tokens are
  sealed with AES-256-GCM (`lib/secret.ts`), under a key the app makes on its
  first start and keeps in the data folder's `.env` as `THURSDAY_ENCRYPTION_KEY`,
  owner-only. Keys an older version kept in the clear are sealed on the first
  start of this one, and the file is then rewritten, so none is left in the pages
  their old values freed. A copy of `local.db` on its own — a backup, a synced
  folder, a file attached to an issue — carries none of them. The key sits beside
  it, so this does not keep them from anything that runs as you, a bot's shell
  included; nor from an older copy of `local.db`, made before the upgrade.
- **Secrets are not in the shell's environment.** Every environment variable
  matching `KEY|TOKEN|SECRET|PASS|_PWD|CREDENTIAL|_AUTH|_DSN|DATABASE_URL` is stripped from the
  environment a bot's commands run in (`lib/sandbox.ts`), so a compromised npm
  package in a bot's project cannot read them out of `process.env`. This is
  narrower than it sounds and is meant to be: the database those keys live in,
  and the `.env` with the key they are sealed with, are files on the same
  machine, and a bot has a shell. Reads are not fenced — a bot that cannot look
  around cannot do the work.
- **What a shell prints hides the secrets the app keeps.** The key in the data
  folder's `.env`, every key, token and sign-in saved in Settings, a connector's
  credentials, and every environment variable named like a secret are replaced
  by `[hidden: a secret Thursday keeps]` in what any command prints, before a
  model, a thread or the file a long output spills to sees it (`lib/sandbox.ts`,
  `heldSecrets` in `features/workspace/workspace.ts`). That keeps them out of
  what goes to a model provider and what the app stores; it does not keep them
  from a bot. A command can still use one without printing it — send the `.env`
  somewhere, or print a key encoded or in pieces — and values under twelve
  characters (`HIDDEN_SECRET_MIN`), a connector's value that names a path on
  this machine, the cookies of a kept sign-in and anything else on disk the app
  did not put there are shown as they are.
- **What a bot keeps for itself is shown, and can be put back.** A bot's own
  memory and skills are read into every later job of it, so a page that talked
  a bot into keeping an instruction would carry it on. Every change a bot's
  command makes to them — a note, a skill it wrote or installed — is read from
  the disk and shown at the end of the job and on the bot's page, where Undo puts
  it back (`features/bot/bot.lesson.ts`). That shows such a change; it does not
  stop one, nor a change made through anything but the bot's own tools.
- **The file tool is fenced; the shell is not.** `write_file` refuses the app's
  own directory and the workspace root, and inside the workspace accepts only its
  folders (`features/workspace/workspace.ts`). A path outside the workspace is
  accepted. `bash` has no such check: a command writes wherever your user can.
- **The server binds to localhost.** `npx thursday-agent` listens on `127.0.0.1`.
  Do not put it on `0.0.0.0` and expect it to hold: there is no authentication,
  because there is no second user.
- **A sign-in is asked for, and a payment is yours to press.** A bot signs in
  with a sign-in the app keeps, the Chrome you already use, or a window where you
  sign in yourself. A purchase is taken to the last screen and left open on
  yours. It never guesses a secret or goes looking for one
  (`skills/browser/SKILL.md`). These are instructions in a skill, not code: the
  app cannot stop a model that ignores them.
- **A kept sign-in is lent, not handed around.** The app keeps a site's session,
  never a password: one file per account of a site in `.sign-ins/` under the
  data folder, outside the bots' workspace, each with its own list. The
  `sign_in_use` tool lends one only to the bots on its list — the one that kept
  it, and those you let in under Settings › Sign-ins or when one asks. Only those
  bots can replace it (`sign_in_keep` refuses any other and puts it on the asking
  list), and what a browser holds after a bot's turn refreshes only a sign-in the
  app lent that same browser, for a bot still on the list. Signing out of an
  account removes its file
  (`features/signins/signins.query.ts`). These checks are on the tools, not the
  file: a bot's shell runs as you and can read it. A kept session signs every
  later job of those bots in as you. It is the browser's whole session, not
  one site's cookies: a sign-in made through another site — "Sign in with
  Google" — carries that site's session as well, so a bot lent it can reach
  both.
- **Your own Chrome is lent whole.** A bot can attach to the Chrome you use —
  a tab of its own through the Playwright extension, or the browser you left
  open (`playwright-cli attach`, `skills/browser/SKILL.md`) — and it then acts
  in every site that Chrome is signed into, not only the one the job named.
  Nothing in the app or the skill asks you before it attaches; without the
  extension installed, the tab of its own is not there to take.
- **From a phone, one person, let in at the computer.** Settings › Phone
  connects the app out to Telegram, Discord, Slack or a mailbox of hers;
  nothing on the computer is opened to the internet. Each chat app lets in one
  person, and only once someone at the computer presses Allow on the code that
  person's phone was sent (`features/reach/reach.ts`). What that cannot cover: whoever holds that
  chat account can start work on this computer, shell and all — a stolen
  account is that too. Messages and the files sent with them pass through the
  chat service, and its bot tokens are kept in the local database with your
  keys. By email, the one person is an address named at the computer, and a
  mail reaches her only when its sender's domain signs it and passes DMARC,
  it is written to her address and it is under 48 hours old
  (`features/reach/email.ts`); whoever controls that mail account, or that
  domain's signing key, is that person. Her mailbox's app password is kept
  sealed with your keys. A bot can read her mailbox too (`check_mail`,
  `features/ai/tools/mail.tool.ts`): only mail from the one site it names (a
  registered domain or one address, never a public suffix), from the last 30
  minutes, whose domain vouches for it, and never the named address's own mail
  to her. What that mail says
  is read by a bot that has a shell: the tool says it is the sender's words,
  not the user's, and that is an instruction, not a lock.
- **Work goes on with nobody watching.** A job keeps running after its tab
  closes, a routine starts at its time with nothing open, and `npx
  thursday-agent start` (macOS) keeps the server running in the background and
  starts it at login. Such a job has the same shell,
  browser and sign-ins as one you watch; what it asks waits for an answer, and
  what it finishes is told by the computer's notification and, with a phone
  connected, there. A routine's watch is a shell command its own bot wrote and
  the app runs at each of the routine's times with no model and nobody looking
  (`features/routine/routine.watch.ts`); it is set only from that bot's tool,
  in that routine's run, and shows in that run's thread.
- **It asks npm which version is newest, and installs nothing unasked.** When a
  browser opens the app, at most once a day, the server asks
  `registry.npmjs.org` for this package's newest version: the one request it
  makes that nobody asked for by name, and it carries nothing of yours. A newer
  version is only said. It is installed when you press **Update** (the copy in
  the background then runs `npx thursday-agent@<version> start`) or run that
  line yourself.

What it does not do: sandbox the shell, sign what a bot downloads, or review the
skills and servers you add. A skill is code you chose to trust, and so is a
connected MCP server: a skill's scripts run in a bot's shell, and a server gets
whatever a bot sends its tools. Nor does it tell the accounts on this computer
apart: it listens on `127.0.0.1` without a login, so anyone else signed in to
the same machine can reach it.

## Reporting a vulnerability

Report privately through GitHub's [Security
Advisories](https://github.com/cgoinglove/thursday-agent/security/advisories/new) — not a
public issue. Include what you did, what happened, and what you expected.

Expect a first reply within a week. If a fix is warranted, it ships in a patch
release and the advisory is published with credit unless you would rather not
be named.

## Supported versions

The latest published version. This is a 0.x app that moves quickly; there are no
backports.
