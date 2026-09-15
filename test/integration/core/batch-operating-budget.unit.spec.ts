/**
 * Which operating budget a batch spends against (#459).
 *
 * Measured on a live portal, and it is not what the SDK modelled. Bitrix24 keys
 * the operating budget on the triple (auth type, credential, **method**) and
 * charges a batch to the method `batch`: with `batch` standing at `1.228`,
 * `tasks.task.list` read `0` at the same moment, on both API versions. The
 * methods inside a batch are not billed individually.
 *
 * The SDK used to keep the opposite model. `restApi:v2` batch processing fed
 * every sub-result's `time` into `updateStats('batch::<method>', …)`, and the
 * limiter read only those synthetic keys. Two things were wrong with that:
 *
 * - the number is not per-command. All fifty sub-results of a batch carry the
 *   same `operating` — the sum accumulated within the request so far, frozen at
 *   whatever the one command that crossed the portal's 0.1 s floor put there. So
 *   the batch-wide figure was written into a separate bucket for each method;
 * - the real `batch` entry, recorded from the envelope by the ordinary response
 *   path, was written on every batch call and **never read**.
 *
 * Net effect: the SDK tracked a budget the portal does not keep and ignored the
 * one it does. These cases pin the corrected model.
 *
 * **This reaches `restApi:v3` as well, and deliberately.** Only the v2 processing
 * file and the limiter changed — v3's batch processing is untouched, and it
 * never fed the synthetic keys in the first place. But both versions issue their
 * batch as `call('batch', …)`, so both have always had a real `batch` entry
 * recorded from the envelope, and reading it means a v3 batch is now subject to
 * the operating budget where before it was subject to nothing. That is the
 * portal's own accounting in both cases; the alternative would be to leave v3
 * knowingly unthrottled, and the limiter has no notion of API version to
 * condition on.
 *
 * `*.unit.spec.ts` — no portal required.
 */
import { describe, it, expect, vi } from 'vitest'
import { HttpV2 } from '../../../packages/jssdk/src/core/http/v2'
import { HttpV3 } from '../../../packages/jssdk/src/core/http/v3'
import { AjaxResult } from '../../../packages/jssdk/src/core/http/ajax-result'
import type { AuthActions } from '../../../packages/jssdk/src/types/auth'
import type { BatchCommandsArrayUniversal } from '../../../packages/jssdk/src/types/http'
import { OperatingLimiter } from '../../../packages/jssdk/src/core/http/limiters/operating-limiter'
import { RestrictionManager } from '../../../packages/jssdk/src/core/http/limiters/manager'
import { AdaptiveDelayer } from '../../../packages/jssdk/src/core/http/limiters/adaptive-delayer'
import { ParamsFactory } from '../../../packages/jssdk/src/core/http/limiters/params-factory'
import type { PayloadTime } from '../../../packages/jssdk/src/types/payloads'

const CONFIG = ParamsFactory.getDefault().operatingLimit!

/** A `time` block carrying an operating figure, in the portal's seconds. */
function timeBlock(operatingSeconds: number, resetInSeconds = 300): PayloadTime {
  return {
    start: 0,
    finish: 0,
    duration: 0,
    processing: 0,
    date_start: '' as never,
    date_finish: '' as never,
    operating: operatingSeconds,
    operating_reset_at: Math.floor((Date.now() + resetInSeconds * 1_000) / 1_000)
  }
}

/** Past the `limitMs - 5000` threshold the limiter blocks on. */
const EXHAUSTED_SECONDS = CONFIG.limitMs / 1_000

function build(): OperatingLimiter {
  return new OperatingLimiter(CONFIG)
}

