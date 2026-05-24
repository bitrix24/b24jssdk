import { createWriteStream } from 'node:fs'
import { resolve } from 'node:path'
import { defineCommand } from 'citty'
import 'dotenv/config'
import {
  ApiVersion,
  B24Hook,
  ConsoleV2Handler,
  Logger,
  LogLevel,
  MemoryHandler,
  StreamHandler
} from '@bitrix24/b24jssdk'

/**
 * CLI command — manual smoke tests for the retry-policy fix
 * (PR #45 / issues #44 and #46).
 *
 * Each scenario is annotated with: purpose, what it does, PASS markers,
 * FAIL (regression) markers. Two loggers are attached:
 *
 *   - `smoke-retry` (user-facing, ConsoleV2Handler at INFO + StreamHandler
 *     at DEBUG to the log file + MemoryHandler at DEBUG for in-process
 *     analysis) — used to print scenario headers and the PASS/FAIL line.
 *
 *   - `b24` (SDK-facing, ConsoleV2Handler at ERROR only) — passed to
 *     `b24.setLogger(...)`. Keeps actual SDK errors visible while
 *     filtering out the deprecation/migration warning chatter on every
 *     call. Full DEBUG trace still goes to the log file via the shared
 *     stream below.
 *
 * Required env (in `playgrounds/cli/.env`):
 *
 *   B24_HOOK=https://<portal>/rest/<userId>/<secret>/
 *
 * Optional args (citty flags — see `args` block below):
 *
 *   --scenario=<A|B|D|E|all>  which scenario to run (default: all)
 *   --taskId=<id>             real task id for scenario B
 *   --total=<n>               number of parallel calls for scenario E
 *                             (default: 500)
 *   --logFile=<path>          log path (default: smoke-retry.log,
 *                             resolved against cwd — `playgrounds/cli/`
 *                             when invoked via `pnpm --filter`)
 *
 * @usage pnpm --filter @bitrix24/b24jssdk-cli dev smoke-retry --scenario=A
 */

