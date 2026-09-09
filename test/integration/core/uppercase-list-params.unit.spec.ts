/**
 * Regression for https://github.com/bitrix24/b24jssdk/issues/483
 *
 * The `restApi:v2` list walkers page by writing their own **lowercase**
 * `filter`, `order` and `start`. Older list methods — `user.get` among them —
 * document their parameters in uppercase, so a caller who follows that method's
 * own documentation writes to a different top-level key than the walker does,
 * and both keys travel in the same body.
 *
 * The portal folds the case and keeps the **later** key. Measured on an
 * on-premise stand with four users, through the SDK:
 *
 * ```text
 * callList user.get FILTER[ID]=4  → n=4 [1,4,5,6]   condition dropped
 * callList user.get filter[ID]=4  → n=1 [4]         condition applied
 * fetchList user.get FILTER[ID]=4 → n=4 [1,4,5,6]   the same hole
 * callList user.get SORT: 'ID'    → throws ERROR_ARGUMENT, "Order must be a string"
 * callList user.get ORDER: 'DESC' → n=4, silently ignored
 * ```
 *
 * and with `curl`, which pins the precedence rather than inferring it:
 *
 * ```text
 * {"FILTER":{"ID":5},"filter":{"ID":4}} → [4]
 * {"filter":{"ID":4},"FILTER":{"ID":5}} → [5]
 * ```
 *
 * Which of the pair ends up later is **not** fixed, which an earlier version of
 * this spec asserted wrongly. Object spread preserves a key's original
 * insertion position, so re-writing `filter` in `{ ...restParams, order, filter,
 * start }` overwrites the value without moving the key. The two shapes
 * therefore fail in opposite directions, and both are pinned below.
 *
 * `*.unit.spec.ts` — no portal required (the axios client is mocked).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { ApiVersion, B24Hook, LoggerFactory, ParamsFactory } from '../../../packages/jssdk/src/'
import { warnOnShadowedUppercaseParams } from '../../../packages/jssdk/src/core/actions/v2/_uppercase-list-params'
import type { LoggerInterface } from '../../../packages/jssdk/src/types/logger'

/**
 * The emitted warnings go through `LoggerFactory.forcedLog`, which is a
 * deliberate no-op under vitest — so capturing the logger would pin nothing.
 * The helper returns what it reported, message included, and that is what these
 * cases assert. The logger is still a real one because the transport calls
 * `debug()` on every request and a partial stub fails there instead of where
 * the test is looking.
 */
function buildLogger(): LoggerInterface {
  return LoggerFactory.createNullLogger()
}

function report(params: Record<string, unknown>, action = 'callList.make') {
  return warnOnShadowedUppercaseParams(action, params, buildLogger())
}

function keysOf(params: Record<string, unknown>, action = 'callList.make'): string[] {
  return report(params, action).map(entry => entry.key)
}

/**
 * The request the walkers actually build, so these cases see the same key order
 * the portal would. Mirrors `{ ...restParams, order, filter, start }`.
 */