describe('a batch spends the `batch` budget', () => {
  it('is delayed once the `batch` budget is exhausted', async () => {
    const limiter = build()
    await limiter.updateStats('unit', 'batch', timeBlock(EXHAUSTED_SECONDS))

    const wait = await limiter.getTimeToFree('unit', 'batch', { cmd: ['tasks.task.list'] })

    // Was 0 before: the old code looked only at `batch::<method>` keys, which
    // this walk never wrote, so an exhausted batch budget delayed nothing.
    expect(wait).toBeGreaterThan(0)
  })

  it('reports the batch budget under `batch`, not under the methods inside it', async () => {
    const limiter = build()
    await limiter.updateStats('unit', 'batch', timeBlock(2))

    expect(limiter.getMethodStat('batch')?.operating).toBe(2_000)
    expect(limiter.getMethodStat('batch::tasks.task.list')).toBeUndefined()
    expect(limiter.getMethodStat('tasks.task.list')).toBeUndefined()
  })

  it('does not let batch traffic delay the same method called on its own', async () => {
    const limiter = build()
    await limiter.updateStats('unit', 'batch', timeBlock(EXHAUSTED_SECONDS))

    // The portal bills these separately, so exhausting one must not block the
    // other — that is the whole point of the budget being per method.
    const wait = await limiter.getTimeToFree('unit', 'tasks.task.list')

    expect(wait).toBe(0)
  })

  it('does not let a single method delay a batch', async () => {
    const limiter = build()
    await limiter.updateStats('unit', 'tasks.task.list', timeBlock(EXHAUSTED_SECONDS))

    const wait = await limiter.getTimeToFree('unit', 'batch', { cmd: ['tasks.task.list'] })

    expect(wait).toBe(0)
  })

  // The other blocking outcome of the rewired function: a budget that is spent
  // but whose reset has already passed. Reachable for `batch` for the first time
  // now that it goes through the ordinary lookup.
  it('falls back to a short wait when the reset has already lapsed', async () => {
    const limiter = build()
    await limiter.updateStats('unit', 'batch', timeBlock(EXHAUSTED_SECONDS, -60))

    const wait = await limiter.getTimeToFree('unit', 'batch')

    expect(wait).toBe(5_000)
  })

  it('treats `batch` like any other method — no special routing left', async () => {
    const limiter = build()
    await limiter.updateStats('unit', 'batch', timeBlock(EXHAUSTED_SECONDS))

    // Same answer with and without a command list: nothing reads `params` now.
    const withCmd = await limiter.getTimeToFree('unit', 'batch', { cmd: ['a.b', 'c.d'] })
    const withoutCmd = await limiter.getTimeToFree('unit', 'batch')

    expect(withoutCmd).toBe(withCmd)
    expect(withoutCmd).toBeGreaterThan(0)
  })
})

describe('the adaptive delay follows the same budget', () => {
  const ADAPTIVE = ParamsFactory.getDefault().adaptiveConfig!

  /**
   * `AdaptiveDelayer` had the same shape of special case as the limiter: it fanned
   * out over a batch's command list and read `batch::<method>` statistics. Left
   * alone it would have quietly stopped delaying batches altogether once those
   * keys were no longer written, which is the regression these cases exist to
   * catch.
   */
  function pair(): { limiter: OperatingLimiter, delayer: AdaptiveDelayer } {
    const limiter = build()
    return { limiter, delayer: new AdaptiveDelayer(ADAPTIVE, limiter) }
  }

  it('delays a batch once the `batch` budget is past the threshold', async () => {
    const { limiter, delayer } = pair()
    await limiter.updateStats('unit', 'batch', timeBlock(EXHAUSTED_SECONDS))

    const delay = await delayer.waitIfNeeded('unit', 'batch', { cmd: ['tasks.task.list'] })

    expect(delay).toBeGreaterThan(0)
  })

  it('does not delay a batch on a method budget it is not billed against', async () => {
    const { limiter, delayer } = pair()
    await limiter.updateStats('unit', 'tasks.task.list', timeBlock(EXHAUSTED_SECONDS))

    const delay = await delayer.waitIfNeeded('unit', 'batch', { cmd: ['tasks.task.list'] })

    expect(delay).toBe(0)
  })

  it('needs no command list to decide', async () => {
    const { limiter, delayer } = pair()
    await limiter.updateStats('unit', 'batch', timeBlock(EXHAUSTED_SECONDS))

    const withCmd = await delayer.waitIfNeeded('unit', 'batch', { cmd: ['a.b'] })
    const withoutCmd = await delayer.waitIfNeeded('unit', 'batch')

    expect(withoutCmd).toBe(withCmd)
    // Anchored, or the case would pass with both sides at zero — which is
    // exactly what restoring the old command-list fan-out produces.
    expect(withoutCmd).toBeGreaterThan(0)
  })
})

