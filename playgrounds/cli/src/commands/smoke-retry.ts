/**
 * Manual smoke tests for the retry-policy fix (PR #45 / issues #44, #46).
 *
 * Each scenario is annotated with: purpose, what it does, PASS markers,
 * FAIL (regression) markers. The script attaches a `Logger` with two
 * handlers:
 *   - `ConsoleV2Handler` at INFO  — surfaces just the useful lines in the
 *     terminal so you can eyeball each scenario.
 *   - `StreamHandler` at DEBUG    — writes the full trace (every attempt,
 *     request/response, limiter state) to a file for post-hoc analysis.
 *   - `MemoryHandler` at DEBUG    — used by the script itself to print a
 *     short PASS/FAIL summary after each scenario.
 *
 * Required env (in `playgrounds/cli/.env`):
 *
 *   B24_HOOK=https://<portal>/rest/<userId>/<secret>/
 *
 * Optional env:
 *
 *   SMOKE_TASK_ID=<id>          # real task id you may pause for scenario B
 *   SMOKE_E_TOTAL=500           # number of parallel calls for scenario E
 *   SMOKE_LOG_FILE=./smoke.log  # log path (default: playgrounds/cli/smoke-retry.log)
 *
 * Run a single scenario (recommended — clearer output):
 *
 *   pnpm --filter @bitrix24/b24jssdk-cli exec tsx src/commands/smoke-retry.ts A
 *   pnpm --filter @bitrix24/b24jssdk-cli exec tsx src/commands/smoke-retry.ts B
 *   pnpm --filter @bitrix24/b24jssdk-cli exec tsx src/commands/smoke-retry.ts D
 *   pnpm --filter @bitrix24/b24jssdk-cli exec tsx src/commands/smoke-retry.ts E
 *
 * Or run them all back-to-back:
 *
 *   pnpm --filter @bitrix24/b24jssdk-cli exec tsx src/commands/smoke-retry.ts all
 *
 * After the run, the script prints the log file path and a few grep
 * recipes you can use to dig into the trace.
 */

import 'dotenv/config'
import { createWriteStream } from 'node:fs'
import { resolve } from 'node:path'
import {
  ApiVersion,
  B24Hook,
  ConsoleV2Handler,
  Logger,
  LogLevel,
  MemoryHandler,
  StreamHandler
} from '@bitrix24/b24jssdk'

// region ---- env + logger ----------------------------------------------

const HOOK_URL = process.env.B24_HOOK
if (!HOOK_URL || !HOOK_URL.trim()) {
  throw new Error('Set B24_HOOK in playgrounds/cli/.env')
}

const LOG_PATH = resolve(
  process.cwd(),
  process.env.SMOKE_LOG_FILE ?? 'playgrounds/cli/smoke-retry.log'
)

const fileStream = createWriteStream(LOG_PATH, { flags: 'w' })
const memHandler = new MemoryHandler(LogLevel.DEBUG, { limit: 50_000 })

const logger = new Logger('smoke-retry')
logger.pushHandler(new ConsoleV2Handler(LogLevel.INFO))
logger.pushHandler(new StreamHandler(LogLevel.DEBUG, { stream: fileStream }))
logger.pushHandler(memHandler)

const b24 = B24Hook.fromWebhookUrl(HOOK_URL)
b24.setLogger(logger)

// endregion ---------------------------------------------------------------

// region ---- helpers ----------------------------------------------------

/**
 * Stringify the entire LogRecord and check for a substring marker.
 * Robust against the exact record shape — covers `message`, level name
 * and any context fields the SDK puts under `params`.
 */
function countInMemory(marker: string): number {
  const rec = memHandler.getRecords()
  let n = 0
  for (const r of rec) {
    if (JSON.stringify(r).includes(marker)) n++
  }
  return n
}

async function run(label: string, fn: () => Promise<unknown>): Promise<void> {
  memHandler.clear()
  const t0 = Date.now()
  console.log(`\n===== ${label} =====`)
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
  console.log(
    `[${outcome}] ${elapsed}ms | attempts=${attempts} | not-retryable=${notRetryable} | exhausted=${exhausted}`
  )
  if (summary) console.log(`       ${summary}`)
}

