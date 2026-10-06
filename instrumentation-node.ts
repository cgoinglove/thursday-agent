export async function boot() {
  const {
    APP_DIR,
    BROWSER_IDLE,
    DATA_DIR,
    DB_PATH,
    ENV_PATH,
    HISTORY_KEEP,
    WORKSPACE_KEEP,
  } = await import("@/config");
  const { logger } = await import("@/lib/logger");

  // Nothing can run on a database this build cannot migrate, and nothing can
  // remove it while this process holds it: say why, then exit with the code
  // both starters answer by offering to set it aside (bin/database.mjs).
  const { migrateDatabase, NewerDatabase } = await import("@/database/migrate");
  await migrateDatabase().catch((cause) => {
    // Healthy data a newer version wrote: nothing to set aside. The starters offer the
    // set-aside on MIGRATION_FAILED_EXIT (65) alone (bin/database), so this code is let be
    if (cause instanceof NewerDatabase) {
      console.error(
        `  ${cause.message}\n  Nothing was changed. Start the newer one (npx thursday-agent@latest), or update this one, and it opens as it was.\n`,
      );
      process.exit(66);
    }
    logger.error(`Cannot migrate ${DB_PATH}`);
    console.error(
      `  ${cause instanceof Error ? cause.message : cause}\n` +
        "  Starting over gives an empty one. API keys, bots, connectors, calls, threads and memory go with it; the workspace and skills stay.\n" +
        `  The old ${DB_PATH} is moved aside as .corrupt-<time> rather than removed, so a file damaged by a crash or a full disk can still be opened.\n`,
    );
    process.exit(65);
  });

  // The secrets in the database are sealed with one key (lib/secret), made here on a first
  // start. One that cannot be read or is malformed stops the start: nothing could be saved
  // or read without it, and a new key in its place would strand every secret sealed under it.
  const { ENCRYPTION_KEY_NAME, encryptionKey } = await import("@/lib/secret");
  try {
    if (encryptionKey().from === "made")
      logger.info(`made the key that seals saved secrets, in ${ENV_PATH}`);
  } catch (cause) {
    logger.error(`Cannot load ${ENCRYPTION_KEY_NAME}`);
    console.error(`  ${cause instanceof Error ? cause.message : cause}\n`);
    process.exit(1);
  }

  // What an older build wrote in the clear is sealed before anything reads it, and the file
  // rewritten so no copy of it is left; what this key cannot open is said, and asked for
  // again where it is set (config.seal)
  const { sealStoredSecrets } = await import("@/features/config/config.seal");
  await sealStoredSecrets()
    .then(({ sealed, unreadable, scrub }) => {
      if (sealed) logger.info(`sealed ${sealed} secret(s) kept in the clear`);
      if (scrub === "done")
        logger.info(
          "rewrote the database: no key it held in the clear is left in it",
        );
      if (scrub === "pending")
        logger.warn(
          "the database's log could not be emptied: a key it held in the clear may be left in it until the next start rewrites it",
        );
      if (unreadable.length)
        logger.warn(
          `${unreadable.join(", ")} can't be unlocked: sealed with an encryption key this data folder no longer has (${ENCRYPTION_KEY_NAME} in ${ENV_PATH}). Put that .env back from a backup and start the app again to open them, or enter each again — Settings marks them`,
        );
    })
    .catch((cause) =>
      logger.error("seal secrets (the next start tries again)", cause),
    );

  // The two notes about the user must exist before any prompt lists them.
  const { ensureRootNotes } = await import("@/features/memory/memory.query");
  await ensureRootNotes();

  // A ready-made bot whose words the user never changed takes what its seed says now
  const { refreshSeedWords } = await import("@/features/bot/bot.query");
  await refreshSeedWords()
    .then((moved) => {
      if (moved)
        logger.info(`${moved} ready-made bot(s) took their seed's new words`);
    })
    .catch((cause) => logger.error("refresh seed words", cause));

  // Before a call can ask for it (features/ai/guide).
  const { installGuide } = await import("@/features/ai/guide");
  await installGuide().catch((cause) => logger.error("install guide", cause));

  // Threads left `running` by the previous process are not running now.
  const { closeIdleBrowsers, sweepJobFiles, sweepThreads } = await import(
    "@/features/bot/bot.runner"
  );
  await sweepThreads();

  // And a job an older build left ended while its room still held an open question is over:
  // it owed every count an answer no list could show (thread.query closeEndedQuestions).
  const { closeEndedQuestions } = await import("@/features/bot/thread.query");
  await closeEndedQuestions()
    .then(({ closed, cleared }) => {
      if (closed || cleared)
        logger.info(`closed ${closed} question(s) on ${cleared} ended job(s)`);
    })
    .catch((cause) => logger.error("close ended questions", cause));

  // What jobs left behind is cleared by age (config WORKSPACE_KEEP): once now,
  // then on a timer. Housekeeping rather than work, so no browser is needed.
  // After sweepThreads, so a job the last process left running counts as waiting.
  const sweepFiles = () =>
    void sweepJobFiles().catch((cause) =>
      logger.error("sweep job files", cause),
    );
  sweepFiles();
  setInterval(sweepFiles, WORKSPACE_KEEP.sweepEveryMs).unref();
  // And a waiting job's hidden browsers, which hold hundreds of megabytes each, go sooner
  // (config BROWSER_IDLE)
  const closeIdle = () =>
    void closeIdleBrowsers().catch((cause) =>
      logger.error("close idle browsers", cause),
    );
  closeIdle();
  setInterval(closeIdle, BROWSER_IDLE.checkEveryMs).unref();

  // Same for calls: an open call row from a vanished tab would route finished
  // jobs to a listener that is not there (bot.runner).
  const { deleteEndedCalls, sweepCalls } = await import(
    "@/features/thursday/thursday.query"
  );
  await sweepCalls();

  // A spoken call is read once after it ends to keep what the user said about themselves
  // (memory/call-memory): those that ended unread — open when the last process stopped, just
  // swept shut, or ended as it stopped — are read now, on the server like any other work
  const { keepCallMemory } = await import("@/features/memory/call-memory");
  void keepCallMemory();

  // And what the app kept of its own use goes by age as well (config HISTORY_KEEP):
  // an ended call with its turns, a job that is over with its messages, a bot's lesson
  // with the text it could put back. After sweepThreads and sweepCalls, so nothing the
  // last process left open is counted as finished. A job's results are not in these
  // rows — they are in `artifacts/` — nor is what a bot kept, which stays on disk.
  const { removeFinishedThreads } = await import("@/features/bot/bot.runner");
  const { deleteOldLessons } = await import("@/features/bot/lesson.query");
  const sweepHistory = () =>
    void (async () => {
      const before = new Date(Date.now() - HISTORY_KEEP.forMs);
      const calls = await deleteEndedCalls(before);
      const jobs = await removeFinishedThreads(before);
      const lessons = await deleteOldLessons(before);
      if (calls || jobs || lessons)
        logger.info(
          `cleared ${calls} old call(s), ${jobs} old job(s) and ${lessons} old lesson(s)`,
        );
    })().catch((cause) => logger.error("sweep history", cause));
  sweepHistory();
  setInterval(sweepHistory, HISTORY_KEEP.sweepEveryMs).unref();

  // Work runs for as long as the server does, watched or not: a phone, a routine and a
  // server kept up from login all start it with no browser open. What a tab alone held goes
  // with the tab — its calls — and a conversation the server holds for a phone stays (reach).
  const { presence } = await import("@/app/api/events/app-event.server");
  const { pauseThreads } = await import("@/features/bot/bot.runner");
  const { heldCalls } = await import("@/features/reach/reach");
  presence.onGone(() => {
    // A call that only a gone tab held is over, and is read like any other ended call
    void sweepCalls(heldCalls())
      .then(() => void keepCallMemory())
      .catch((cause) => logger.error("browser gone", cause));
  });

  // Routines start themselves from here on; a start is a thread, so everything above holds for it
  const { startRoutineClock } = await import(
    "@/features/routine/routine.clock"
  );
  startRoutineClock();

  // Sessions bots kept among their own files move to where the app keeps them
  const { adoptKeptSessions } = await import(
    "@/features/signins/signins.query"
  );
  await adoptKeptSessions().catch((cause) =>
    logger.error("adopt kept sessions", cause),
  );

  // Someone writing from a phone is answered from here on, when a bot token is set
  const { startReach } = await import("@/features/reach/reach");
  void startReach().catch((cause) => logger.error("start reach", cause));

  // The launcher forwards shutdown signals so pending work records its manual resume boundary.
  if (process.env.NEXT_MANUAL_SIG_HANDLE) {
    const { checkpoint } = await import("@/database/db");
    const { closeHiddenBrowsers } = await import(
      "@/features/workspace/workspace"
    );
    let stopping = false;
    // SIGHUP is a terminal closed under it: left to its default, the server died on the spot
    // and skipped both
    for (const [signal, code] of [
      ["SIGINT", 130],
      ["SIGTERM", 143],
      ["SIGHUP", 129],
    ] as const) {
      process.on(signal, () => {
        if (stopping) return;
        stopping = true;
        logger.info(`${signal} — parking what was running`);
        const parked = pauseThreads(
          "The server was shut down while this was running.",
        )
          .catch((cause) => logger.error("pause threads", cause))
          // Nothing writes after this, so the write-ahead log can be folded back
          // in: from here the database is one file to copy (guide/setup).
          .then(() => checkpoint())
          .catch((cause) => logger.error("checkpoint", cause));
        // Bots' hidden browsers belong to playwright-cli's daemon, which outlives this
        // process: left up, each held hundreds of megabytes until the next day's sweep
        const closed = closeHiddenBrowsers().catch((cause) =>
          logger.error("close browsers", cause),
        );
        // The launcher kills the server four seconds after passing a stop on
        const late = new Promise((resolve) => setTimeout(resolve, 3_000));
        void Promise.race([Promise.all([parked, closed]), late]).finally(() =>
          process.exit(code),
        );
      });
    }
  }

  // The two roots are the first thing to check when a fresh clone reads the
  // wrong database or cannot find its skills (config APP_DIR / DATA_DIR)
  logger.info(`up — app ${APP_DIR}, data ${DATA_DIR}`);

  // Not awaited: the app is usable without it, and a first run is on the intro
  // screen for about as long as the download takes.
  const { ensureBrowser } = await import("@/features/workspace/workspace");
  void ensureBrowser().catch((cause) => logger.debug("browser fetch", cause));
}
