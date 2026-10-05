# The call

## Starting one

Three ways in, and any of them also answers a call she placed:

- Tap her face.
- Say the wake phrase, "hey thursday" unless they changed it. It comes on with the microphone on
  the first run's microphone step, and is otherwise off until switched on. It keeps
  the microphone open while the tab is, uses the browser's own speech recognition (Chrome sends
  what it hears to Google), and listens in English only.
- Press the shortcut, Alt + Shift + T (⌥⇧T on a Mac) unless they changed it. It is off to begin
  with too, and works only while the app's tab is in front and nothing is being typed.

Both are switched on, off or changed in **Settings › Thursday › Starting a call**.

She speaks first, with a short greeting, in the language the user speaks, and switches when they
do. Until she starts speaking — three seconds at most — she does not hear the room, so words said
in that moment are lost; on the GPT Subscription she hears it from the start. Every call starts fresh, but she remembers the last part of her recent
calls and picks a subject up when the user does. Anything older is gone unless she kept it in
memory (`memory.md`). A call she places herself opens on why she called.

The first call started from the page — spoken or in writing — has the browser ask to know the
user's location. Allowed, she knows which town they are in and the weather there: the page asks
BigDataCloud for the town's name and Open-Meteo for the weather, and only those two reach her.
Once it is allowed, the page looks them up while it is in front — as it opens, as it comes back
into view, and every half hour after — whether or not a call follows, so the position goes to
those two services then. A call never waits on it: one placed before it is found, the call
that first asked included, goes on without it, and the next has it. What was found more than
half an hour ago still gives her the town, and not the weather. Refused, nothing is sent.
The browser keeps the answer; it is changed in the browser's site settings for this app (the
icon left of the address). A phone chat has no browser, so she does not know it there.

Once a day, with the location allowed, the first spoken call placed from this browser opens
with her turning into a globe: it spins to where they are, dives until their country fills the
screen, and shows the sky over it as it is there now — the sun or the moon where it really is,
and the weather, lightly — while she greets them with that weather. At night the country is
dark. After about eight seconds she is back; tapping the globe brings her back sooner and does
not hang up, and opening a job's office over her ends it. It waits for the next call on a call she placed herself and on the very first
call, and does not play when the system is set to reduce motion or the app's page is not the
one in front. The day counts only once it has played, in this browser only. The map is drawn
in the browser, so the position still goes nowhere.

## What she does on the line, and what goes to a bot

She answers from what she knows about them, searches the web, runs a single command on their
computer, and holds the conversation. Anything that takes longer — a browser, a file to make,
several steps — goes to a bot while the call carries on. What the work still needs, she asks first,
so the bot starts with all of it; work they did not ask her to hand over she proposes — which bot,
and what it would do — and starts once they agree. She says who took it.

While she is working, the line under her face says so. The microphone stays open: anything said
meanwhile is heard and answered once she is done, so there is no need to repeat it.

**Draw**, on that line during a spoken call, opens a pad over the call: pick a colour, draw, and
**Show her** gives her the drawing the moment it is pressed. She looks at it and says what she makes
of it, and you can go on from there — "what do you think of this logo?" It goes to her alone, not
onto the write line.
**Esc** closes the pad and keeps what is on it for next time; **Clear** wipes it. **Undo** and
**Redo** beside it (⌘Z and ⇧⌘Z, or Ctrl+Z and Ctrl+Shift+Z) take back or bring back one stroke at a
time, a Clear too.

## Ending it

Saying goodbye usually ends the call, but not always. Tapping her face ends it for certain, and so
does the shortcut. When nothing is said and she is neither talking nor working for 25 seconds, the
call ends by itself; the last 10 seconds count down on screen. On an OpenAI key a spoken call is
billed by the minute while it is open, silence included; on the GPT Subscription it uses the plan.
Work already handed to a bot carries on.

## Writing to her instead

The **@** at the left end of the pill in the bottom right corner — or the `@` key — opens a line at
the foot of the screen with the list of who to write to up, her first: **Enter** takes her, a name
typed after the `@` narrows the list, and **Esc** puts it away. Sending her a message there starts
a call in writing: her answers show beside her face, and the line stays open for writing back. She
has the same memory, tools and bots as on a spoken call, with no voice and no per-minute billing.

- **Her answers** keep their shape (lists, tables), and what she names is a link: a file opens over
  the call, a web page in a new tab.
- **Files**: the paperclip's **A file from this computer**, a paste, or a drop anywhere on the
  window — at most 8 at a time, 25 MB each. A picture (png, jpg, webp, gif) goes to her with the
  words, so "what does this say?" is answered on the spot. One over 4 MB, or one sent while she
  runs on a model that cannot see pictures, does not go with them, and she says so. Later
  messages carry the call's pictures again, the newest up to 12 MB in all; an older one she
  looks at again by its name.
- **A drawing**: the paperclip's **Draw something** opens a pad over the screen. **Add to the
  message** puts it on the line as a picture, sent with the words like any other.
- **Who it goes to**: the list it opens on, the chip at the left of the line, or `@` and a name at
  the start (**Tab** or **Enter** takes the highlighted one). A bot picked there gets that one
  message, then the line goes back to her; **Esc** with a bot picked also goes back to her.
- **What it runs on**: the GPT Subscription when one is signed in, else the OpenAI key. The small
  **runs on** button under the line shows which, and can pick another model, from any provider with
  a key, for writing only. With nothing to run on it says so; keys are in **Settings › API keys**.