export default defineCommand({
  meta: {
    name: 'smoke-retry',
    description: 'Manual smoke tests for the retry-policy fix (PR #45)'
  },
  args: {
    scenario: { description: 'Scenario key: A | B | D | E | all', default: 'all' },
    taskId: { description: 'Real task id to use in scenario B', default: '0' },
    total: { description: 'Number of parallel calls in scenario E', default: '500' },
    logFile: { description: 'Full-trace log file path (relative paths resolve against cwd)', default: 'smoke-retry.log' }
  },
  async setup({ args }) {
    const scenario = String(args.scenario).toUpperCase()
    const want = (key: string): boolean => scenario === key || scenario === 'ALL'
    const taskIdArg = Number(args.taskId)
    const totalArg = Number(args.total)
    const logPath = resolve(process.cwd(), String(args.logFile))

    // region Loggers ////
    const fileStream = createWriteStream(logPath, { flags: 'w' })
    const memHandler = new MemoryHandler(LogLevel.DEBUG, { limit: 50_000 })

    const logger = Logger.create('smoke-retry')
    logger.pushHandler(new ConsoleV2Handler(LogLevel.INFO, { useStyles: false }))
    logger.pushHandler(new StreamHandler(LogLevel.DEBUG, { stream: fileStream }))
    logger.pushHandler(memHandler)

    const loggerForDebugB24 = Logger.create('b24')
    loggerForDebugB24.pushHandler(new ConsoleV2Handler(LogLevel.ERROR, { useStyles: false }))
    loggerForDebugB24.pushHandler(new StreamHandler(LogLevel.DEBUG, { stream: fileStream }))
    loggerForDebugB24.pushHandler(memHandler)
    // endregion Loggers ////

    const hookPath = process.env.B24_HOOK ?? ''
    if (!hookPath.trim()) {
      logger.emergency('B24_HOOK environment variable is not set. Configure it in playgrounds/cli/.env')
      process.exit(1)
    }

    const b24 = B24Hook.fromWebhookUrl(hookPath)
    b24.setLogger(loggerForDebugB24)

    logger.notice(`Connected to Bitrix24: ${b24.getTargetOrigin()}`)
    logger.notice(`Scenario: ${scenario} | log file: ${logPath}`)

    /**
     * Stringify the entire LogRecord and check for a substring marker.
     * Robust against the exact record shape — covers `message`, level
     * name and any context fields.
     */
    function countInMemory(marker: string): number {
      const records = memHandler.getRecords()
      let n = 0
      for (const r of records) {
        if (JSON.stringify(r).includes(marker)) n++
      }
      return n
    }

    async function run(label: string, fn: () => Promise<unknown>): Promise<void> {
      memHandler.clear()
      const t0 = Date.now()
      logger.notice(`===== ${label} =====`)
      let outcome: 'OK' | 'THROWN' = 'OK'
      let summary = ''
      try {
        const res = await fn()
        summary = (res && typeof res === 'object' && '_status' in (res as any))
          ? `status=${(res as any)._status}`
          : String(res ?? '')
      } catch (e: any) {
        outcome = 'THROWN'
        summary = `code=${e?.code} status=${e?.status} msg=${e?.message}`
      }
      const elapsed = Date.now() - t0
      const attempts = countInMemory('http request attempt')
      const notRetryable = countInMemory('is not retryable')
      const exhausted = countInMemory('all retry attempts exhausted')
      logger.notice(
        `[${outcome}] ${elapsed}ms | attempts=${attempts} | not-retryable=${notRetryable} | exhausted=${exhausted}`
      )
      if (summary) logger.notice(`       ${summary}`)
    }

    // region A. issue #44 — v3 validation 400 ////
    /**
     * **Why:** Exact scenario from issue #44 — a v3 method called with a
     * malformed payload returns HTTP 400 with the validation error
     * `BITRIX_REST_V3_EXCEPTION_VALIDATION_REQUESTVALIDATIONEXCEPTION`.
     * Before PR #45 the SDK retried it 3 times (~7s) because that code
     * was not in the hard/soft allowlist.
     *
     * **What it does:** Calls `tasks.task.update` via the v3 endpoint
     * with a wrong-shape body. The server replies `400` immediately. With
     * the fix, `handleError()` short-circuits on the 4xx status and the
     * loop exits on the first attempt.
     *
     * **PASS markers:** `attempts=1`, `not-retryable=1`, `exhausted=0`,
     * outcome `[THROWN]` with `code=BITRIX_REST_V3_EXCEPTION_VALIDATION_...`,
     * elapsed `< 2_000`ms.
     *
     * **FAIL markers:** `attempts=3`, `exhausted=1`, elapsed `> 5_000`ms.
     */
    if (want('A')) {
      await run('A. issue #44 — v3 validation 400 (bad payload)', () =>
        b24.actions.v3.call.make({
          method: 'tasks.task.update',
          params: { wrong: 'shape' }
        })
      )
    }
    // endregion ////

    // region B. issue #46 — tasks code 1048582 ////
    /**
     * **Why:** Issue #46. Calling `tasks.task.pause` on a task that is
     * not in a pauseable state (already paused / completed / not assigned
     * to the webhook user) returns HTTP 400 with a numeric Bitrix code
     * `1048582` (`"Действие не доступно"`). The code is not in any
     * built-in allowlist, so before PR #45 the SDK retried 3 times (~7s).
     *
     * **What it does:** Calls `tasks.task.pause` twice in a row on
     * `--taskId`. At least one of the two calls is expected to hit the
     * "action not available" condition.
     *
     * **PASS markers (per call):** `attempts=1`, on error
     * `not-retryable=1` with `code=1048582 status=400`, elapsed `< 1_500`ms.
     *
     * **FAIL markers:** `attempts=3`, multiple `post/catchError` entries
     * for the same requestId, elapsed `> 5_000`ms.
     *
     * If `--taskId` is unset (default `0`), the scenario is skipped.
     */
    if (want('B')) {
      if (taskIdArg > 0) {
        await run('B1. issue #46 — pause once', () =>
          b24.actions.v2.call.make({ method: 'tasks.task.pause', params: { taskId: taskIdArg } })
        )
        await run('B2. issue #46 — pause again (expect 400 / code 1048582)', () =>
          b24.actions.v2.call.make({ method: 'tasks.task.pause', params: { taskId: taskIdArg } })
        )
      } else {
        logger.notice('B. skipped — pass --taskId=<id> to run')
      }
    }
    // endregion ////

    // region D. transient errors still retry (negative control) ////
    /**
     * **Why:** PR #45 must not have broken the retry path for genuinely
     * transient failures. A client-side timeout falls under HTTP `408`
     * (`REQUEST_TIMEOUT`) — explicitly excluded from the 4xx fast-fail
     * gate, still governed by `retryOnNetworkError` (default `true`).
     *
     * **What it does:** Lowers the underlying axios timeout to **1 ms**
     * on the v2 HTTP client, then makes a normal `user.current` call.
     * Every attempt aborts before any response can arrive, so the SDK
     * enters the retry loop and burns all `maxRetries` (3) attempts.
     *
     * **PASS markers:** `attempts=3`, outcome `[THROWN]`,
     * `code=REQUEST_TIMEOUT` or `NETWORK_ERROR`, `not-retryable=0`.
     *
     * **FAIL markers:** `attempts=1` (i.e. we accidentally turned 408
     * into a fast-fail).
     */
    if (want('D')) {
      const v2 = b24.getHttpClient(ApiVersion.v2).ajaxClient
      const restore = v2.defaults.timeout
      v2.defaults.timeout = 1
      try {
        await run('D. transient — timeout still retries (axios timeout=1ms)', () =>
          b24.actions.v2.call.make({ method: 'user.current' })
        )
      } finally {
        v2.defaults.timeout = restore
      }
    }
    // endregion ////

    // region E. rate-limit still retries (load — log to file) ////
    /**
     * **Why:** Same intent as D — confirm the limiter stack still kicks
     * in for real transient signals (`429` / `503` /
     * `QUERY_LIMIT_EXCEEDED` / `OPERATION_TIME_LIMIT`). PR #45 must not
     * bypass these.
     *
     * **What it does:** Fires `--total` (default 500) parallel
     * `user.current` calls. The SDK's `RateLimiter` / `AdaptiveDelayer`
     * should pre-throttle (`blocked method`), and on `503` / `429` the
     * `RestrictionManager.handleError()` should issue retries with
     * backoff.
     *
     * **PASS markers:** `ok = total` (or close to it),
     * `attempts >= total` (≥ means at least one retry — the limiter
     * doing its job), `rateLimitHits > 0`, `not-retryable = 0`,
     * `exhausted = 0`.
     *
     * **FAIL markers:** `not-retryable > 0` (we zapped 429), or large
     * `failed` count with `code=QUERY_LIMIT_EXCEEDED` (limiter not
     * handling 503).
     */
    if (want('E')) {
      memHandler.clear()
      const t0 = Date.now()
      logger.notice(`===== E. rate-limit — ${totalArg} parallel user.current =====`)
      const results = await Promise.allSettled(
        Array.from({ length: totalArg }, () =>
          b24.actions.v2.call.make({ method: 'user.current' })
        )
      )
      const elapsed = Date.now() - t0
      const ok = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[]
      const byCode: Record<string, number> = {}
      for (const f of failed) {
        const c = (f.reason as any)?.code ?? 'unknown'
        byCode[c] = (byCode[c] ?? 0) + 1
      }
      const attempts = countInMemory('http request attempt')
      const rateLimitHits
        = countInMemory('QUERY_LIMIT_EXCEEDED')
          + countInMemory('OPERATION_TIME_LIMIT')
          + countInMemory('blocked method')
      const notRetryable = countInMemory('is not retryable')
      const exhausted = countInMemory('all retry attempts exhausted')

      logger.notice(
        `[${ok === totalArg ? 'OK' : 'PARTIAL'}] ${elapsed}ms (avg ${(elapsed / totalArg).toFixed(1)}ms) | `
        + `ok=${ok}/${totalArg} | attempts=${attempts} | rateLimitHits=${rateLimitHits} | `
        + `not-retryable=${notRetryable} | exhausted=${exhausted}`
      )
      if (failed.length > 0) {
        logger.notice('       failures by code:', byCode)
      }
    }
    // endregion ////

    await new Promise<void>(resolveFlush => fileStream.end(() => resolveFlush()))

    logger.notice(`full trace -> ${logPath}`)
    logger.notice('analyse with:')
    logger.notice(`  grep -c 'http request attempt'         ${logPath}   # total attempts across the run`)
    logger.notice(`  grep -c 'is not retryable'             ${logPath}   # 4xx fast-fail hits (PR #45)`)
    logger.notice(`  grep -c 'all retry attempts exhausted' ${logPath}   # exhausted retries — should be 0 for A/B`)
    logger.notice(`  grep -c 'blocked method'               ${logPath}   # limiter pre-throttle hits (E)`)
  }
})
