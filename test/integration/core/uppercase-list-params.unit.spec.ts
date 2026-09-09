/**
 * Regression for https://github.com/bitrix24/b24jssdk/issues/483
 *
 * The `restApi:v2` list walkers page by injecting a cursor into **lowercase**
 * `filter` and `order`. Older list methods — `user.get` among them — document
 * their parameters in uppercase, so a caller who follows that method's own
 * documentation writes to a different top-level key than the walker does.
 *
 * The portal folds the case and keeps the **later** key, and the walkers build
 * their request as `{ ...restParams, order, filter, start }` — the injected one
 * is always later. So the caller's `FILTER` always loses, deterministically.
 *
 * Measured on an on-premise stand with four users, through the SDK:
 *
 * ```text
 * callList user.get FILTER[ID]=4  → n=4 [1,4,5,6]   condition dropped
 * callList user.get filter[ID]=4  → n=1 [4]         condition applied
 * fetchList user.get FILTER[ID]=4 → n=4 [1,4,5,6]   the same hole
 * callList user.get SORT: 'ID'    → throws ERROR_ARGUMENT, "Order must be a string"
 * callList user.get ORDER: 'DESC' → n=4, silently ignored
 * ```
 *
 * and with `curl`, which is what pins the precedence rather than inferring it:
 *
 * ```text
 * {"FILTER":{"ID":5},"filter":{"ID":4}} → [4]
 * {"filter":{"ID":4},"FILTER":{"ID":5}} → [5]
 * ```
 *
 * This spec pins the SDK half: which keys are reported, that the request shape
 * is unchanged by the warning, and that a lowercase `filter` is merged with the
 * cursor rather than replaced by it.
 *
 * `*.unit.spec.ts` — no portal required (the axios client is mocked).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { ApiVersion, B24Hook, LoggerFactory, ParamsFactory } from '../../../packages/jssdk/src/'
import { warnOnShadowedUppercaseParams } from '../../../packages/jssdk/src/core/actions/v2/_uppercase-list-params'
import type { LoggerInterface } from '../../../packages/jssdk/src/types/logger'

/**
 * The null logger with `warning` captured. Built from the real one rather than
 * hand-rolled: the interface has eleven methods, and the transport calls
 * `debug()` on every request — a partial stub fails there instead of where the
 * test is looking.
 */
function buildLogger(warnings: string[]): LoggerInterface {
  const logger = LoggerFactory.createNullLogger()
  logger.warning = async (message: string) => {
    warnings.push(message)
  }
  return logger
}

/** One empty page, so a walk finishes after a single request. */
const EMPTY_PAGE = {
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {} as never,
  data: { result: [], time: {} }
}

function buildHook(): B24Hook {
  return B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/SECRET', {
    restrictionParams: { ...ParamsFactory.getDefault(), retryDelay: 1 }
  })
}

