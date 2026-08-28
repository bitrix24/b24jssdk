/**
 * `AjaxResult.getTotal()` / `isMore()` / `hasMore()` are **`restApi:v2` envelope
 * readers**, kept past `3.0.0` rather than removed with the rest of the legacy
 * surface (`getNext` / `fetchNext` do go). See the "AjaxResult paging helpers"
 * table in `docs/content/docs/1.getting-started/3.migration/2.v3.md`.
 *
 * The behaviour that decision rests on is their answer to a **`restApi:v3`**
 * response, which carries neither `total` nor `next`. It has to be a defined,
 * documented value rather than a throw or `undefined`, because the documentation
 * now tells readers exactly what they get — and it has to be distinguishable in
 * intent from the same value meaning "zero rows", which is why every assertion
 * here is paired with the v2 case that produces the same shape with real data.
 *
 * There was no coverage of any of this before: the three methods were slated for
 * deletion, so nothing pinned them.
 */
import { describe, it, expect } from 'vitest'
import { AjaxResult } from '../../../packages/jssdk/src/core/http/ajax-result'

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
    // on v3. The readers take nothing and cannot know the API version, so they
    // answer from the payload alone. That difference is the whole reason the two
    // groups are treated differently in 3.0.0.
    const v3 = v2Result({ result: { items: [] }, time: {} })
    expect(() => v3.getTotal()).not.toThrow()
    expect(() => v3.isMore()).not.toThrow()
    expect(() => v3.hasMore()).not.toThrow()
  })
})
