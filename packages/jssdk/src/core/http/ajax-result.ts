import { Type } from '../../tools/type'
import { Text } from '../../tools/text'
import { Result, type IResult } from '../result'
import { AjaxError } from './ajax-error'
import type { NumberString } from '../../types/common'
import type { Payload, PayloadTime } from '../../types/payloads'
import type { TypeCallParams, TypeHttp } from '../../types/http'

/**
 * @todo clear
 * @todo docs
 */
export type AjaxQuery = Readonly<{
  method: string
  params: TypeCallParams
  requestId: string
}>

export type AjaxResultParams<T = unknown> = Readonly<{
  error?: string | { error: string, error_description?: string }
  error_description?: string
  result: T
  next?: NumberString
  total?: NumberString
  time: PayloadTime
}>

type AjaxResultOptions<T> = Readonly<{
  answer: AjaxResultParams<T>
  query: AjaxQuery
  status: number
}>

/**
 * Result of request to Rest Api
 */
export class AjaxResult<T = unknown> extends Result<Payload<T>> implements IResult<Payload<T>> {
  private readonly _status: number
  private readonly _query: AjaxQuery
  protected override _data: AjaxResultParams<T>

  constructor(options: AjaxResultOptions<T>) {
    super()

    this._data = Object.freeze(options.answer)
    this._query = Object.freeze(structuredClone(options.query))
    this._status = options.status

    this.#processErrors()
  }

  #processErrors(): void {
    const { error } = this._data
    if (!error) return

    const errorParams = this.#normalizeError(error)
    this.addError(this.#createAjaxError(errorParams), 'base-error')
  }

  #normalizeError(error: string | { error: string, error_description?: string }): {
    code: string
    description: string
  } {
    return typeof error === 'string'
      ? { code: error, description: this._data.error_description || '' }
      : { code: error.error, description: error.error_description || '' }
  }

  #createAjaxError(params: { code: string, description: string }): AjaxError {
    return new AjaxError({
      code: String(this._status),
      description: params.description,
      status: this._status,
      requestInfo: {
        method: this._query.method,
        // url: '?',
        params: this._query.params
      }
      // request:
    })
  }

  override getData(): Payload<T> {
    return Object.freeze({
      result: this._data.result,
      next: this._data.next,
      total: this._data.total,
      time: this._data.time
    }) as Payload<T>
  }

  /**
   * Alias for isMore
   */
  hasMore(): boolean {
    return this.isMore()
  }

  isMore(): boolean {
    return Type.isNumber(this._data?.next as any)
  }

  getTotal(): number {
    return Text.toInteger(this._data?.total as any)
  }

  getStatus(): number {
    return this._status
  }

  getQuery(): Readonly<AjaxQuery> {
    return this._query
  }

  /**
   * Alias for getNext
   * @param http
   */
  async fetchNext(http: TypeHttp): Promise<AjaxResult<T> | null> {
    const data = await this.getNext(http)
    if (data === false) {
      return null
    }

    return data
  }

  async getNext(http: TypeHttp): Promise<AjaxResult<T> | false> {
    if (!this.isMore() || !this.isSuccess) return false

    const nextPageQuery = this.#buildNextPageQuery()
    return http.call(
      nextPageQuery.method,
      nextPageQuery.params
    ) as Promise<AjaxResult<T>>
  }

  #buildNextPageQuery(): AjaxQuery {
    const result = { ...this._query }
    result.params.start = Text.toInteger(this._data.next)

    return result
  }

  // Immutable API
  override setData(): never {
    throw new ReferenceError('AjaxResult does not allow data modification')
  }
}
