/**
 * The five `AjaxResult` paging members — `getTotal()`, `isMore()`, `hasMore()`,
 * `getNext()`, `fetchNext()` — were scheduled for removal in `3.0.0` and are not
 * any more. They are **`restApi:v2`-only**, which they always were. See the
 * "AjaxResult paging helpers" section in
 * `docs/content/docs/1.getting-started/3.migration/2.v3.md`.
 *
 * The behaviour that decision rests on is their answer under **`restApi:v3`**,
 * which sends neither `total` nor `next`, and it is deliberately not uniform:
 *
 *   - the readers answer `0` / `false`, because an absent field has an honest
 *     empty value and they cannot see the API version anyway;
 *   - `getNext` / `fetchNext` **throw**, because they can see it (they take an
 *     http client) and because `false` would be indistinguishable from
 *     "last page" — a wrong statement rather than an empty one.
 *
 * Every reader assertion is paired with the v2 case that produces the same value
 * with real data, since the whole risk is confusing "no field" with "no rows".
 *
 * There was no coverage of any of this before: all five were slated for
 * deletion, so nothing pinned them.
 */
import { describe, it, expect } from 'vitest'
import type { TypeHttp } from '../../../packages/jssdk/src/types/http'
import { AjaxResult } from '../../../packages/jssdk/src/core/http/ajax-result'
import { ApiVersion } from '../../../packages/jssdk/src/types/b24'

const QUERY = { method: 'crm.deal.list', params: {}, requestId: 'unit/v2-envelope-readers' }

function v2Result<T>(answer: object) {
  return new AjaxResult<T>({ answer: answer as never, query: QUERY, status: 200 })
}

