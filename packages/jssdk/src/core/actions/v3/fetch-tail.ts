import type { ActionOptions } from '../abstract-action'
import type { TypeCallParams } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { AbstractAction } from '../abstract-action'
import { SdkError } from '../../sdk-error'

export type ActionFetchTailV3 = ActionOptions & {
  method: string
  params?: Omit<TypeCallParams, 'pagination' | 'order' | 'cursor'>
  cursorField?: string
  order?: 'ASC' | 'DESC' | 'asc' | 'desc' | string
  customKeyForResult?: string
  requestId?: string
  limit?: number
  initialValue?: number | string
}

/**
 * Calls a REST API `tail` method (native keyset cursor) and returns an async
 * generator for efficient large data retrieval. `restApi:v3`
 *
 * Unlike `fetchList`, which emulates keyset pagination on top of the `list`
 * action by injecting a `[field, '>', n]` filter, this helper drives the server
 * `tail` action with its native `cursor: { field, value, order, limit }`
 * parameter (see the v3 reference §6.2). The server itself adds `field > value`
 * (asc) / `field < value` (desc) and sorts by `field`, so the cursor field
 * MUST NOT appear in `filter` (the server rejects it with
 * `INVALIDFILTEREXCEPTION`).
 */
export class FetchTailV3 extends AbstractAction {
  /**
   * Streams every record of a `tail` method as chunks, advancing the keyset
   * cursor between requests.
   *
   * @template T - The type of items in the returned arrays (default is `unknown`).
   *
   * @param {ActionFetchTailV3} options - parameters for executing the request.
   *     - `method: string` - A REST API `tail` method name (for example: `main.eventlog.tail`).
   *     - `params?: Omit<TypeCallParams, 'pagination' | 'order' | 'cursor'>` - Request parameters.
   *         Use `filter` and `select` to control the selection. `pagination`, `order` and `cursor`
   *         are managed by this helper and must not be passed. The cursor field must NOT be used in `filter`.
   *     - `cursorField?: string` - The DTO field that drives the cursor. Must be monotonic and
   *         preferably unique, and present in `select`. Default is `id`.
   *     - `order?: 'ASC' | 'DESC'` - Cursor direction. Default is `ASC`. For `DESC` you MUST pass
   *         `initialValue` (the server pages by `field < value`, so the default `0` returns nothing).
   *     - `customKeyForResult?: string` - The key the response groups rows under. Default is `items`.
   *     - `requestId?: string` - Unique request identifier for tracking.
   *     - `limit?: number` - How many records to retrieve at a time. Default is `50`. Maximum is `1000`.
   *     - `initialValue?: number | string` - Cursor start value for the first page. Default is `0`
   *         (valid for ascending numeric fields); required for `DESC` and for non-numeric fields.
   *
   * @returns {AsyncGenerator<T[]>} An async generator that yields chunks of data as arrays of type `T`.
   *
   * @example
   * const generator = b24.actions.v3.fetchTail.make<{ id: string }>({
   *   method: 'main.eventlog.tail',
   *   params: { select: ['id', 'auditType'] },
   *   cursorField: 'id',
   *   customKeyForResult: 'items'
   * })
   * for await (const chunk of generator) {
   *   console.log(`Processing ${chunk.length} items`)
   * }
   */
  public override async* make<T = unknown>(options: ActionFetchTailV3): AsyncGenerator<T[]> {
    const batchSize = options?.limit ?? 50
    const cursorField = options?.cursorField ?? 'id'
    const order = options?.order ?? 'ASC'
    const customKeyForResult = options?.customKeyForResult ?? 'items'
    const params = options?.params ?? {}

    // DESC keyset needs an explicit start: the server pages by `field < value`,
    // so the default first-page value 0 would match nothing for a non-negative
    // field. Require `initialValue` (the type maximum / newest value) for DESC.
    if (/desc/i.test(order) && options?.initialValue === undefined) {
      throw new SdkError({
        code: 'JSSDK_CORE_B24_FETCH_TAIL_DESC_REQUIRES_INITIAL_VALUE',
        description: 'fetchTail.make: order "DESC" requires an explicit `initialValue` (the server pages by `field < value`, so the default 0 returns nothing). Pass `initialValue` set to the type maximum / newest value.',
        status: 500
      })
    }

    // The cursor field cannot also live in `filter` — the server forces ordering
    // and the `> value` condition on it and rejects a duplicate with
    // INVALIDFILTEREXCEPTION. Warn instead of letting the server 400. (Detection
    // covers only the short-form `[field, op, value]` triples the SDK emits.)
    if (Array.isArray(params['filter']) && params['filter'].some((c: any) => Array.isArray(c) && c[0] === cursorField)) {
      this._logger.warning(`fetchTail.make: the cursor field "${cursorField}" must not appear in \`filter\` — the server orders and pages by it and will reject a filter on the same field (INVALIDFILTEREXCEPTION). Remove it from \`filter\`.`)
    }

    // The cursor field must be readable in the response to advance. Append it to
    // an explicit `select`; when `select` is omitted we rely on the server's
    // default field set — warn for a non-default cursorField, which may not be
    // in those defaults (the per-page guard below would otherwise stop silently).
    let select = params['select'] as string[] | undefined
    if (Array.isArray(select)) {
      if (!select.includes(cursorField)) {
        select = [...select, cursorField]
      }
    } else if (cursorField !== 'id') {
      this._logger.warning(`fetchTail.make: no \`select\` provided with a non-default cursorField "${cursorField}" — make sure it is in the server's default field set, otherwise pass \`select\` including "${cursorField}" so the cursor can advance.`)
    }

    const { select: _ignoredSelect, ...restParams } = params as TypeCallParams
    let cursorValue: number | string = options?.initialValue ?? 0
    let maxPageSize = 0
    let isContinue = true
    do {
      const response: AjaxResult<T> = await this._b24.actions.v3.call.make<T>({
        method: options.method,
        params: {
          ...restParams,
          ...(select ? { select } : {}),
          cursor: { field: cursorField, value: cursorValue, order, limit: batchSize }
        },
        requestId: options.requestId
      })

      if (!response.isSuccess) {
        this._logger.error('fetchTailMethod', {
          method: options.method,
          requestId: options.requestId,
          messages: response.getErrorMessages()
        })
        throw new SdkError({
          code: 'JSSDK_CORE_B24_FETCH_TAIL_METHOD_API_V3',
          description: `API Error: ${response.getErrorMessages().join('; ')}`,
          status: 500
        })
      }

      const responseData = response.getData()
      if (!responseData) {
        isContinue = false
        break
      }

      const resultData: T[] = (responseData.result as any)[customKeyForResult] as T[]
      if (resultData.length === 0) {
        isContinue = false
        break
      }

      yield resultData

      // Stop on the largest page seen, not on the requested `limit`: some methods
      // silently cap the page below `limit`, and using `limit` as the end signal
      // would stop after the first capped page. See fetch-list for the rationale.
      maxPageSize = Math.max(maxPageSize, resultData.length)
      if (resultData.length < maxPageSize) {
        isContinue = false
        break
      }

      const lastItem = resultData[resultData.length - 1] as Record<string, any>
      const nextValue = lastItem ? lastItem[cursorField] : undefined
      if (nextValue === undefined || nextValue === null) {
        // A full page came back but the cursor field could not be read from its
        // items — almost always a `cursorField` that is not in the response (not
        // selected, or a wrong name). Without a cursor value we cannot advance.
        this._logger.warning(`fetchTail.make: pagination stops here — no value could be read from the returned items via cursorField "${cursorField}". Make sure cursorField matches a field present in the response (and in \`select\`).`)
        isContinue = false
        break
      }
      cursorValue = nextValue
    } while (isContinue)
  }
}
