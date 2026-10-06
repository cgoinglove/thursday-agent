# From a phone

Thursday can be written to from a phone through Telegram, Discord or Slack, or by email to a
mailbox of her own, while the app runs on the computer. Nothing on the computer is opened to the
internet. Telegram is the quickest to set up. More than one can be on: work started from one comes
back to it, and anything else goes to the one they last wrote from.

**Settings › Phone** lists the three chat apps and Email, one line each. A folded line says where it
stands: *Not set*, *1 of 2 tokens in*, *Connecting…*, *Listening as … — waiting for your first
message*, *Listening as … . … is let in.*, *Reconnecting…*, or in red *Stopped — … turned the token
away* or *Stopped — the saved token can't be unlocked any more*. Email's line says *Listening as … —
name your own address*, *Listening as … . … can write.*, *Listening as … — a mail is held: …*, or
in red *Stopped — the mail service turned her mailbox's sign-in away*.
Opening a line shows its four steps, each ticked as it is done. Tokens are pasted in the steps that
ask for them.

## Setting it up: Telegram

1. In Telegram, write to **@BotFather** (**Open @BotFather** goes there), send `/newbot` and pick a
   name. It answers with a token.
2. Paste the token in step 2 and press **Save**.
3. Step 3 shows a square code picture of the bot's address. Point the phone's camera at it to open
   the chat, and write anything. The bot answers with a four-digit code.
4. On the computer a question appears: **Let … reach Thursday from a phone?**, with a code. Press
   **Allow** only if it is the code on the phone. From then on, what is written there reaches her,
   and she answers what was written while it waited.

## Setting it up: Discord

1. At discord.com/developers (**Open discord.com/developers**), make a **New Application**. So nobody
   else can add the bot to a server, set **Install Link** to **None** on its **Installation** page
   first, then turn off **Public Bot** on its **Bot** page. There, press **Reset Token** and copy
   the token.
2. Paste it in step 2 and press **Save**.
3. Discord only delivers messages to a bot you share a server with. **Add the bot to a server**
   (or the square code picture) opens the invite; pick a server of your own. A private server made
   for this is fine.
4. Send the bot a direct message, not in the server: on a phone, tap the bot in the server's member
   list, then **Message**. Then press **Allow** on the computer, as with Telegram. Only direct
   messages are read.

## Setting it up: Slack

Slack takes an app of your own and two tokens.

1. At api.slack.com/apps, **Create New App › From a manifest**, pick the workspace, and paste the
   manifest (**Copy the manifest** in step 1 copies it):

   ```yaml
   display_information:
     name: Thursday
   features:
     app_home:
       messages_tab_enabled: true
       messages_tab_read_only_enabled: false
     bot_user:
       display_name: Thursday
   oauth_config:
     scopes:
       bot: [chat:write, im:history, im:read, users:read, files:read, files:write]
   settings:
     event_subscriptions:
       bot_events: [message.im]
     interactivity:
       is_enabled: true
     socket_mode_enabled: true
   ```
2. Under **Basic Information › App-Level Tokens**, generate one with **connections:write**. It
   starts with `xapp-`; paste it in step 2.
3. **Install App** to the workspace. The Bot User OAuth Token starts with `xoxb-`; paste it in
   step 3. It connects once both are in.
4. In Slack, open the app under **Apps** and write in its **Messages** tab. A question with a code
   appears on the computer: press **Allow** if Slack shows the same code.

## Setting it up: Email

Email takes a mailbox of her own, so your own inbox is never read. It works with a mail service
that gives app passwords — Gmail, iCloud, Fastmail and most others; Outlook.com and Microsoft 365 no
longer do, so they cannot be her mailbox.

1. Make a new account for her at such a service, turn on two-step sign-in there, and create an app
   password for Thursday. Step 1 links to how on Gmail, iCloud and Fastmail.
2. Type her address and the app password and press **Save**. The servers her mailbox is read and
   sent through are looked up from the address. Where its service does not publish them (a company
   domain, some services), the step asks for them: a **Reading server** (IMAP) and a **Sending
   server** (SMTP), each with its port, as the service's help pages give them. Port 993 and 465 use
   an encrypted connection from the start; any other port must offer one (STARTTLS), or nothing is
   sent. Once in, the step shows the address and servers, never the password; **Change** replaces
   them, and **Remove** stops Email (the mailbox itself is not touched).
3. Type your own address, the one you will write to her from, and press **Save**. Only mail from it
   reaches her. It cannot be her own address.
4. From that address, write anything to hers: **Write to …** opens your mail app, and **Copy her
   address** copies it. She answers in the same thread.

## Bots and her mailbox

Once she has a mailbox, a bot can give her address where a site asks for an email, while doing
what it was asked, and read the mail that site sends back: a code, or a link to confirm the
address. It reads only the newest mail from the site it names — one site's domain or address,
never a whole ending like .com — from the last 30 minutes, waiting up to two minutes for it by
default and five at most. After it has the site send another, it passes over the one it already
read. A mail in the site's name that its domain does not vouch for is not read, the same check as
your own mail gets. Your own mail to her is never among what a bot reads, and nothing in her
mailbox is marked or moved. A site
that stops a bot from signing up (a CAPTCHA, a phone number) stays stopped: the bot says so.

## Who is let in

One person per chat app. Whoever is let in can talk to her and, through her, start work on the
computer, so they are only ever let in on the computer's screen, by matching the code their phone
was sent. The question opens by itself, and a key pressed as it opens lands on **Not them**, which
turns them away. A few messages written while waiting are kept and answered once they are let in.
Anyone else who writes is told someone is already waiting, or that this Thursday already answers
someone else.

