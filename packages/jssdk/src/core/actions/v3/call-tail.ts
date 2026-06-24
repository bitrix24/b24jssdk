import type { ActionOptions } from '../abstract-action'
import type { TypeCallParams } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { AbstractAction } from '../abstract-action'
import { Result } from '../../result'

export type ActionCallTailV3 = ActionOptions & {
  method: string
  params?: Omit<TypeCallParams, 'pagination' | 'order' | 'cursor'>
  cursorField?: string
  order?: 'ASC' | 'DESC' | 'asc' | 'desc' | string
  customKeyForResult: string
  requestId?: string
  limit?: number
  initialValue?: number | string
}

/**
 * Fast data retrieval via the native `tail` (keyset cursor) action, without
 * counting the total number of records. `restApi:v3`
 *
 * The eager counterpart of `fetchTail`: it walks the same native
 * `cursor: { field, value, order, limit }` pagination and returns every record
 * as a single array. See the v3 reference §6.2. The cursor field MUST NOT appear
 * in `filter`.
 */
export class CallTailV3 extends AbstractAction {
  /**
   * Returns every record of a `tail` method as one array.
   *
   * @template T - The type of the elements of the returned array (default is `unknown`).
   *
   * @param {ActionCallTailV3} options - parameters for executing the request.
   *     - `method: string` - A REST API `tail` method name (for example: `main.eventlog.tail`).
   *     - `params?: Omit<TypeCallParams, 'pagination' | 'order' | 'cursor'>` - Request parameters
   *         (`filter`, `select`). `pagination`, `order` and `cursor` are managed by this helper.
   *         The cursor field must NOT be used in `filter`.
   *     - `cursorField?: string` - The DTO field that drives the cursor. Default is `id`.
   *     - `order?: 'ASC' | 'DESC'` - Cursor direction. Default is `ASC`.
   *     - `customKeyForResult: string` - The key the response groups rows under (for example `items`).
   *     - `requestId?: string` - Unique request identifier for tracking.
   *     - `limit?: number` - How many records to retrieve at a time. Default is `50`. Maximum is `1000`.
   *     - `initialValue?: number | string` - Cursor start value for the first page. Default is `0`.
   *
   * @returns {Promise<Result<T[]>>} A promise that resolves to the result of an REST API call.
   *
   * @example
   * const response = await b24.actions.v3.callTail.make<{ id: string }>({
   *   method: 'main.eventlog.tail',
   *   params: { select: ['id', 'auditType'] },
   *   cursorField: 'id',
   *   customKeyForResult: 'items'
   * })
   * if (!response.isSuccess) {
   *   throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
   * }
   * console.log(`Result: ${response.getData()?.length}`)
   */
  public override async make<T = unknown>(options: ActionCallTailV3): Promise<Result<T[]>> {
    const batchSize = options?.limit ?? 50
    const result: Result<T[]> = new Result()

    const cursorField = options?.cursorField ?? 'id'
    const order = options?.order ?? 'ASC'
    const customKeyForResult = options?.customKeyForResult ?? null
    const params = options?.params ?? {}

    if (Array.isArray(params['filter']) && params['filter'].some((c: any) => Array.isArray(c) && c[0] === cursorField)) {
      this._logger.warning(`callTail.make: the cursor field "${cursorField}" must not appear in \`filter\` — the server orders and pages by it and will reject a filter on the same field (INVALIDFILTEREXCEPTION). Remove it from \`filter\`.`)
    }

    let select = params['select'] as string[] | undefined
    if (Array.isArray(select) && !select.includes(cursorField)) {
      select = [...select, cursorField]
    }

    const { ...restParams } = params as TypeCallParams
    let allItems: T[] = []
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
        this._logger.error('callTailMethod', {
          method: options.method,
          requestId: options.requestId,
          messages: response.getErrorMessages()
        })
        for (const [index, error] of response.errors) {
          result.addError(error, index)
        }
        isContinue = false
        break
      }

      const responseData = response.getData()
      if (!responseData) {
        isContinue = false
        break
      }

      const resultData = (responseData.result as any)[customKeyForResult] as T[]
      if (resultData.length === 0) {
        isContinue = false
        break
      }

      allItems = [...allItems, ...resultData]

      maxPageSize = Math.max(maxPageSize, resultData.length)
      if (resultData.length < maxPageSize) {
        isContinue = false
        break
      }

      const lastItem = resultData[resultData.length - 1] as Record<string, any>
      const nextValue = lastItem ? lastItem[cursorField] : undefined
      if (nextValue === undefined || nextValue === null) {
        this._logger.warning(`callTail.make: pagination stops here — no value could be read from the returned items via cursorField "${cursorField}". Make sure cursorField matches a field present in the response (and in \`select\`).`)
        isContinue = false
        break
      }
      cursorValue = nextValue
    } while (isContinue)

    return result.setData(allItems)
  }
}