describe('uppercase FILTER / SORT / ORDER on the v2 list walkers (#483)', () => {
  describe('warnOnShadowedUppercaseParams', () => {
    it('says nothing for the lowercase shape', () => {
      const warnings: string[] = []
      const reported = warnOnShadowedUppercaseParams(
        'callList.make',
        { filter: { ID: 4 }, select: ['ID'] },
        buildLogger(warnings)
      )

      expect(reported).toEqual([])
      expect(warnings).toEqual([])
    })

    it.each([
      ['FILTER', { FILTER: { ID: 4 } }],
      ['SORT', { SORT: 'ID' }],
      ['ORDER', { ORDER: 'DESC' }]
    ])('reports %s', (key, params) => {
      const warnings: string[] = []
      const reported = warnOnShadowedUppercaseParams('callList.make', params, buildLogger(warnings))

      expect(reported).toEqual([key])
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain(key)
      expect(warnings[0]).toContain('callList.make')
    })

    // The first version composed the message from `key.toLowerCase()` and so
    // told a caller passing `SORT` that the walker "writes the lowercase
    // `sort`". It does not — it writes `order`, and `SORT` collides at one
    // remove by making the method validate that `order`. Caught by running it
    // against a portal, not by reading it.
    it('does not claim the walker writes a lowercase `sort`', () => {
      const warnings: string[] = []
      warnOnShadowedUppercaseParams('callList.make', { SORT: 'ID' }, buildLogger(warnings))

      expect(warnings[0]).not.toContain('`sort`')
      expect(warnings[0]).toContain('`ORDER`')
    })

    it('reports every offending key, not only the first', () => {
      const warnings: string[] = []
      const reported = warnOnShadowedUppercaseParams(
        'callList.make',
        { FILTER: { ID: 4 }, SORT: 'ID', ORDER: 'DESC' },
        buildLogger(warnings)
      )

      expect(reported).toEqual(['FILTER', 'SORT', 'ORDER'])
      expect(warnings).toHaveLength(3)
    })

    // The three consequences are different and the caller needs to know which
    // one they are looking at: FILTER is a wrong answer, SORT is a dead request.
    it('names the consequence, and it differs per key', () => {
      const warnings: string[] = []
      warnOnShadowedUppercaseParams(
        'callList.make',
        { FILTER: { ID: 4 }, SORT: 'ID' },
        buildLogger(warnings)
      )

      const filterWarning = warnings.find(w => w.includes('`FILTER`')) ?? ''
      const sortWarning = warnings.find(w => w.includes('`SORT`')) ?? ''

      expect(filterWarning).toContain('dropped')
      expect(sortWarning).toContain('ERROR_ARGUMENT')
      expect(filterWarning).not.toBe(sortWarning)
    })

    // A key present but explicitly undefined is still a key the portal receives
    // and case-folds, so `in` is the right test — not truthiness.
    it('reports a key whose value is undefined', () => {
      const warnings: string[] = []
      const reported = warnOnShadowedUppercaseParams(
        'callList.make',
        { FILTER: undefined },
        buildLogger(warnings)
      )

      expect(reported).toEqual(['FILTER'])
    })

    it('ignores an unrelated uppercase key', () => {
      const warnings: string[] = []
      const reported = warnOnShadowedUppercaseParams(
        'callList.make',
        { IBLOCK_ID: 4, ACTIVE: 'Y' },
        buildLogger(warnings)
      )

      expect(reported).toEqual([])
      expect(warnings).toEqual([])
    })
  })

  describe('through the walkers', () => {
    let b24: B24Hook | null = null

    afterEach(() => {
      vi.restoreAllMocks()
      b24?.destroy()
      b24 = null
    })

    it('callList warns, and still sends what it always sent', async () => {
      b24 = buildHook()
      const warnings: string[] = []
      b24.setLogger(buildLogger(warnings))
      const post = vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post')
        .mockResolvedValue(EMPTY_PAGE)

      await b24.actions.v2.callList.make({
        method: 'user.get',
        params: { FILTER: { ID: 4 } } as never,
        idKey: 'ID',
        requestId: 'r-483'
      })

      expect(warnings.some(w => w.includes('`FILTER`'))).toBe(true)

      // The warning is a warning: it does not rewrite the request. `FILTER`
      // still travels, and the cursor still goes into `filter` — which is the
      // combination the portal resolves in the caller's disfavour.
      const sent = (post.mock.calls[0]?.[1] ?? {}) as Record<string, unknown>
      const params = (sent['params'] ?? sent) as Record<string, unknown>
      expect(params['FILTER']).toEqual({ ID: 4 })
      expect(params['filter']).toEqual({ '>ID': 0 })
    })

    it('fetchList warns too — it injects the same cursor', async () => {
      b24 = buildHook()
      const warnings: string[] = []
      b24.setLogger(buildLogger(warnings))
      vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post').mockResolvedValue(EMPTY_PAGE)

      for await (const _page of b24.actions.v2.fetchList.make({
        method: 'user.get',
        params: { FILTER: { ID: 4 } } as never,
        idKey: 'ID',
        requestId: 'r-483'
      })) {
        // one empty page, nothing to collect
      }

      expect(warnings.some(w => w.includes('fetchList.make'))).toBe(true)
      expect(warnings.some(w => w.includes('`FILTER`'))).toBe(true)
    })

    it('a lowercase filter is merged with the cursor, not replaced by it', async () => {
      // The other half of the advice: told to move `FILTER` to `filter`, a
      // caller has to be able to trust that their conditions survive alongside
      // the page condition.
      b24 = buildHook()
      const warnings: string[] = []
      b24.setLogger(buildLogger(warnings))
      const post = vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post')
        .mockResolvedValue(EMPTY_PAGE)

      await b24.actions.v2.callList.make({
        method: 'user.get',
        params: { filter: { USER_TYPE: 'employee' } },
        idKey: 'ID',
        requestId: 'r-483'
      })

      expect(warnings).toEqual([])

      const sent = (post.mock.calls[0]?.[1] ?? {}) as Record<string, unknown>
      const params = (sent['params'] ?? sent) as Record<string, unknown>
      expect(params['filter']).toEqual({ 'USER_TYPE': 'employee', '>ID': 0 })
    })
  })
})