function asBuiltRequest(params: Record<string, unknown>): Record<string, unknown> {
  const { order: _ignoredOrder, ...restParams } = params
  return {
    ...restParams,
    order: { ID: 'ASC' },
    filter: { ...((params['filter'] as Record<string, unknown>) || {}), '>ID': 0 },
    start: -1
  }
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

function sentParams(post: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const sent = (post.mock.calls[0]?.[1] ?? {}) as Record<string, unknown>
  return (sent['params'] ?? sent) as Record<string, unknown>
}

describe('uppercase FILTER / SORT / ORDER on the v2 list walkers (#483)', () => {
  describe('warnOnShadowedUppercaseParams', () => {
    it('says nothing for the lowercase shape', () => {
      expect(report(asBuiltRequest({ filter: { ID: 4 }, select: ['ID'] }))).toEqual([])
    })

    it.each([
      ['FILTER', { FILTER: { ID: 4 } }],
      ['SORT', { SORT: 'ID' }],
      ['ORDER', { ORDER: 'DESC' }],
      ['START', { START: 50 }]
    ])('reports %s', (key, params) => {
      const reported = report(asBuiltRequest(params))

      expect(reported.map(entry => entry.key)).toEqual([key])
      expect(reported[0]?.message).toContain(key)
    })

    // The fold the portal applies is on case, not on the specific spelling
    // `FILTER`. A key list of uppercase literals would miss these entirely.
    it.each(['Filter', 'fIlter', 'Order'])('reports the mixed-case %s too', (key) => {
      expect(keysOf(asBuiltRequest({ [key]: { ID: 4 } }))).toEqual([key])
    })

    // The first version composed the message from `key.toLowerCase()` and so
    // told a caller passing `SORT` that the walker "writes the lowercase
    // `sort`". It does not — it writes `order`, and `SORT` collides at one
    // remove by making the method validate that `order`. Caught by running it
    // against a portal, not by reading it.
    it('does not claim the walker writes a lowercase `sort`', () => {
      const [entry] = report(asBuiltRequest({ SORT: 'ID' }))

      expect(entry?.message).not.toContain('`sort`')
      expect(entry?.message).toContain('`ORDER`')
    })

    // A caller who "fixed" the SORT warning by lowercasing the key gets the
    // same ERROR_ARGUMENT with the warning gone — the half-applied-advice trap
    // this rewrite exists to close. The portal folds it; so does the check.
    it.each(['sort', 'Sort', 'sORT'])('reports %s, folded like every other key', (key) => {
      const reported = report(asBuiltRequest({ [key]: 'ID' }))

      expect(reported.map(entry => entry.key)).toEqual([key])
      expect(reported[0]?.message).toContain('ERROR_ARGUMENT')
    })

    // The two messages were first written for `filter` and then reused. Only
    // `filter` carries the cursor and only `filter` is merged, so the other
    // keys must not be told they stall the walk or that they will be merged.
    it('does not tell START that the walk will stall', () => {
      const built = asBuiltRequest({ start: 0, START: 50 })

      expect(Object.keys(built).indexOf('START')).toBeGreaterThan(Object.keys(built).indexOf('start'))

      const [entry] = report(built)

      expect(entry?.key).toBe('START')
      expect(entry?.message).not.toContain('stalled')
      expect(entry?.message).toContain('Remove it')
    })

    it('does not promise ORDER that it will be merged', () => {
      const [entry] = report(asBuiltRequest({ ORDER: 'DESC' }))

      expect(entry?.message).not.toContain('merged')
      expect(entry?.message).toContain('Remove it')
    })

    it('reports every offending key, not only the first', () => {
      expect(keysOf(asBuiltRequest({ FILTER: { ID: 4 }, ORDER: 'DESC', SORT: 'ID' })))
        .toEqual(['FILTER', 'ORDER', 'SORT'])
    })

    // The consequences are different and the caller needs to know which one
    // they are looking at: FILTER is a wrong answer, SORT is a dead request.
    it('names the consequence, and it differs per key', () => {
      const reported = report(asBuiltRequest({ FILTER: { ID: 4 }, SORT: 'ID' }))
      const filterWarning = reported.find(entry => 'FILTER' === entry.key)?.message ?? ''
      const sortWarning = reported.find(entry => 'SORT' === entry.key)?.message ?? ''

      expect(filterWarning).toContain('dropped')
      expect(sortWarning).toContain('ERROR_ARGUMENT')
      expect(filterWarning).not.toBe(sortWarning)
    })

    // The half-migrated shape, which the advice itself leads a caller into:
    // `filter` added, `FILTER` left behind. Now `FILTER` is the later key, so
    // it overwrites the walker's own `>ID` and the walk cannot advance. The
    // warning has to say the opposite of what it says for `FILTER` alone.
    it('inverts the message when the caller key ends up later', () => {
      const built = asBuiltRequest({ filter: { USER_TYPE: 'employee' }, FILTER: { ACTIVE: 'Y' } })

      expect(Object.keys(built)).toEqual(['filter', 'FILTER', 'order', 'start'])

      const [entry] = report(built)

      expect(entry?.key).toBe('FILTER')
      expect(entry?.message).toContain('stalled')
      expect(entry?.message).toContain('remove `FILTER`')
      expect(entry?.message).not.toContain('never takes effect')
    })

    it('keeps the plain message when the caller passes only the uppercase key', () => {
      const built = asBuiltRequest({ FILTER: { ACTIVE: 'Y' } })

      expect(Object.keys(built)).toEqual(['FILTER', 'order', 'filter', 'start'])

      const [entry] = report(built)

      expect(entry?.message).toContain('never takes effect')
      expect(entry?.message).not.toContain('stalled')
    })

    // A key whose value is `undefined` is dropped by JSON body serialization,
    // so the portal never receives it and has nothing to fold. An earlier
    // version used `in` and warned about it — a false positive that told the
    // caller to fix a key that was not causing anything.
    it('says nothing about a key whose value is undefined', () => {
      const built = asBuiltRequest({ FILTER: undefined })

      expect(JSON.stringify(built)).not.toContain('FILTER')
      expect(report(built)).toEqual([])
    })

    // `{ ...params }` copies own enumerable properties only, so an inherited
    // key never reaches the request either.
    it('says nothing about an inherited key', () => {
      const params = Object.create({ FILTER: { ID: 9 } }) as Record<string, unknown>
      params['select'] = ['ID']

      expect(report(asBuiltRequest(params))).toEqual([])
    })

    // The other side of the same rule: there is no collision unless the
    // lowercase counterpart is itself sent. An inherited one is not, so a
    // truthiness test on it would invent a collision that cannot happen.
    it('says nothing when only the lowercase counterpart is inherited', () => {
      const built = Object.create({ filter: { ID: 9 } }) as Record<string, unknown>
      built['FILTER'] = { ACTIVE: 'Y' }

      expect(JSON.stringify(built)).not.toContain('"filter"')
      expect(report(built)).toEqual([])
    })

    it('ignores an unrelated uppercase key', () => {
      expect(report(asBuiltRequest({ IBLOCK_ID: 4, ACTIVE: 'Y' }))).toEqual([])
    })
  })

  describe('through the walkers', () => {
    let b24: B24Hook | null = null

    afterEach(() => {
      vi.restoreAllMocks()
      b24?.destroy()
      b24 = null
    })

    it('callList still sends what it always sent — the warning rewrites nothing', async () => {
      b24 = buildHook()
      const post = vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post')
        .mockResolvedValue(EMPTY_PAGE)

      await b24.actions.v2.callList.make({
        method: 'user.get',
        params: { FILTER: { ID: 4 } },
        idKey: 'ID',
        requestId: 'r-483'
      })

      // `FILTER` still travels, and the cursor still goes into `filter` — which
      // is the combination the portal resolves in the caller's disfavour.
      const params = sentParams(post)
      expect(params['FILTER']).toEqual({ ID: 4 })
      expect(params['filter']).toEqual({ '>ID': 0 })
      expect(Object.keys(params)).toEqual(['FILTER', 'order', 'filter', 'start'])
    })

    // Pins the link between the check and the shipped code path. The warning
    // is emitted through `forcedLog`, which is a no-op under vitest, so the spy
    // goes on `forcedLog` itself — that also pins the routing that makes the
    // warning visible with the default `NullLogger`.
    it.each(['callList', 'fetchList'] as const)(
      '%s warns from the built request, so the half-migrated shape reads as stalled',
      async (walker) => {
        b24 = buildHook()
        vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post').mockResolvedValue(EMPTY_PAGE)
        const forced = vi.spyOn(LoggerFactory, 'forcedLog').mockResolvedValue(undefined)

        const options = {
          method: 'user.get',
          // `filter` first, `FILTER` second: the caller's key ends up later, so
          // it is the cursor that loses, not the caller's conditions. Warning
          // from the caller's params instead of the built request would report
          // the opposite.
          params: { filter: { USER_TYPE: 'employee' }, FILTER: { ACTIVE: 'Y' } },
          idKey: 'ID',
          requestId: 'r-483'
        }

        if ('callList' === walker) {
          await b24.actions.v2.callList.make(options)
        } else {
          for await (const _page of b24.actions.v2.fetchList.make(options)) {
            // one empty page, nothing to collect
          }
        }

        const messages = forced.mock.calls.map(call => String(call[2]))
        const shadowWarning = messages.find(message => message.includes('`FILTER`')) ?? ''

        expect(shadowWarning).toContain(`${walker}.make`)
        expect(shadowWarning).toContain('stalled')
        expect(shadowWarning).not.toContain('never takes effect')
      }
    )

    it('fetchList sends the same shape — it injects the same cursor', async () => {
      b24 = buildHook()
      const post = vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post')
        .mockResolvedValue(EMPTY_PAGE)

      for await (const _page of b24.actions.v2.fetchList.make({
        method: 'user.get',
        params: { FILTER: { ID: 4 } },
        idKey: 'ID',
        requestId: 'r-483'
      })) {
        // one empty page, nothing to collect
      }

      const params = sentParams(post)
      expect(params['FILTER']).toEqual({ ID: 4 })
      expect(params['filter']).toEqual({ '>ID': 0 })
    })

    // The other half of the advice: told to move `FILTER` to `filter`, a caller
    // has to be able to trust that their conditions survive alongside the page
    // condition. Pinned for both walkers — dropping the merge in `fetchList`
    // alone used to go unnoticed.
    it.each(['callList', 'fetchList'] as const)(
      '%s merges a lowercase filter with the cursor rather than replacing it',
      async (walker) => {
        b24 = buildHook()
        const post = vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post')
          .mockResolvedValue(EMPTY_PAGE)

        const options = {
          method: 'user.get',
          params: { filter: { USER_TYPE: 'employee' } },
          idKey: 'ID',
          requestId: 'r-483'
        }

        if ('callList' === walker) {
          await b24.actions.v2.callList.make(options)
        } else {
          for await (const _page of b24.actions.v2.fetchList.make(options)) {
            // one empty page, nothing to collect
          }
        }

        expect(sentParams(post)['filter']).toEqual({ 'USER_TYPE': 'employee', '>ID': 0 })
      }
    )
  })
})
