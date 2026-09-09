/**
 * Regression for https://github.com/bitrix24/b24jssdk/issues/484
 *
 * All six keyset walkers page with `while (true)`. #493 added an exit for a
 * cursor that stops moving, which covers the case that issue described as "not
 * hypothetical" — a method ignoring the injected page condition answers with the
 * same page, the same cursor comes back, and the walk now throws
 * `JSSDK_ACTION_CURSOR_STALLED`.
 *
 * It does **not** cover a walk whose cursor advances and never ends: a method
 * with more rows than anyone expected, a filter that matched far more than
 * intended, or the cycling cursor of #495 — `A, B, A, B` never repeats the
 * immediately preceding value, so the stall guard never fires. Every case here
 * therefore uses **advancing** ids, because that is the half that was still
 * unbounded. A test built on repeating ids would pass against `main` for the
 * wrong reason.
 *
 * Three affordances, one loop each on v2 and one shared driver on v3:
 *
 *   - `maxPages` — a ceiling that errors rather than truncating;
 *   - `signal` — an `AbortSignal`, checked at the top of each iteration;
 *   - `progress` — page/row counts for the eager collectors.
 *
 * `*.unit.spec.ts` — no portal required (the axios client is mocked).
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { ApiVersion, B24Hook, ParamsFactory, SdkError } from '../../../packages/jssdk/src/'
import {
  DEFAULT_MAX_PAGES,
  resolveMaxPages
} from '../../../packages/jssdk/src/core/actions/_walk-bounds'

const PAGE_SIZE = 50

/** A page of `PAGE_SIZE` rows whose ids advance, so no stall guard fires. */
function pageAt(offset: number, key = 'ID'): Record<string, unknown>[] {
  return Array.from({ length: PAGE_SIZE }, (_unused, index) => ({
    [key]: String(offset + index + 1)
  }))
}

function v2Response(offset: number) {
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as never,
    data: { result: pageAt(offset), time: {} }
  }
}

function v3Response(offset: number) {
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as never,
    data: { result: { items: pageAt(offset, 'id') }, time: {} }
  }
}

function buildHook(): B24Hook {
  return B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/SECRET', {
    restrictionParams: { ...ParamsFactory.getDefault(), retryDelay: 1 }
  })
}

/**
 * A server that never runs out: every request answers a full page whose ids
 * continue from the last one. This is the shape that had no exit.
 */
function mockEndlessServer(b24: B24Hook, version: ApiVersion) {
  let calls = 0
  const client = b24.getHttpClient(version)
  vi.spyOn(client.ajaxClient, 'post').mockImplementation(async () => {
    const offset = calls * PAGE_SIZE
    calls += 1
    return (ApiVersion.v2 === version ? v2Response(offset) : v3Response(offset)) as never
  })
  return () => calls
}

/**
 * The rejection of a walk, narrowed. `.catch(e => e as SdkError)` leaves the
 * resolved value in the union, so every property read after it is a type error.
 */
async function rejectionOf(promise: Promise<unknown>): Promise<SdkError> {
  const outcome = await promise.then(() => null, (error: unknown) => error)
  expect(outcome).toBeInstanceOf(SdkError)
  return outcome as SdkError
}