- **Change the token**, under the step that took it, offers **Replace** and **Remove**. A new token
  for the same bot keeps whoever is let in; a token for another bot starts over. **Remove** stops
  that chat app and lets the person go.
- **Let them go**, under the steps, lets the person go and keeps the bot.

Email lets in the address named in its step 3, and nobody writes first to be let in: anyone can
send mail to an address, and anyone can put another's address on a mail. So a mail reaches her
only when:

- it is from the named address, and that address's own mail service vouches it sent it — the mail
  carries its signature (DKIM) and passes the domain's DMARC check. Gmail, iCloud, Fastmail and most
  others sign their mail; a domain of your own needs DKIM and DMARC set up.
- it is written to her address, in To or Cc (not Bcc), and was written in the last 48 hours: an old
  mail of yours, still signed, could otherwise be sent to her again by anyone it once went to.
- it was not sent by a machine: an out-of-office reply is never answered, and her own mail is marked
  as automatic so yours does not answer it.

A mail from the named address that fails one of these is not read, and she writes back to that
address saying why. Mail from any other address is never answered: an answer would go to whoever it
claimed to be from. **Change** under step 3 names another address, and **Remove** there leaves
nobody who can write by email.

## What works from a phone

It is a call in writing, like writing to her on the computer (`calls.md`): the same memory, bots,
settings and models from **Settings › Thursday**, only no voice. It is kept with the other calls,
marked *in writing*. After about ten minutes with nothing written, and no work it started still
running, the conversation closes; the next message starts a new one, and she can read the last one
back.

- **Writing again while she works** joins what she is doing, so "no, the other one" changes course
  at once.
- **Pictures and files** sent to her are kept in the workspace's `inbox` folder. A picture reaches
  her as a picture with what was written with it, as in a call in writing; any other file she can
  hand to a bot. A voice message from Telegram or Discord is read as words by the transcription model
  picked in **Settings › Models**, which bills for it, and she answers in writing; with none picked
  the chat says so. On Slack a recording arrives as a file. Videos are not read. Telegram hands
  over files up to 20 MB, and the app takes up to 45 MB from any chat app; a file that does not come
  through is named in the chat.
- **Files she names in an answer** are sent with it, the newest three. What does not go — a fourth,
  or one too big (Telegram 50 MB, Discord 20 MB, any app 45 MB) — is listed under *Not sent — still
  on this computer*. Asking her to show what a bot made works the same way.
- **A page** — a report, a deck, a design — arrives as up to nine pictures of it, since no chat app
  opens one. A page made to be read — a document, a deck, a brief, a trip, a digest — comes with a
  PDF of the whole of it too, to keep or pass on; a design comes as its pictures alone. A page made
  before this update comes without its PDF until its bot makes it again. If the pictures cannot be
  drawn, the page file is sent instead.
- **A bot's question, or finished work**, arrives as the bot wrote it, under a line naming the bot
  and the thread, with its files. Work started from the phone always comes back to the phone.
  Anything else — a routine, work started on the computer — comes only while no browser has the app
  open; a bot's question left on screen goes to the phone once the last browser closes. Steps along
  the way are not sent. A bot's choices come as buttons that answer it directly; anything else
  written back goes to her.

By email it is the same, but for what a mail is:

- **Her answer and its files are one mail**, in the thread of what you wrote, the files attached.
  Files go while together they stay under 14 MB; the rest are listed under *Not sent — still on
  this computer*. If her mail service refuses the files, her answer still goes, without them, and
  says why.
- **A bot's choices** are listed under its question; reply with one, and she passes it on.
- **What you write** is read without the earlier mail quoted under it. A mail over 50 MB is not
  read, and she says so.

Work handed over from the phone keeps running whether or not the app is open in a browser, as long
as the app is running on the computer. A computer that is off or asleep does nothing until it is
back.

## When it does not answer

- **A token turned away** (wrong, revoked or reset, or on Slack a missing permission): the line says
  *Stopped — … turned the token away* in red, the step holding that token opens with what the
  service said, and **Phone** in the settings list and the **Settings** button carry a red dot.
  Nothing gets through until the token is replaced.
- **A token that can't be unlocked** (the `.env` in the data folder that unlocks the saved keys was
  lost or replaced): the line says *Stopped — the saved token can't be unlocked any more* in red,
  and the step holding it says the same. Whoever was let in stays. The old `.env` put back, and the
  app started again, opens it; otherwise paste the token again (`trouble.md`, A saved key is asked
  for again).
- **No network or the service is down**: the line says *Reconnecting…* with why, and it tries again
  by itself.
- **The computer is asleep or the app is not running**: on Telegram, messages wait and are answered
  when it is back; on Discord and Slack, what was written meanwhile is not seen. By email, mail
  waits in her mailbox and is answered when the app is back, if it was written in the last 48 hours.
- **Email's sign-in turned away** (a wrong app password, or one that stopped working when the
  account's own password changed): the line is red, step 2 opens with what the mail server said, and
  a new app password pasted there starts it again.
- **A mail you sent that she did not answer**: she writes back saying why (see Who is let in). No
  answer at all means it did not reach her mailbox, or it was not from the named address.
- **Your mail's sender cannot be checked yet** (your mail service's records did not answer — the
  computer's DNS is down, or that domain's is): Email's line says *Listening as … — a mail is held:
  …'s records did not answer*. The mail is not lost: it is checked again every half minute and
  answered once the check goes through. After an hour of that she writes back that its sender
  could not be checked, and what you wrote after it is read.
- **The GPT Subscription's limit**: with an OpenAI key set, she answers on the key, and the chat is
  told so once a conversation, with when the plan resets. With no key, the chat says the limit and
  that an OpenAI key in **Settings › API keys** would let her answer.
- **No key, or a refused one**, is said in the chat in the provider's own words (`trouble.md`).
