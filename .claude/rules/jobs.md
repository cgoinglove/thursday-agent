---
checked: 2026-10-06
paths:
  - "features/bot/{bot,room,thread,lesson}.{action,file,lesson,memory,query,run,runner,schema}.ts"
  - "features/routine/**"
  - "features/ai/prompts/bot.prompt.ts"
  - "features/ai/tools/{bot,routine}.tool.ts"
  - "app/api/{bot,routine}/**"
  - "scripts/bot-context.test.mts"
---

# Bots and jobs

Work handed to a bot runs on the server to its end, call or no call, tab or no tab; when it
cannot go on it waits for a person — a routine's run, which nobody handed over, ends stopped
instead — and everything it did stays as rows.

## Start here
- `features/bot/bot.runner.ts` — start, answer, stop and remove a job; launches turns, retries a
  break once, has each bot look back once a job is done (`reflect`), parks running jobs at boot
  and shutdown, clears old ones.
- `features/bot/room.query.ts` — the room's rows: exchanges, inboxes, questions, relays, and
  when a thread is done or waiting.
- `features/bot/bot.run.ts` — one participant's turn: prompt, tools, stream, compaction, resume.
- `features/bot/bot.lesson.ts` — lessons: what a command changed of a bot's memory and skills.
- `features/bot/thread.query.ts` — thread rows and what the screen and the call read of them.
- `features/bot/bot.schema.ts` — bot and thread shapes: thread status, `isAppStop`, `standOf`.
- `features/bot/thread.file.ts` — a note about a file to the thread that reported it: which
  thread, who reads it, what stops it.
- `features/ai/prompts/bot.prompt.ts` — what a participant reads each turn, and its opening.
- `features/routine/routine.clock.ts` — what starts a routine; its watch: `routine.watch.ts`.
- `scripts/bot-context.test.mts` — the real runner, database and prompts, with scripted models.

## How it fits
A thread is a room with one participant per bot, each with its own transcript
(`thread_message`); only messages cross between transcripts. Each exchange is a `thread_work`
row — who called whom, and the row a reply wakes (`parentId`). Only the coordinator's seat — the
thread's bot answering Thursday (`isCoordinatorSeat`) — holds `send_message`: it puts words in a
bot's inbox (`thread_delivery`) or asks the user, and each of its turns starts with what it
handed out that is still out (`roomBoard`). A bot it brings in first reads the job it was handed
(`joinRoom`), and its turn's last words are its return, delivered once nothing it called is still
open (`finishRoomWork`). A hand-off sent `after` other bots waits in its row (`waitsFor`) until
they are back and the coordinator ends the turn that read their answers without asking the user
(`releaseWaiting`), then goes out with them; a bot the user starts early is still owed them. `room.query` owns those rows and settles the
thread; `bot.runner` launches what they queue; `bot.run` runs one turn. What is owed to Thursday
— a question, the coordinator's report, a stop — is a `thread_relay` row, which the call
(`features/thursday/open-work.ts`) and a phone (`features/reach`) read and accept.

## What breaks
- `bot.runner` is the only caller of `runBot` and of the `room.query` writes that queue, pause or
  cancel turns: a turn queued elsewhere waits until the runner next claims work in that thread,
  and a stop elsewhere leaves the live run's tools going.
- The runner keeps in memory only live runs, the thread lock and one-shot asks (`askCompact`):
  anything else a job says, hears or waits on that is not a row is lost at a restart, and the
  screen and the resumed model stop reading the same thing.
- Two bots answering each other stop only at a limit: the `BOT_RUN` limits (`config.ts`) are
  checked where a turn is claimed, a message is sent or a step is taken (`room.query`, `bot.run`).
- Routines and a phone start jobs with no tab open, so a step that waits on a browser never runs
  for them; `presence` decides only where news of a job goes (a desktop notice, a phone).
- An app event reaches only a tab open at that moment: news for the call or a phone that is not a
  `thread_relay` row is missed by the phone and the next call.
- A stop that parks a thread on Continue without going through `pauseRoom` or `settleRoom` leaves
  a routine's run waiting, and the clock then skips that routine's every later start.

## Check
`pnpm test:bot`; a change to how the room routes, waits or resumes gets a case there. To judge
how bots behave after a change, count the stored turns and tool calls (`thread_message`,
`thread_work`) of jobs run on a scratch server, not one transcript read by eye.
