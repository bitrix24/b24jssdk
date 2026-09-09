/**
 * Regression for https://github.com/bitrix24/b24jssdk/issues/482
 *
 * `AjaxResult.getData()` rebuilds the payload from two named keys, `result` and
 * `time`, so the `restApi:v2` envelope fields `next` and `total` never reach the
 * caller through it. That is deliberate — they have no `restApi:v3` counterpart,
 * and `isMore()` / `getNext()` / `getTotal()` exist to read them — but nothing
 * asserted it, and the omission is invisible from the call site.
 *
 * It reached production. A hand-rolled pagination loop over `user.get` read
 * `data.next` off `getData()`, got `undefined` on the first page, and stopped;
 * the report carried 50 employees instead of all of them and looked right on
 * screen. The typings would have caught it, but the call site had cast the
 * payload to `{ result?: unknown, next?: unknown }` — which is exactly the
 * protection a cast removes.
 *
 * The assertions here are about **key presence**, not value. A `toEqual`
 * comparison and an `expect(x.next).toBeUndefined()` both read an absent key and
 * a key explicitly set to `undefined` the same way, so neither could tell a
 * dropped field from one that was copied across as `undefined`.
 *
 * `*.unit.spec.ts` — no real Bitrix24 portal required (axios is mocked).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { ApiVersion, B24Hook, ParamsFactory } from '../../../packages/jssdk/src/'

const TIME = {
  start: 0,
  finish: 0,
  duration: 0,
  processing: 0,
  date_start: '1970-01-01T00:00:00+00:00',
  date_finish: '1970-01-01T00:00:00+00:00'
}

/** A first page of `user.get`: rows, a next offset, a total, and a time block. */
const PAGED_V2_RESPONSE = {
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {} as never,
  data: {
    result: [{ ID: '1', NAME: 'Ada' }, { ID: '2', NAME: 'Grace' }],
    next: 50,
    total: 137,
    time: TIME
  }
}

function buildHook(): B24Hook {
  return B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/SECRET', {
    restrictionParams: { ...ParamsFactory.getDefault(), retryDelay: 1 }
  })
}

type UserRow = { ID: string, NAME: string }

describe('getData() omits the v2 envelope fields `next` and `total` (#482)', () => {
  let b24: B24Hook | null = null

  afterEach(() => {
    vi.restoreAllMocks()
    b24?.destroy()
    b24 = null
  })

  async function callUserGet() {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post')
      .mockResolvedValue(PAGED_V2_RESPONSE)

    return b24.actions.v2.call.make<UserRow[]>({
      method: 'user.get',
      params: {},
      requestId: 'test@apiV2/user.get'
    })
  }

  it('@apiV2 hands back exactly `result` and `time`', async () => {
    const response = await callUserGet()
    const payload = response.getData()!

    expect(Object.keys(payload).sort()).toEqual(['result', 'time'])
    expect(payload.result).toHaveLength(2)
    expect(payload.time).toEqual(TIME)
  })

  it('@apiV2 does not carry `next` or `total`, as keys at all', async () => {
    const response = await callUserGet()
    const payload = response.getData()!

    // `in`, not a value read: an explicit `next: undefined` would satisfy
    // `toBeUndefined()` while still being a copied field.
    expect('next' in payload).toBe(false)
    expect('total' in payload).toBe(false)
  })

  it('@apiV2 the fields are still reachable — through the readers that exist for them', async () => {
    // The point of the omission is that these are the way in, not that the data
    // is gone. If this ever fails, the JSDoc on `getData()` is sending readers
    // somewhere that no longer works.
    const response = await callUserGet()

    expect(response.isMore()).toBe(true)
    expect(response.hasMore()).toBe(true)
    expect(response.getTotal()).toBe(137)
  })

  it('@apiV2 a page without `next` reports no more rows', async () => {
    b24 = buildHook()
    vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post').mockResolvedValue({
      ...PAGED_V2_RESPONSE,
      data: { result: [{ ID: '3', NAME: 'Edsger' }], total: 137, time: TIME }
    })

    const response = await b24.actions.v2.call.make<UserRow[]>({
      method: 'user.get',
      params: { start: 50 },
      requestId: 'test@apiV2/user.get'
    })

    expect(response.isMore()).toBe(false)
    expect(response.getTotal()).toBe(137)
    expect('next' in response.getData()!).toBe(false)
  })

  it('@apiV2 the payload is frozen, so a caller cannot patch `next` back on', async () => {
    // Relevant to this issue rather than incidental: the first instinct on
    // discovering the omission is to write it back on. It silently does nothing
    // outside strict mode, and every module here is strict.
    const response = await callUserGet()
    const payload = response.getData()!

    expect(Object.isFrozen(payload)).toBe(true)
    expect(() => {
      (payload as unknown as { next?: number }).next = 50
    }).toThrow(TypeError)
  })
})