describe('the v2 batch path stops inventing per-sub-method budgets', () => {
  /**
   * A two-command v2 batch envelope. Both sub-results carry the *same*
   * `operating`, which is what a portal really sends — the running sum, not each
   * command's own cost.
   */
  function envelope(): AjaxResult<any> {
    const shared = timeBlock(1.228)
    return new AjaxResult({
      answer: {
        result: {
          result: { 0: { ok: 1 }, 1: { ok: 2 } },
          result_error: {},
          result_time: { 0: shared, 1: shared },
          result_total: {},
          result_next: {}
        },
        time: shared
      },
      query: { method: 'batch', params: {}, requestId: 'r-459' },
      status: 200
    }) as AjaxResult<any>
  }

  const calls: BatchCommandsArrayUniversal = [
    ['tasks.task.list', {}],
    ['crm.item.list', { entityTypeId: 2 }]
  ]

  it('writes no `batch::<method>` statistics', async () => {
    const http = new HttpV2({} as unknown as AuthActions, null, {})
    ;(http as any).call = vi.fn().mockResolvedValue(envelope())
    const updateStats = vi.spyOn((http as any)._restrictionManager, 'updateStats')

    await http.batch(calls, { isHaltOnError: false })

    const keys = updateStats.mock.calls.map(c => c[1])
    expect(keys.filter(k => String(k).startsWith('batch::'))).toEqual([])
    // And nothing was attributed to the sub-methods under their own names
    // either — the portal bills those separately and a batch does not touch them.
    expect(keys).not.toContain('tasks.task.list')
    expect(keys).not.toContain('crm.item.list')
  })

  it('still hands the `time` block to the caller on every sub-result', async () => {
    const http = new HttpV2({} as unknown as AuthActions, null, {})
    ;(http as any).call = vi.fn().mockResolvedValue(envelope())

    const response = await http.batch(calls, { isHaltOnError: false })
    const rows = [...(response.getData()!.result as Map<any, AjaxResult<any>>).values()]

    // The limiter stopped believing this number; the caller still receives it.
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.getData()?.time?.operating).toBe(1.228)
    }
  })
})

describe('the retry backoff after an operating-limit refusal', () => {
  /**
   * A second path the same change reaches, and worth pinning separately: it is
   * error handling, not the pre-flight wait.
   *
   * `RestrictionManager.handleError` floors an operating-limit wait at 10 s and
   * otherwise asks `OperatingLimiter.getTimeToFree`. For a batch that used to
   * answer 0 — the old special case bailed out unless it found a v2-shaped
   * command list, and a v3 batch never carries one — so the retry happened after
   * a flat 10 seconds, back into a bucket that was still locked. It now waits
   * for the reset the portal reported.
   */
  it('waits for the reset rather than the 10-second floor once `batch` is exhausted', async () => {
    const manager = new RestrictionManager(ParamsFactory.getDefault())
    await manager.updateStats('unit', 'batch', timeBlock(EXHAUSTED_SECONDS, 300))

    const wait = await manager.handleError('unit', 'batch', {}, { message: '', code: 'OPERATION_TIME_LIMIT', status: 429 }, 0)

    // ~5 minutes of reset, not the floor.
    expect(wait).toBeGreaterThan(60_000)
  })

  it('still floors at 10 seconds when nothing is known about the budget', async () => {
    const manager = new RestrictionManager(ParamsFactory.getDefault())

    const wait = await manager.handleError('unit', 'batch', {}, { message: '', code: 'OPERATION_TIME_LIMIT', status: 429 }, 0)

    expect(wait).toBe(10_000)
  })
})

describe('the other half of the model: the `batch` entry gets recorded', () => {
  /**
   * Everything above tests that the limiter *reads* `batch`. Nothing tested that
   * anything *writes* it — the limiter cases feed `updateStats` by hand, and the
   * `HttpV2` cases stub `call`, which is the very method that records it. So if
   * `_createAjaxResultFromResponse` ever stopped writing the entry, batches would
   * silently go back to being unthrottled and this suite would stay green: the
   * regression #459 is about, arriving from the other end.
   *
   * This drives the real recording path instead, for both API versions.
   */
  it.each([
    ['v2', HttpV2],
    ['v3', HttpV3]
  ] as const)('%s records the batch envelope under `batch`', async (_label, Http) => {
    const http = new Http({} as unknown as AuthActions, null, {}) as any

    const envelopeResponse = {
      payload: { result: { result: {} }, time: timeBlock(2) },
      status: 200
    }
    await http._createAjaxResultFromResponse(envelopeResponse, 'r-459', 'batch', {})

    const stats = http._restrictionManager.getStats().operatingStats
    expect(stats).toHaveProperty('batch')
    expect(Object.keys(stats)).toEqual(['batch'])
  })
})
