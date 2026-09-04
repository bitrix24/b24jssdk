import type { IResult } from '../result'
import type { Payload, PayloadTime, SuccessPayload } from '../../types/payloads'
import type { ValidationDetail } from './parse-error-payload'
import { parseErrorPayload } from './parse-error-payload'
import type { TypeCallParams, TypeHttp } from '../../types/http'
import { Type } from '../../tools/type'
import { Text } from '../../tools/text'
import { Result } from '../result'
import { AjaxError } from './ajax-error'
import { ApiVersion } from '../../types/b24'
import { SdkError } from '../sdk-error'

export type AjaxQuery = Readonly<{
  method: string
  params: TypeCallParams
  requestId: string
}>

type AjaxResultOptions<T> = Readonly<{
  answer: Payload<T>
  query: AjaxQuery
  status: number
  /**
   * An error the caller has already built, used instead of deriving one from
   * `answer`.
   *
   * For the soft-error path in `AbstractHttp`, which has parsed the portal's
   * body, built an `AjaxError` from it, and then needs a `Result` to hand back.
   * Re-deriving there parses the same body twice — and the second pass folds the
   * validation messages onto a description that already contains them, so the
   * text came out doubled (#423). Carrying the error is also simply more honest:
   * it is the error, not a reconstruction of one.
   */
  error?: AjaxError
}>

type ErrorData = {
  code: string
  description: string
  status: number
  validation?: readonly ValidationDetail[]
}

/**
 * Typed result wrapper for a single Bitrix24 REST API response.
 *
 * Extends {@link Result} with the raw HTTP status, the originating query
 * (method, params, requestId), and the deserialized payload. On construction
 * it inspects the payload for API-level error fields and populates the
 * inherited error collection, so callers can branch on {@link isSuccess}
 * without inspecting raw HTTP status codes.
 */
export class AjaxResult<T = unknown> extends Result<Payload<T>> implements IResult<Payload<T>> {
  private readonly _status: number
  private readonly _query: AjaxQuery
  protected override _data: Payload<T> | null | undefined

  constructor(options: AjaxResultOptions<T>) {
    super()

    this._data = options.answer ? Object.freeze(options.answer) : undefined
    this._query = Object.freeze(structuredClone(options.query))
    this._status = options.status

    if (options.error) {
      this.addError(options.error, 'base-error')
    } else {
      this.#processErrors()
    }
  }

  override get isSuccess(): boolean {
    return this.#getIsSuccess()
  }