const scenario = (process.argv[2] ?? 'all').toUpperCase()
const want = (key: string) => scenario === key || scenario === 'ALL'

// endregion ---------------------------------------------------------------

// region ---- A. issue #44 — v3 validation 400 ---------------------------
/**
 * **Why:** This is the exact scenario from issue #44 — a v3 method called
 * with a malformed payload returns HTTP 400 with the validation error
 * `BITRIX_REST_V3_EXCEPTION_VALIDATION_REQUESTVALIDATIONEXCEPTION`. Before
 * PR #45 the SDK retried it 3 times (~7s) because that code was not in
 * the hard/soft allowlist.
 *
 * **What it does:** Calls `tasks.task.update` via the v3 endpoint with a
 * wrong-shape body. The server replies `400` immediately. With the fix,
 * `handleError()` short-circuits on the 4xx status and the loop exits on
 * the first attempt.
 *
 * **PASS markers (console summary):**
 *   - `attempts=1`
 *   - `not-retryable=1` (the new fast-fail log line fires once)
 *   - `exhausted=0`
 *   - outcome `[THROWN]` with `code=BITRIX_REST_V3_EXCEPTION_VALIDATION_...`
 *   - elapsed `< 2_000`ms
 *
 * **FAIL markers (regression):** `attempts=3`, `exhausted=1`, elapsed `> 5_000`ms.
 */
if (want('A')) {
  await run('A. issue #44 — v3 validation 400 (bad payload)', () =>
    b24.actions.v3.call.make({
      method: 'tasks.task.update',
      params: { wrong: 'shape' }
    })
  )
}

// endregion ---------------------------------------------------------------

// region ---- B. issue #46 — tasks code 1048582 -------------------------
/**
 * **Why:** Issue #46. Calling `tasks.task.pause` on a task that is not in
 * a pauseable state (e.g. already paused / completed / not assigned to
 * the webhook user) returns HTTP 400 with a numeric Bitrix code
 * `1048582` (`"Действие не доступно"`). The code is not in any built-in
 * allowlist, so before PR #45 the SDK retried 3 times (~7s).
 *
 * **What it does:** Calls `tasks.task.pause` twice in a row on
 * `SMOKE_TASK_ID`. At least one of the two calls is expected to hit the
 * "action not available" condition.
 *
 * **PASS markers (per call):**
 *   - `attempts=1`
 *   - if it errors: `not-retryable=1` with `code=1048582 status=400`
 *   - elapsed `< 1_500`ms
 *
 * **FAIL markers (regression):** `attempts=3`, multiple `post/catchError`
 * entries in the log for the same requestId, elapsed `> 5_000`ms.
 *
 * If `SMOKE_TASK_ID` is unset, the scenario is skipped.
 */
if (want('B')) {
  const taskId = Number(process.env.SMOKE_TASK_ID ?? 0)
  if (taskId > 0) {
    await run('B1. issue #46 — pause once', () =>
      b24.actions.v2.call.make({ method: 'tasks.task.pause', params: { taskId } })
    )
    await run('B2. issue #46 — pause again (expect 400 / code 1048582)', () =>
      b24.actions.v2.call.make({ method: 'tasks.task.pause', params: { taskId } })
    )
  } else {
    console.log('\nB. skipped — set SMOKE_TASK_ID=<id> in playgrounds/cli/.env')
  }
}

// endregion ---------------------------------------------------------------