describe('AjaxResult — restApi:v2 envelope readers', () => {
  describe('getTotal', () => {
    it('reports the v2 envelope total', () => {
      expect(v2Result({ result: [{ ID: '1' }], total: 137, time: {} }).getTotal()).toBe(137)
    })

    it('coerces a string total, as the portal sends it', () => {
      // v2 answers `"total": "137"` for some methods; Text.toInteger is why the
      // documented return type is `number` and not `number | string`.
      expect(v2Result({ result: [], total: '137', time: {} }).getTotal()).toBe(137)
    })

    it('returns 0 on a restApi:v3 response, which sends no total', () => {
      // The documented v3 contract. NOT "no rows matched" — the field is absent.
      expect(v2Result({ result: { items: [{ id: 1 }, { id: 2 }] }, time: {} }).getTotal()).toBe(0)
    })

    it('returns 0 on an unsuccessful result', () => {
      const failed = new AjaxResult({
        answer: { error: 'ERROR_CODE', error_description: 'nope' } as never,
        query: QUERY,
        status: 400
      })
      expect(failed.isSuccess).toBe(false)
      expect(failed.getTotal()).toBe(0)
    })
  })

  describe('isMore / hasMore', () => {
    it('is true when the v2 envelope carries a numeric next', () => {
      const response = v2Result({ result: [{ ID: '1' }], next: 50, total: 137, time: {} })
      expect(response.isMore()).toBe(true)
      expect(response.hasMore()).toBe(true)
    })

    it('is false for a non-numeric next, which is not a page offset', () => {
      // `Type.isNumber` and not a truthy check: a string `next` is not something
      // this can hand to a pagination caller as an offset, so it is not "more".
      // A `Boolean(next)` mutation survives every other case in this file.
      expect(v2Result({ result: [], next: '50', time: {} }).isMore()).toBe(false)
    })

    it('is TRUE for next: 0 — a falsy value that is still a real offset', () => {
      // The case that separates `Type.isNumber(next)` from `Boolean(next)`.
      // Offset 0 is a legitimate value the portal can send; treating it as "no
      // more pages" would silently stop an iteration on its first step.
      expect(v2Result({ result: [], next: 0, time: {} }).isMore()).toBe(true)
    })

    it('is false on the last v2 page, where next is absent', () => {
      expect(v2Result({ result: [{ ID: '1' }], total: 1, time: {} }).isMore()).toBe(false)
    })

    it('returns false on a restApi:v3 response, which sends no next', () => {
      // Same value as "last page", and deliberately so — v3 has nothing to read,
      // which is why the docs say not to branch on this under v3.
      expect(v2Result({ result: { items: [{ id: 1 }] }, time: {} }).isMore()).toBe(false)
    })

    it('hasMore is a pure alias — it never diverges from isMore', () => {
      for (const answer of [
        { result: [], next: 50, time: {} },
        { result: [], time: {} },
        { result: { items: [] }, time: {} }
      ]) {
        const response = v2Result(answer)
        expect(response.hasMore()).toBe(response.isMore())
      }
    })

    it('returns false on an unsuccessful result even when next is present', () => {
      const failed = new AjaxResult({
        answer: { error: 'ERROR_CODE', error_description: 'nope', next: 50 } as never,
        query: QUERY,
        status: 400
      })
      expect(failed.isSuccess).toBe(false)
      expect(failed.isMore()).toBe(false)
    })
  })

  it('none of the three throws under restApi:v3 — unlike getNext, which does', () => {
    // getNext/fetchNext take an http client and throw JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3
    // on v3 (covered below). The readers take nothing and cannot know the API
    // version, so they answer from the payload alone. Both behaviours are
    // deliberate and documented: a reader has an empty value that is honest,
    // while `false` from getNext would be indistinguishable from "last page".
    const v3 = v2Result({ result: { items: [] }, time: {} })
    expect(() => v3.getTotal()).not.toThrow()
    expect(() => v3.isMore()).not.toThrow()
    expect(() => v3.hasMore()).not.toThrow()
  })

  describe('getNext / fetchNext — the acting pair', () => {
    const v3Http = { apiVersion: ApiVersion.v3 } as unknown as TypeHttp
    const v2Http = { apiVersion: ApiVersion.v2 } as unknown as TypeHttp

    it('throws on a restApi:v3 client rather than answering false', async () => {
      // The documented reason: `false` here would read as "last page", which is a
      // different and wrong statement. v3 has no `next` to act on at all.
      const response = v2Result({ result: [{ ID: '1' }], next: 50, time: {} })
      await expect(response.getNext(v3Http)).rejects.toMatchObject({
        code: 'JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3'
      })
      await expect(response.fetchNext(v3Http)).rejects.toMatchObject({
        code: 'JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3'
      })
    })

    it('returns false / null on the last v2 page without touching the client', async () => {
      // No `next`, so there is nothing to fetch — and crucially no request is
      // issued: a v2 client with no `call` would throw if one were.
      const response = v2Result({ result: [{ ID: '1' }], total: 1, time: {} })
      await expect(response.getNext(v2Http)).resolves.toBe(false)
      await expect(response.fetchNext(v2Http)).resolves.toBe(null)
    })

    it('builds the next-page query from the reported offset, without mutating this one', async () => {
      // The one thing getNext actually does. Asserting only that the page comes
      // back proves nothing: a version that dropped `#buildNextPageQuery()` and
      // re-sent the original params unchanged would pass that just as happily.
      const nextPage = v2Result({ result: [{ ID: '2' }], time: {} })
      const seen: Array<{ method: string, params: unknown }> = []
      const http = {
        apiVersion: ApiVersion.v2,
        call: async (method: string, params: unknown) => {
          seen.push({ method, params })
          return nextPage
        }
      } as unknown as TypeHttp

      const response = new AjaxResult<{ ID: string }[]>({
        answer: { result: [{ ID: '1' }], next: 50, time: {} } as never,
        query: { method: 'crm.deal.list', params: { select: ['ID'] }, requestId: QUERY.requestId },
        status: 200
      })

      await expect(response.getNext(http)).resolves.toBe(nextPage)
      expect(seen).toHaveLength(1)
      expect(seen[0]!.method).toBe('crm.deal.list')
      // The offset the envelope reported, coerced — and the caller's own params
      // carried forward rather than replaced.
      expect(seen[0]!.params).toEqual({ select: ['ID'], start: 50 })

      // #144: the previous shallow `{ ...this._query }` shared the params
      // reference, so `start` was written back into the frozen query and this
      // result's own getQuery().params silently changed under the caller.
      expect(response.getQuery().params).toEqual({ select: ['ID'] })
    })

    it('fetchNext returns the same page getNext does', async () => {
      const nextPage = v2Result({ result: [{ ID: '2' }], time: {} })
      const http = {
        apiVersion: ApiVersion.v2,
        call: async () => nextPage
      } as unknown as TypeHttp
      const response = v2Result({ result: [{ ID: '1' }], next: 50, time: {} })
      await expect(response.fetchNext(http)).resolves.toBe(nextPage)
    })

    it('returns false / null for an unsuccessful result carrying a next', async () => {
      // The acting pair's counterpart to the readers' unsuccessful-result case:
      // no request goes out (the fake client has no `call` to reach).
      //
      // Note the `!this.isSuccess` half of getNext's guard is redundant and this
      // case cannot pin it: `isMore()` already returns false for an unsuccessful
      // result, so deleting `!this.isSuccess ||` leaves every test here green.
      // Verified by mutation. Left in place as belt and braces — it states the
      // precondition locally instead of relying on isMore's — but do not read a
      // passing suite as proof that both halves are load-bearing.
      const failed = new AjaxResult({
        answer: { error: 'ERROR_CODE', error_description: 'nope', next: 50 } as never,
        query: QUERY,
        status: 400
      })
      const v2Http = { apiVersion: ApiVersion.v2 } as unknown as TypeHttp
      await expect(failed.getNext(v2Http)).resolves.toBe(false)
      await expect(failed.fetchNext(v2Http)).resolves.toBe(null)
    })
  })
})