  /**
   * @todo test this predicate
   */
  #getIsSuccess(): this is { getData: () => SuccessPayload<T> } {
    return this._errors.size === 0
  }

  /**
   * The success payload as `{ result, time }`.
   *
   * A response whose body carries **no `result` key at all** is wrapped: the
   * whole body becomes `result`. Without that the body is simply lost — this
   * method rebuilds the payload from two named keys, so anything else on it is
   * projected away and the caller gets `{ result: undefined, time: undefined }`.
   *
   * That is not hypothetical. `rest.documentation.openapi` answers with the
   * OpenAPI document at the top level — no envelope, no `time` — on every portal
   * measured (an on-premise build, a cloud portal, a cloud sandbox). It is the
   * method our own docs call the source of truth for v3 discovery, and its
   * documented snippet reads `getData()?.result`; the wrap is what makes that
   * snippet true rather than a promise the transport quietly breaks.
   *
   * Done here rather than in the constructor on purpose: `#processErrors()` runs
   * against the raw body and detects an error by its `error` key. Wrapping
   * earlier would hide `error` one level down and turn every error response into
   * a "successful" one. By the time this method runs, `isSuccess` has already
   * been decided.
   *
   * `b24phpsdk` resolves the same problem the same way — `Response.php` moves a
   * body with no `result` key under `result`, naming this very endpoint in its
   * comment.
   */
  override getData(): undefined | SuccessPayload<T> {
    if (!this.isSuccess) {
      return undefined
    }

    const payload = this._data as SuccessPayload<T>

    if (payload && typeof payload === 'object' && !('result' in payload)) {
      return Object.freeze({
        result: payload as unknown as T,
        time: (payload as { time?: PayloadTime }).time
      }) as SuccessPayload<T>
    }

    return Object.freeze({
      result: payload.result,
      time: payload.time
    }) as SuccessPayload<T>
  }

  /**
   * If the response contains error data, we'll restore it to an error.
   *
   * The parsing lives in {@link parseErrorPayload}, shared with
   * `AbstractHttp._convertAxiosErrorToAjaxError()`. It used to be written out
   * here as well, and the two copies had drifted into agreeing on everything
   * except that neither read `validation[].field` (#423).
   */
  #processErrors(): void {
    const parsed = parseErrorPayload(this._data, 'JSSDK_RESPONSE_ERROR', 'Some error in response')
    if (parsed === undefined) {
      return
    }

    this.addError(this.#createAjaxError({
      code: parsed.code,
      description: parsed.description,
      status: this._status,
      validation: parsed.validation
    }), 'base-error')
  }

  #createAjaxError(errorData: ErrorData): AjaxError {
    return new AjaxError({
      code: errorData.code,
      description: errorData.description,
      status: errorData.status,
      validation: errorData.validation,
      requestInfo: {
        method: this._query.method,
        params: this._query.params,
        requestId: this._query.requestId
      }
    })
  }

  /**
   * Alias for {@link AjaxResult.isMore}.
   *
   * `restApi:v2` only — see {@link AjaxResult.isMore} for what this returns on
   * a `restApi:v3` response.
   */
  hasMore(): boolean {
    return this.isMore()
  }

  /**
   * Whether the `restApi:v2` envelope carries a `next` offset — i.e. the portal
   * has more rows for this query.
   *
   * **`restApi:v2` only.** `restApi:v3` returns no `next` field, so this returns
   * `false` on a v3 response — which is not the same statement as "there are no
   * more rows". Do not branch on it for v3; there is nothing to read.
   *
   * This is a reader for a protocol field, not a deprecated API: it stays for as
   * long as `restApi:v2` does, and so does its counterpart
   * {@link AjaxResult.getNext} — the two together are the manual `restApi:v2`
   * paging loop, and neither is going away. For new code prefer the list
   * helpers, which hide the offset bookkeeping and work under both protocol
   * versions:
   *   - `restApi:v2`: `b24.actions.v2.callList.make` or `b24.actions.v2.fetchList.make`
   *   - `restApi:v3`: `b24.actions.v3.callList.make` or `b24.actions.v3.fetchList.make`
   */
  isMore(): boolean {
    if (!this.isSuccess) {
      return false
    }
    const payload = this._data as { next?: number }
    const nextValue = 'next' in payload ? payload.next : undefined

    return Type.isNumber(nextValue)
  }

  /**
   * The row count the `restApi:v2` envelope reports in its `total` field.
   *
   * **`restApi:v2` only.** `restApi:v3` returns no `total`, so this returns `0`
   * on a v3 response — which is not the same statement as "no rows matched".
   * Do not read it for v3; use
   * `b24.actions.v3.aggregate.make` with `count` / `countDistinct` instead,
   * bearing in mind that action is `@experimental` and unverified against a live
   * portal.
   *
   * This is a reader for a protocol field, not a deprecated API. It is the only
   * way to obtain a count under `restApi:v2` — the list helpers iterate without
   * exposing `total`, {@link SuccessPayload} deliberately omits it, and the
   * `aggregate` action exists for `restApi:v3` only. It therefore stays for as
   * long as `restApi:v2` does, and is not part of the `3.0.0` removal set.
   *
   * That is a decision with a trigger, not an open-ended promise. Revisit it
   * when either holds: `b24.actions.v3.aggregate` is verified against a live
   * portal and loses its `@experimental` tag across the common modules (a v3
   * count then exists, and `getTotal()` has a replacement for the first time),
   * or Bitrix24 announces a `restApi:v2` sunset date (the field it reads goes
   * away regardless). Until one of those happens there is nothing to migrate
   * callers to, which is the whole reason it is still here.
   *
   * Note this trigger is specific to the readers. {@link AjaxResult.getNext} and
   * {@link AjaxResult.fetchNext} already have a working replacement, so nothing
   * about `aggregate` maturing changes anything for them — a `restApi:v2` sunset
   * is their only exit condition.
   */
  getTotal(): number {
    if (!this.isSuccess) {
      return 0
    }
    const payload = this._data as { total?: number }
    const totalValue = 'total' in payload ? payload.total : undefined

    return Text.toInteger(totalValue)
  }

  getStatus(): number {
    return this._status
  }

  getQuery(): Readonly<AjaxQuery> {
    return this._query
  }

  /**
   * Alias for {@link AjaxResult.getNext}, returning `null` where that returns
   * `false`.
   *
   * **`restApi:v2` only** — see {@link AjaxResult.getNext}, including the throw
   * on a `restApi:v3` client, which this inherits.
   */
  async fetchNext(http: TypeHttp): Promise<AjaxResult<T> | null> {
    const data = await this.getNext(http)
    if (data === false) {
      return null
    }

    return data
  }

  /**
   * Re-runs this result's own query with `params.start` set to the `next` offset
   * the `restApi:v2` envelope reported, and resolves to the following page.
   * Returns `false` when this result is unsuccessful or has no `next`.
   *
   * `restApi:v2` only, and permanently so. Unlike the readers above, this one
   * acts on the envelope, and `restApi:v3` has no `next` to act on — so it
   * throws rather than silently returning `false`, which would be
   * indistinguishable from "last page". That throw is not a transitional
   * measure; it is the honest answer for a protocol that does not have this
   * operation.
   *
   * For new code prefer `b24.actions.v{2,3}.callList.make` (collect everything)
   * or `b24.actions.v{2,3}.fetchList.make` (async generator, one page per
   * iteration — the same page-by-page control this gives, without the manual
   * offset bookkeeping, and it works under both protocol versions). This method
   * is kept because it works under `restApi:v2` and deleting it would break
   * running code for no gain, not because it is the better tool.
   *
   * @throws {SdkError} `JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3` when called against a `restApi:v3` HTTP client.
   */
  async getNext(http: TypeHttp): Promise<AjaxResult<T> | false> {
    if (http.apiVersion === ApiVersion.v3) {
      throw new SdkError({
        code: 'JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3',
        description: `restApi:v3 not support method getNext`,
        status: 500
      })
    }
    if (
      !this.isSuccess
      || !this.isMore()
    ) {
      return false
    }

    const nextPageQuery = this.#buildNextPageQuery()
    return http.call<T>(
      nextPageQuery.method,
      nextPageQuery.params
    )
  }

  #buildNextPageQuery(): AjaxQuery {
    const payload = this._data as { next?: number }
    const nextValue = 'next' in payload ? payload.next : undefined

    // Fresh params object — the previous shallow `{ ...this._query }` shared the
    // params reference and wrote `start` back into the frozen _query, so the
    // previous result's getQuery().params silently changed after getNext() (#144).
    //
    // `requestId` comes along with the spread but is never used: getNext() reads
    // only `.method` and `.params`, and the http client mints a fresh id per
    // request. Reusing this page's id for the next page would be wrong anyway.
    return {
      ...this._query,
      params: { ...this._query.params, start: Text.toInteger(nextValue) }
    }
  }

  // Immutable API
  override setData(): never {
    throw new ReferenceError('AjaxResult does not allow data modification')
  }
}
