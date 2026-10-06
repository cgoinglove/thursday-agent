# Bots, threads and what they make

## Who the bots are

A bot is a text model with a name, one sentence about what it is for, and a face. That sentence is
how a job finds its bot. The roster is **Settings › Bots**. **New bot** makes one — it needs a name
and a description, and the name cannot be changed later; left without a model it runs on the app
default one. A bot's page holds what it **Runs on**, its **Effort**, when it **Compacts at**, its **Tools**, its own **Prompt**, its recent
threads and its own memory. A bot can be switched off without being deleted. Deleting one keeps what
it finished (**Settings › Files** still shows it under that bot's name), but its memory and the
skills it installed go with it. **Ready-made bots**, beside New bot, adds the ready-made ones; the
first run offers them too. There can be at most 14 bots, switched-off ones included; at 14 the
roster says "14 bots · 14 is the most" in place of New bot, and one has to be deleted first.

Across the top of a bot's page it stands alone at its desk, drawn as in the office: at work or
waiting on you while it is in a job, with its laptop shut while it is free. Under the desk is the
job it is in, or the last one it was in, and **Open** takes you to its thread; a bot that has had
no job yet reads "No job yet". The colours and shapes under it change its face, and the bot at
the desk wears the pick at once.

Rarely, a bot adds a line of its own after its description when its work has changed for good, and
says so in its answer. The description stays as the user wrote it. On the bot's page the line sits
under the description, and the × beside it clears it; turning off **It may add its own line when
its work changes for good** stops it writing one.

Every bot has the same kit: a shell on this computer, a browser (its own, or the one the user is
signed into), their files, the web, every installed skill and connected service, and the other
bots. A ready-made bot differs only in its role, and some carry a skill of their own:

- **Analyst** finds things out and answers with sources: what something costs, how a number moved
  and why, which one to pick, whether to buy now or wait.
- **Curator** keeps the user up to date: a morning brief on the topics they follow — what changed
  since the last one, why each story is theirs, the stories they are following as a line through
  the days, the rest as headlines — and anything long — a video, a podcast, a talk, an article, a
  PDF — handed back short, each point linked to where it is said.
- **Concierge** takes trips and errands up to the step that pays: a trip laid out day by day —
  pictures of every place that open large, what to do and watch for there, the cost and what is
  still to price always in view, what to book by when — flights and stays found and compared, a
  booking, an order or a form filled in. With the kiwi
  connector on (**Settings › Connectors**) it searches flights without opening a window.
- **Designer** makes what gets looked at: two to four ways a screen or page could look side by
  side, a deck, a post or poster at its real size, a short film for a birthday or a thank-you.
- **Tutor** explains anything simply, a picture at a time: slides that read like a picture book,
  read aloud when asked, or a one-page guide to study from.
- **Writer** writes what goes out in the user's name, the way they write: their mail read and
  answered as drafts, letters, posts, page copy, and a product's marketing — positioning, a launch
  plan, emails, an SEO audit — from one brief per product. It sends only what they asked to have
  sent, such as a finished page mailed to them.
- **Jarvis** takes whatever nobody else is for — the web, files, this computer.

What a bot's shell prints never shows a key the app keeps — an API key, a phone's token, the GPT
Subscription sign-in, a connector's credentials, or the key in the data folder's `.env`. In a thread
it reads `[hidden: a secret Thursday keeps]`, and the file it came from still holds the key.

A bot keeps its own memory — what a job taught it about working, how the user asked it to work —
one small note to a file, listed on its page. When a job is done, each bot that did real work in it
looks back once and keeps what a later job would otherwise have to find out again, or improves a
skill of its own; that look back adds a little to the job's tokens. **Bots keep their own memory**,
on the same screen, turns that on or off for every bot, the look back with it.

## A job is a thread

Work handed to a bot becomes a thread: the request, every step, what it asked and what it answered.
To carry work further, write to the same thread rather than start a new one: writing to a thread
that finished or stopped picks it up where it left off.

Threads show in the corner at the bottom right of the call screen (what is running and what waits
on the user; its **History** tab lists what is over) and in **Settings › Threads**, which keeps all
of them: **Filter by label, bot or word** narrows them, each can be deleted, and **Clear finished**
removes every ended one. An ended thread is kept for three months, then deleted; one still running
or waiting on an answer never is, and what a job made stays in **Settings › Files** either way.

Pressing the pill opens the corner as a list; pressing a row opens the thread. **Esc** or the back
arrow steps back one level, and the ✕ folds the room away.

An open thread is also drawn as an office where her face stands, beside the room, when the window
is wide enough: each bot at its desk, the work walked from desk to desk as it happens, a hand-off
that waits for another bot's answer held in its tray, with a dashed line on the floor from the bot
it waits for, and questions and the final report brought to your counter. A bot walks at a steady
pace and looks where it goes, and a paper it puts down lands in the tray. Each desk's laptop says
how its bot stands: its screen lit with lines running while the bot works, with a soft light on
the floor under the desk; dim while it waits; shut, with a tick on its tray, once it has handed its
answer back; dark once stopped, with an orange pause mark while the app waits on **Continue**. A
bot flips as it first comes in to its desk, hops when more work lands there, and now and then
leaps on its own; when the report reaches your counter, every bot leaps and throws its papers in
the air, and they flutter down and lie on the floor a moment. Opening a job that finished while you
were away does the same once the office stands, the first time only. A computer set to reduce
motion gets the walking without the leaps. A bot that was stopped, or paused waiting on
**Continue**, has its eyes crossed out, in the office and on its tab in the room.
Only a bot with something to say has a plate over its head: the one at work (**working**), the one
that wants you (**needs you**, in orange, for a question or **Continue**), and the thread's bot once
its report is ready (**report ready**). Every other bot just stands there; pointing at it, or at
its tab in the room, shows its name, and lights the tab. Pressing a bot opens its words over it —
the report for the thread's bot, below it at your counter; otherwise the question it asks or its
last answer — and its tab in the room; pressing it again, or tapping the floor, puts them away.
The office's top left names the job and says how it stands: at work and how many helpers are back,
your turn and who asks, paused waiting on **Continue** (both in orange; pressing it takes you to
the question, or to **Continue**, in the room), stopped or done. Once the job is done, it also says how many bots worked on it and lists the files
it handed over; pressing one opens it. Past three, the rest fold under **+N more**, which opens
them in place. Behind the building, at its top left, a scoreboard keeps how long the job has run
and lists its bots with the steps each has taken, most first. How the job stands is also written in
large letters on the ground beside the building: at work, your turn, paused, stopped or done. While
the app has stopped the job and waits on **Continue**, the ground around the building goes faintly
red. Once the job is done, the report is brought to your counter; writing on after it, the bot
carries the report back to its desk. A file dropped on the office goes to the
thread, as one dropped on the room does. The office opens at 70%, pans by dragging and zooms with
the wheel or the buttons at its bottom left, from 30% to 400%; the frame button brings it back.
Her face fades out as the office comes and back in as it goes; opening another thread while one is
open, the office before sinks away as the new one builds. A call that is on shows her last words at
the top; the corner of finished jobs stays quiet while a thread is open. Beside its office, the
room's header leaves the job's name to the office. **Office** and **Chat**, beside the ✕ of an open
thread, pick how every thread is shown: beside its office, or as the conversation alone with her
face kept. The choice
is kept on this computer. In the conversation, what you wrote yourself — a job from the write
line, a step-in — is under **You**; what she handed over or passed on from a call is under her name.

A long thread summarizes itself when it fills up. The small bar at the top right of an open thread
shows how full it is; pressing it has the bot summarize at its next step, which makes every later
step cheaper. The conversation on screen stays whole.

## Stopping a job

**Stop** stops a job. In the thread it stands beside **Step in** while a bot is working, and at the
top right of a question or a pause; in Settings › Threads it is in the **…** menu on the job's row.
The thread then shows *Stopped*. Writing to it later picks it up again. Asking her on a call to stop
it does the same.

## What the faces in the corner do

The faces in the bottom-right pill move only when something happens: a hop when a bot takes on a
job, a jump and turn when it finishes, a jump and head tilt when it has a question, a nod when it
has read a step-in, a sink when it stops. A bubble says it in a few words: *took on …*,
*asks you · …*, *finished its part*, *stopped · …*, *picked it back up*. A face that is lifted is
on a step right now.

While bots are working or waiting on the user, the pill shows those bots alone. With nothing going
on it shows every bot, awake for a few seconds when the screen opens or comes back to the front,
then at rest: still, with a blink or a glance now and then, so an open window costs the computer
almost nothing. The faces on finished jobs' cards in the bottom left do the same.

## Handing a bot work without a call

The **@** at the left end of the pill, or the `@` key, opens the line at the foot of the screen
(`calls.md`, writing to her) on the list of who to write to, Thursday first: pick a bot there, type
its name after the `@`, or later with the chip at the line's left. That pick lasts for one message.
Files can go with the words (at most 8 at a time, 25 MB each). The bot cannot hear the call, so the
message has to say the whole job. Enter sends it, and the room opens on the thread it started,
named by the message itself, up to its first 120 characters.

An open thread's own message box takes files the same way. Once more than one bot is in a thread,
the box says who it is addressed to and can be changed. Only the bot the job went to brings other
bots in, asks the user and answers them; a bot it pulled in answers back to that bot, and anything
it needs goes through it. A thread holds at most eight bots, the one the job went to included, and
all of them can work at the same time. A part that needs another bot's result waits until that result is in
and the bot the job went to has read it, then goes out with it: if the result was a question back,
that bot settles it first. Bots do not report progress to the call or a phone: the corner shows who
is working, and what reaches the user is a question or the ending.

A picture a bot made or was given can be changed rather than drawn again: ask for what should be
different. This needs an image model in **Settings › Models**, or the GPT Subscription signed in on
a paid plan; if the one picked cannot work from a picture, the bot says so.

## Telling a running bot something

**Step in** on a bot that is on a step puts words in front of it before its next step — a
correction, a narrower ask. Until read they wait marked *Step-in* and can be taken back with the ✕;
once read they join the conversation. Saying the same to her on a call does the same thing.

A bot that handed its part to another and is waiting has no step to step into; its tab shows an
open message box instead, and words sent there start it again at once. The same goes for a bot
whose part waits on another's result: it starts on what was written, and the result still reaches
it when it is in.

## When a bot needs the user

- **A question** comes from the bot the job went to, and pauses it until answered; other bots keep
  working. It shows where the message box is, with buttons when there are choices. Two asked at
  once are answered one by one on screen, or together by one answer on a call. The card above the
  pill says how many need a reply, and each can be answered right there (or just above the line at
  the foot, while that is open).
- **A pause** — a model that broke twice, a provider that refused, the app restarting, a job that
  reached its step limit — shows as *Paused*, and **Continue** picks it up where it left off. When
  the provider turned down the key or sign-in the bot runs on, it says so, and **Open Settings**
  beside **Continue** opens **Settings › API keys**; Continue once a key works.
- **Signing in** is always the user's: the bot opens the page and waits.
- **A site's mail** — a code, a link to confirm an address — a bot reads for itself once Thursday
  has a mailbox of her own (**Settings › Phone › Email**): it gives her address where a site asks
  for an email, for what it was asked to do, and reads the mail that site sends there
  (`phone.md`, Bots and her mailbox).
- **Paying** is the user's too: a bot fills a checkout in and stops at the button.

## What comes back

A job ends in what was asked for and a short report; anything longer than a few lines is a file.
Nothing opens by itself: a finished job waits as a card in the corner at the bottom left until it
is opened or dismissed, even across a reload. The corner holds the five newest. Opening a card or
a file on it counts as reading it, and she will not bring it up on a call; dismissing it with its ✕
does not, and it still waits in its thread. **Clear all** marks every one read, as does asking her
to clear what is finished. The files also show under the bot's words in the thread. On a call the
corner folds to its newest card and one line, *N more finished*, which opens the rest; it unfolds
again when the call ends.

When a job finishes while the app is not the window in front, the browser shows a notification if
it was allowed (it asks when a call is placed); with no app tab open, the computer's own
notification does.

A file opens over the app, and **Esc** closes it. The ↗ button at its top right opens it in a
browser tab. A result she shows on a call closes itself after five seconds unless the mouse moves,
a key is pressed or it is scrolled.

Under a result is a box for a note to the bot that made it — what to change, or what to do next.
The note goes to the thread the file came from, which picks up where it left off. When it cannot,
the box says why instead: the bot waits on an answer (**Answer in the thread**), the bot was deleted
(**Hand to another bot**), or its model has no key or is signed out (**Open Settings**). A file no
thread's report names, or whose thread was deleted, goes to a bot as a new job. If the bot changes
an open file, it is shown fresh with **Reloaded at** and the time; a sound or video shows
**Changed since it opened · Reload**.

**Settings › Files** keeps everything. **Finished** has a shelf per bot (**Everyone**, each bot,
**Unsorted**), each file with **Open in a new tab**, **Reveal in the file manager** and **Delete**.
**All files** is the whole folder, and **Empty scratch** clears the bots' scratch space. A Word
file, a spreadsheet or anything else the app cannot show has **Open it**, which opens it in the
computer's own program.

## Canvases, decks, videos and pages

A page, canvas or deck opened inside the app takes the keyboard once clicked; opened in its own tab
(↗) it has the whole window. Its top bar names the bot that made it, with its face; a page that is
read — a report, a brief, a trip — ends with the same, and its one colour is that bot's.

**Designer**'s canvas lays two to four options side by side, each with a note on what it is for and
what it costs, the one it recommends marked. Drag to move, pinch or hold ⌘ and scroll to zoom, the
arrow keys step through the options, and 0 fits everything back. Clicking a board shows its size,
colours, type and spacing, with a button to copy them. **Export** offers **Print · a board a page**,
**This board as a picture**, **Copy this board as an instruction** and **Download this file**. The
note pin on the rail (**N**) pins a note of the user's own; a bot asked to change the canvas reads
the notes. It designs from what exists — a codebase, a brand, a page — so give it a screenshot of a
screen it cannot open.

A **deck** is for presenting, or for explaining one thing simply. Any bot can make one; the app
lays out every slide, in one of six palettes: **Forest**, **Sea**, **Clay**, **Ink**, **Paper** or
**Night**.
**Tutor**'s decks explain the way a picture book does — a picture and a line or two a slide, a new
word marked where it is first named — and may end on a quiz: tapping a pick marks it and shows the
answer. The top bar has the arrows, Notes (**n**), full screen (**f**), Present, a theme button and
**Export** (**Print · one slide a page**, **This slide as a picture**, **Download this file**).
Presenting shows the slide alone, never the notes. There is no PowerPoint file; a handout prints to
PDF. **Edit** changes words and notes in place, moves, duplicates or deletes the open slide, or
changes the palette; ⌘Z undoes. Asked for one, a bot also makes the deck a PDF, a slide a sheet, or
a video that reads each slide's notes aloud over it. A picture a bot generates needs an image model,
and the video a speech model, in **Settings › Models**.

A **motion video** is a short hand-drawn film with music — a birthday or anniversary gift, a
thank-you to a parent, a farewell, a small story. Any bot can make one: tell it who it is for and
something only you two share, and it draws the people in cut paper and crayon (their hair,
clothes and age as you describe them), the room or the street, a cake or a letter, and writes the
words by hand, a letter at a time. A picture you give it can sit in a paper frame. It comes back
as an .mp4, beside a player that opens in the app: space plays and pauses, and dragging the bar
scrubs, with its music. Ask the bot for changes; it makes the .mp4 again.

A **sheet** is for numbers to keep working on — a budget, a ledger, a list of clients. It is a real
Excel file (.xlsx) with a page that shows it in the app: a tab per sheet, the picked cell's formula
over the grid, and the sum, average and count of the picked cells. A column's heading button sorts
or filters the view without changing the file. **Export** has **Excel file**, **This sheet as
CSV**, **Copy this sheet** and **Print**. **Edit** changes the sheet itself: type in cells, write
formulas starting with `=`, paste from any spreadsheet, add or take out rows and columns, set how
a column's numbers read, undo and redo; changes are saved into the Excel file. Receipts, invoices
and a bank's or card's CSV export come back as a sheet of spending (a bot never signs in to a bank).
A bot also reads an Excel file handed to it; an old .xls has to be saved as .xlsx first.

A **page** is for reading — a report, a memo, a plan, meeting notes — with its contents beside it,
tables, checklists, and numbered sources at the end. It prints as a document, and **Export › Word
file** saves a .docx. Click anywhere in its words and type: there is no Edit button. While typing, a
handle beside the block moves, copies or deletes it, selected words get bold, italic, a heading or a
link, `/` on an empty line picks a block, and lines started with `#`, `-`, `1.`, `[]` or `>` become
headings, lists, checklists or notes. Clicking a link shows where it goes, with **Open**, **Edit**
and **Remove**; ⌘-click or Ctrl-click opens it straight away. In the app, changes are saved a moment
after you stop typing, and the top bar says **Saving…** then **Saved**. A bot asked to change it
starts from the page as edited.

A page opened outside the app, as a file, is not saved into that file: the top bar says **Kept in
this browser only**, your edits come back when the file is opened again in the same browser,
**Discard edits** throws them away, and **Export › Download this file** saves a copy with them.

When a page is changed elsewhere (by its bot, or from another window) while you have unsaved edits,
they are not saved over it: the top bar says **Not saved: changed elsewhere** and shows **Load new
version**. Your edits stay on the page and are kept aside; the new version then opens with them in a
box above it, to **Copy** back, **Download** as a file of their own, or **Dismiss**.

When a deck or sheet is changed elsewhere (by its bot, in Excel, or from another window) while it
is being edited, nothing more is saved over it: the top bar says **Changed since it opened · not kept** and shows **Reload**.

## Routines: jobs that start by themselves

A routine is a bot, a job and a time. It is made by telling Thursday — "every morning at nine, go
through my mail", "in an hour, check the fares again" — or with **New routine** in
**Settings › Routines**, which lists them, each with a switch. A bot cannot set one up. At most
twelve exist. **When** has three kinds:

- **Once**: a day and a time, or **In an hour**. It runs once and switches itself off; picking a
  new day and time sets it again.
- **On set days**: a time of day on the days picked; **Every day**, **Weekdays** and **Weekends**
  fill them in one press.
- **Every few hours**: 1, 2, 3, 6, 12 or 24. Another number up to 168 can be set by asking
  Thursday.

Each run opens an ordinary thread, marked with a repeat sign, and the bot is told the last run's
answer, so "what came since last time" works. A routine's row opens its settings and latest runs;
**Run now** starts one at once, unless the last run is still open.

- If the last run is still working or waiting when the next time comes, that time is skipped.
- A run the app has to stop — a model that broke twice, a provider that refused, a step limit, the
  app restarting — ends there instead of waiting on **Continue**: it shows as stopped, its thread
  and the routine's list of runs say why, and the routine starts again at its next time. A
  question the bot asks still waits for an answer.
- Switching a routine off keeps it; deleting it keeps the threads it opened.
- A routine whose bot is switched off waits until it is back on; one whose bot was deleted asks for
  another bot.

## While the app is closed

Jobs run on the user's own computer as long as Thursday is running there. Closing every tab does not
stop them, and routines still start. When a phone is connected, questions and endings reach it too
(`phone.md`). A spoken call ends when its tab closes; the work it handed over goes on.

A computer that sleeps pauses everything, and work carries on when it wakes. When Thursday itself
stops — its terminal is quit, or the computer restarts — a running job waits for **Continue**, and
a routine's run ends stopped. A routine time missed while it was not running starts once when it
is back.