// region ---- D. transient errors still retry (negative control) --------
/**
 * **Why:** PR #45 must not have broken the retry path for genuinely
 * transient failures. A client-side timeout falls under HTTP `408`
 * (`REQUEST_TIMEOUT`) — explicitly excluded from the 4xx fast-fail gate,
 * still governed by `retryOnNetworkError` (default `true`).
 *
 * **What it does:** Lowers the underlying axios timeout to **1 ms** on
 * the v2 HTTP client, then makes a normal `user.current` call. Every
 * attempt aborts before any response can arrive, so the SDK enters the
 * retry loop and burns all `maxRetries` (3) attempts.
 *
 * **PASS markers:** `attempts=3`, outcome `[THROWN]`, `code=REQUEST_TIMEOUT`
 * or `NETWORK_ERROR`, `not-retryable=0`.
 *
 * **FAIL markers (regression):** `attempts=1` (i.e. we accidentally
 * turned 408 into a fast-fail).
 *
 * Note: we restore the timeout right after to keep later scenarios sane.
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

// endregion ---------------------------------------------------------------

// region ---- E. rate-limit still retries (load — log to file) -----------
/**
 * **Why:** Same intent as D — confirm the limiter stack still kicks in
 * for real transient signals (`429` / `503` / `QUERY_LIMIT_EXCEEDED` /
 * `OPERATION_TIME_LIMIT`). PR #45 must not bypass these.
 *
 * **What it does:** Fires `SMOKE_E_TOTAL` (default 500) parallel
 * `user.current` calls. The SDK's internal `RateLimiter` /
 * `AdaptiveDelayer` should pre-throttle (`blocked method`), and if the
 * portal returns `503` / `429`, `RestrictionManager.handleError()`
 * should issue retries with backoff.
 *
 * The console flood is suppressed by the INFO handler — full trace
 * lives in the log file; the summary line shows what matters.
 *
 * **PASS markers:**
 *   - `ok = total` (or close to it)
 *   - `attempts >= total` (≥ means at least one retry happened — that
 *     is the limiter doing its job)
 *   - `rateLimitHits > 0` (some calls were pre-throttled or got 503)
 *   - `not-retryable = 0` (no 4xx leaked through this path)
 *   - `exhausted = 0`
 *
 * **FAIL markers (regression):** `not-retryable > 0` (we zapped 429),
 * or large `failed` count with `code=QUERY_LIMIT_EXCEEDED` (limiter
 * not handling 503).
 */
if (want('E')) {
  const TOTAL = Number(process.env.SMOKE_E_TOTAL ?? 500)
  memHandler.clear()
  const t0 = Date.now()
  console.log(`\n===== E. rate-limit — ${TOTAL} parallel user.current =====`)
  const results = await Promise.allSettled(
    Array.from({ length: TOTAL }, () =>
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
  const rateLimitHits =
    countInMemory('QUERY_LIMIT_EXCEEDED')
    + countInMemory('OPERATION_TIME_LIMIT')
    + countInMemory('blocked method')
  const notRetryable = countInMemory('is not retryable')
  const exhausted = countInMemory('all retry attempts exhausted')

  console.log(
    `[${ok === TOTAL ? 'OK' : 'PARTIAL'}] ${elapsed}ms (avg ${(elapsed / TOTAL).toFixed(1)}ms) | `
    + `ok=${ok}/${TOTAL} | attempts=${attempts} | rateLimitHits=${rateLimitHits} | `
    + `not-retryable=${notRetryable} | exhausted=${exhausted}`
  )
  if (failed.length > 0) {
    console.log('       failures by code:')
    for (const [code, n] of Object.entries(byCode)) {
      console.log(`         ${code}: ${n}`)
    }
  }
}

// endregion ---------------------------------------------------------------

// region ---- final block — flush log + grep recipes --------------------

await new Promise<void>(resolveFlush => fileStream.end(() => resolveFlush()))

console.log(`\nfull trace -> ${LOG_PATH}`)
console.log('analyse with:')
console.log(`  grep -c 'http request attempt'      ${LOG_PATH}    # total attempts across the run`)
console.log(`  grep -c 'is not retryable'          ${LOG_PATH}    # 4xx fast-fail hits (PR #45)`)
console.log(`  grep -c 'all retry attempts exhausted' ${LOG_PATH} # exhausted retries — should be 0 for A/B`)
console.log(`  grep -c 'blocked method'            ${LOG_PATH}    # limiter pre-throttle hits (E)`)
console.log(`  grep    'requestId' ${LOG_PATH} | awk -F'requestId' '{print $2}' | head -5`)

// endregion ---------------------------------------------------------------