describe('bounds on the keyset walkers (#484)', () => {
  let b24: B24Hook | null = null

  afterEach(() => {
    vi.restoreAllMocks()
    b24?.destroy()
    b24 = null
  })

  describe('resolveMaxPages', () => {
    it('falls back to the documented default', () => {
      expect(resolveMaxPages('callList.make', undefined)).toBe(DEFAULT_MAX_PAGES)
      expect(DEFAULT_MAX_PAGES).toBe(10_000)
    })

    it('accepts a positive integer', () => {
      expect(resolveMaxPages('callList.make', 1)).toBe(1)
      expect(resolveMaxPages('callList.make', 250)).toBe(250)
    })

    // `0` would mean "walk nothing", which no caller means, and a fractional
    // ceiling would fire at a page number nobody wrote.
    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('refuses %p', (value) => {
      expect(() => resolveMaxPages('callList.make', value)).toThrow(SdkError)
      try {
        resolveMaxPages('callList.make', value)
      } catch (error) {
        expect((error as SdkError).code).toBe('JSSDK_ACTION_INVALID_MAX_PAGES')
      }
    })
  })

  describe('maxPages', () => {
    it('@apiV2 callList stops an endless walk instead of collecting for ever', async () => {
      b24 = buildHook()
      const calls = mockEndlessServer(b24, ApiVersion.v2)

      const walk = b24.actions.v2.callList.make({
        method: 'user.get',
        idKey: 'ID',
        maxPages: 3,
        requestId: 'r-484'
      })

      await expect(walk).rejects.toThrow(SdkError)
      expect(calls()).toBe(3)
    })

    it('@apiV2 the error names the method and the ceiling, and returns nothing', async () => {
      b24 = buildHook()
      mockEndlessServer(b24, ApiVersion.v2)

      const error = await rejectionOf(b24.actions.v2.callList.make({
        method: 'user.get', idKey: 'ID', maxPages: 2, requestId: 'r-484'
      }))

      expect(error.code).toBe('JSSDK_ACTION_MAX_PAGES_EXCEEDED')
      expect(error.message).toContain('user.get')
      expect(error.message).toContain('2 pages')
      // A short list that looks complete is the failure mode this refuses to
      // produce, so the collected rows are not handed back with the error.
      expect(error.message).toContain('Nothing is returned')
    })

    it('@apiV2 fetchList stops too, having yielded the pages it read', async () => {
      b24 = buildHook()
      mockEndlessServer(b24, ApiVersion.v2)

      const seen: number[] = []
      const walk = async () => {
        for await (const page of b24!.actions.v2.fetchList.make({
          method: 'user.get', idKey: 'ID', maxPages: 3, requestId: 'r-484'
        })) {
          seen.push(page.length)
        }
      }

      await expect(walk()).rejects.toThrow(SdkError)
      expect(seen).toEqual([PAGE_SIZE, PAGE_SIZE, PAGE_SIZE])
    })

    it('@apiV3 the shared driver stops as well', async () => {
      b24 = buildHook()
      const calls = mockEndlessServer(b24, ApiVersion.v3)

      const walk = b24.actions.v3.callList.make({
        method: 'main.eventlog.list',
        customKeyForResult: 'items',
        idKey: 'id',
        maxPages: 4,
        requestId: 'r-484'
      })

      await expect(walk).rejects.toThrow(SdkError)
      expect(calls()).toBe(4)
    })

    it('@apiV3 callTail stops as well — the same driver, the native cursor', async () => {
      b24 = buildHook()
      const calls = mockEndlessServer(b24, ApiVersion.v3)

      const walk = b24.actions.v3.callTail.make({
        method: 'main.eventlog.tail',
        customKeyForResult: 'items',
        cursorField: 'id',
        maxPages: 2,
        requestId: 'r-484'
      })

      await expect(walk).rejects.toThrow(SdkError)
      expect(calls()).toBe(2)
    })

    // The ceiling is checked last, after every cheaper stop, so a walk whose
    // data happens to end on its final allowed page succeeds rather than
    // erroring on the page that completed it.
    it('@apiV2 a walk that ends exactly on its ceiling succeeds', async () => {
      b24 = buildHook()
      let calls = 0
      vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post').mockImplementation(async () => {
        const offset = calls * PAGE_SIZE
        calls += 1
        // Third page is short: end of data, on the last page the ceiling allows.
        return (calls === 3
          ? { status: 200, statusText: 'OK', headers: {}, config: {} as never, data: { result: pageAt(offset).slice(0, 10), time: {} } }
          : v2Response(offset)) as never
      })

      const response = await b24.actions.v2.callList.make({
        method: 'user.get', idKey: 'ID', maxPages: 3, requestId: 'r-484'
      })

      expect(response.isSuccess).toBe(true)
      expect(response.getData()).toHaveLength(PAGE_SIZE * 2 + 10)
      expect(calls).toBe(3)
    })
  })

  describe('signal', () => {
    it('@apiV2 an already-aborted signal costs no request at all', async () => {
      b24 = buildHook()
      const calls = mockEndlessServer(b24, ApiVersion.v2)

      const error = await rejectionOf(b24.actions.v2.callList.make({
        method: 'user.get', idKey: 'ID', signal: AbortSignal.abort(), requestId: 'r-484'
      }))

      expect(error.code).toBe('JSSDK_ACTION_ABORTED')
      expect(error.message).toContain('user.get')
      expect(calls()).toBe(0)
    })

    it('@apiV2 aborting mid-walk stops it', async () => {
      b24 = buildHook()
      const controller = new AbortController()
      const calls = mockEndlessServer(b24, ApiVersion.v2)

      const walk = b24.actions.v2.callList.make({
        method: 'user.get',
        idKey: 'ID',
        signal: controller.signal,
        progress: ({ pages }) => {
          if (pages >= 2) {
            controller.abort()
          }
        },
        requestId: 'r-484'
      })

      await expect(walk).rejects.toThrow(SdkError)
      expect(calls()).toBe(2)
    })

    it('@apiV2 fetchList keeps the pages it already yielded', async () => {
      b24 = buildHook()
      const controller = new AbortController()
      mockEndlessServer(b24, ApiVersion.v2)

      const seen: number[] = []
      const walk = async () => {
        for await (const page of b24!.actions.v2.fetchList.make({
          method: 'user.get', idKey: 'ID', signal: controller.signal, requestId: 'r-484'
        })) {
          seen.push(page.length)
          if (seen.length === 2) {
            controller.abort()
          }
        }
      }

      await expect(walk()).rejects.toThrow(SdkError)
      expect(seen).toEqual([PAGE_SIZE, PAGE_SIZE])
    })

    it('@apiV3 the shared driver honours it too', async () => {
      b24 = buildHook()
      const calls = mockEndlessServer(b24, ApiVersion.v3)

      const error = await rejectionOf(b24.actions.v3.callList.make({
        method: 'main.eventlog.list',
        customKeyForResult: 'items',
        idKey: 'id',
        signal: AbortSignal.abort(),
        requestId: 'r-484'
      }))

      expect(error.code).toBe('JSSDK_ACTION_ABORTED')
      expect(calls()).toBe(0)
    })
  })

  describe('progress', () => {
    it('@apiV2 reports cumulative pages and rows', async () => {
      b24 = buildHook()
      mockEndlessServer(b24, ApiVersion.v2)

      const seen: { pages: number, rows: number }[] = []
      await b24.actions.v2.callList.make({
        method: 'user.get',
        idKey: 'ID',
        maxPages: 3,
        progress: p => seen.push(p),
        requestId: 'r-484'
      }).catch(() => undefined)

      expect(seen).toEqual([
        { pages: 1, rows: 50 },
        { pages: 2, rows: 100 },
        { pages: 3, rows: 150 }
      ])
    })

    it('@apiV2 is not called when the first page is empty', async () => {
      b24 = buildHook()
      vi.spyOn(b24.getHttpClient(ApiVersion.v2).ajaxClient, 'post').mockResolvedValue({
        status: 200, statusText: 'OK', headers: {}, config: {} as never,
        data: { result: [], time: {} }
      })

      const seen: unknown[] = []
      const response = await b24.actions.v2.callList.make({
        method: 'user.get', idKey: 'ID', progress: p => seen.push(p), requestId: 'r-484'
      })

      expect(response.isSuccess).toBe(true)
      expect(seen).toEqual([])
    })

    it('@apiV3 callList reports too', async () => {
      b24 = buildHook()
      mockEndlessServer(b24, ApiVersion.v3)

      const seen: { pages: number, rows: number }[] = []
      await b24.actions.v3.callList.make({
        method: 'main.eventlog.list',
        customKeyForResult: 'items',
        idKey: 'id',
        maxPages: 2,
        progress: p => seen.push(p),
        requestId: 'r-484'
      }).catch(() => undefined)

      expect(seen).toEqual([
        { pages: 1, rows: 50 },
        { pages: 2, rows: 100 }
      ])
    })
  })
})