- **When the GPT Subscription's limit is reached** and an OpenAI key is set, the turn is answered on
  the key, on the backend model from **Settings › Thursday**, and a notice says so once a call with
  when the plan resets. Every turn tries the plan first, so it goes back to the plan by itself once
  the plan resets. Turns on the key are billed to it. With no key, the turn fails as below.
- **When a turn fails** — a refused key, a plan's limit with no key to go on, or no answer at all
  for two minutes — her face says ERROR
  and the provider's reason shows in red under the line, with **Send it again**. When the provider
  turned down the key or sign-in itself, the line says so in a sentence with the provider's own
  words small under it, and **Open Settings** opens **Settings › API keys**, where the GPT
  Subscription and every key are; send it again once one works. When an OpenAI key is set and was
  not the problem, the button reads **Send it again on your OpenAI key**.
- **Ending it**: **Esc** ends it (saying goodbye does not), and so does starting a spoken call.
  Opening a thread in the corner does not: the corner says *Thursday is still on the line*, with
  **Back to her** to return.

It is kept with the other calls, marked *in writing*.

During a spoken call the line writes to bots only. A file put down then is one she is told about —
its chip says *she knows it is here* — and what to do with it can simply be said. A picture goes to
the model behind her as it lands, as a smaller copy that fits the call's connection, so she can say
what is in it; anything else she hands to a bot.

## Seeing the words

**Settings › Thursday › Captions** picks how the words show:

- **Both sides** (the default): hers on the left, theirs on the right. Clicking a line of hers reads
  it again.
- **Her last line**: one caption under her face, only what she said.

A narrow window always shows her last line.

What she is doing — a search, a hand-off to a bot, a command — shows as a short line. Pages she
read on the web show under her face, and each opens in a new tab.

## Her voice, face, style and models

These are in **Settings › Thursday › Models**, in two parts, **Voice** and **Backend**. Changes
apply from the next call.

- **runs on**: what a spoken call runs on, **GPT Subscription** (GPT-Live 1 Codex, on the plan,
  with the plan's name beside it) or **OpenAI key** (GPT-Live 1, billed by the minute). Both are
  always shown. One not set up reads **sign in** or **add**, and a Free plan reads **no calls**; picking it asks for the sign-in or the
  key right there, and calls stay on the other until it is in. Left alone, a call runs on the GPT
  Subscription. When neither is set, the card asks for one the way the first run does.
- **voice**: 22 voices; clicking a name plays it. Only the spoken call uses it. On the GPT
  Subscription she speaks in the plan's own nine voices instead, and none plays.
- **style**: Bright, Calm, Straight or Rough. It changes only how she talks, never what she can do.
  **Your own** adds their own words on top — how she talks, how much she says — and wins where the
  two differ. What she calls them is not set here: tell her on a call and she remembers it.
- Under **Backend**, **model** and **effort**: the model that thinks and uses tools behind the voice, and how
  hard it thinks (`setup.md`, Models).
- **tools**: **Search the web** is on unless switched off, so a question about today — the weather,
  a price, a score — is answered on the line. **Read skills herself** is off to begin with; on, she
  can open the same skills a bot reads, and each one she opens adds a page of reading to the call.
- **instructions**: how work should be handed over and what to check first.

Her face has no setting: on a Mac, iPhone or iPad she is drawn in Apple's emoji, elsewhere in
letters. At rest she is a face of smoke that now and then opens its eyes, and she sometimes spells
a short word, such as a goodbye when a call ends. When the computer is set to reduce motion, she
holds still between calls a few seconds after the screen opens, and bots' faces are drawn still;
on a call she moves with her voice as always.

Voice, style and the backend settings belong to the app, so they are the same in every browser and
from a phone. Captions and **Starting a call** belong to this browser.

## When work has something to say

During a call, a bot's question or result reaches her by itself — on a spoken call in a quiet
moment — and she tells the user. Work that finished before the call opened is not read out; it is
on screen, and she looks it up when asked.

With no call open, a finished job lands as a card in the bottom left corner, plus a browser
notification when the app is not the window in front. With no app tab open, the computer's own
notification says it instead (on a Mac, clicking it opens Script Editor, not the app).

**Settings › Thursday › Starting a call › She calls you** makes the screen ring instead:

- **When a job needs me** (the default) rings when a bot asks something.
- **Whenever a job ends** rings for every ending too.
- **Never** leaves it to the notification.

It needs this tab open. While it rings, her face says CALL until it is answered, declined or rung
out, and the screen shows whose work it is and what it asks, with
the bot's suggested answers — picking one replies without a call. **Answer**, tapping her face or
the wake phrase picks up; **Esc** is "not now". A missed ring stays on screen with **Call back**
until called back or cleared with Esc. She cannot switch this on herself: when asked to call back,
say where it is.

Nothing rings while a thread is open in the corner: what that thread asks is answered there, and
what another job asked or finished meanwhile rings once the thread is closed.

## History

**Settings › Thursday › History** has two tiles. **Call history** lists every kept call, each with
the jobs it started and where they stand; one call can be deleted, or all with **Delete all**.
Calls are kept for three months, then removed by themselves. **Reset history** deletes every call,
every job and everything she remembers, for good; keys, bots and connectors stay, and so does what
each bot keeps for itself.
