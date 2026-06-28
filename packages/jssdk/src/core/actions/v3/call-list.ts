import type { ActionOptions } from '../abstract-action'
import type { TypeCallParams } from '../../../types/http'
import { AbstractAction } from '../abstract-action'
import { Result } from '../../result'
import { keysetPaginate, KeysetPaginationError } from './_keyset-paginate'

export type ActionCallListV3 = ActionOptions & {
  method: string
  params?: Omit<TypeCallParams, 'pagination' | 'order'>
  idKey?: string
  cursorIdKey?: string
  customKeyForResult: string
  requestId?: string
  limit?: number
}

/**
 * Fast data retrieval without counting the total number of records. `restApi:v3`
 *
 * Iterates through all pages of a v3 list method using keyset (cursor) pagination and collects
 * every item into a single array returned as a `Result`. Unlike the v2 counterpart `CallListV2`,
 * it uses v3-style array filter syntax and supports the `limit` option (up to 1000 per page).
 * Unlike `FetchListV3`, which streams pages via an async generator, this class returns the
 * complete dataset in one awaited call.
 */
export class CallListV3 extends AbstractAction {
  /**
   * Fast data retrieval without counting the total number of records.
   *
   * @template T - The type of the elements of the returned array (default is `unknown`).
   *
   * @param {ActionCallListV3} options - parameters for executing the request.
   *     - `method: string` - The name of the REST API method that returns a list of data (for example: `crm.item.list`, `tasks.task.list`)
   *     - `params?: Omit<TypeCallParams, 'pagination' | 'order'>` - Request parameters, excluding the `pagination` and `order` parameters,
   *         since the method is designed to obtain all data in one call.
   *         Note: Use `filter`, `order`, and `select` to control the selection.
   *     - `idKey?: string` - The name of the id field as it appears in each RESPONSE item; its value
   *         drives the cursor. Default is 'id'. Set it to match the id field the method returns.
   *     - `cursorIdKey?: string` - The field name used in the REQUEST for `order` and the
   *         `[field, '>', n]` page filter. Defaults to `idKey`. Set it only when the sortable /
   *         filterable field name differs from the response field name (e.g. an uppercase request
   *         field but a lowercase response id): pass `idKey: 'id', cursorIdKey: 'ID'`.
   *     - `customKeyForResult: string` - A custom key indicating that the response REST API will be
   *        grouped by this field.
   *        Example: `items` to group a list of CRM items.
   *    - `requestId?: string` - Unique request identifier for tracking. Used for query deduplication and debugging.
   *    - `limit?: number` - How many records to retrieve at a time. Default is `50`. Maximum is `1000`.
   *
   * @returns {Promise<Result<T[]>>} A promise that resolves to the result of an REST API call.
   *
   * @example
   * import { Text } from '@bitrix24/b24jssdk'
   *
   * interface MainEventLogItem { id: number, userId: number }
   * const sixMonthAgo = new Date()
   * sixMonthAgo.setMonth((new Date()).getMonth() - 6)
   * sixMonthAgo.setHours(0, 0, 0)
   * const response = await b24.actions.v3.callList.make<MainEventLogItem>({
   *   method: 'main.eventlog.list',
   *   params: {
   *     filter: [
   *       ['timestampX', '>=', Text.toB24Format(sixMonthAgo)] // created at least 6 months ago
   *     ],
   *     select: ['id', 'userId']
   *   },
   *   idKey: 'id',
   *   customKeyForResult: 'items',
   *   requestId: 'eventlog-123',
   *   limit: 60
   * })
   * if (!response.isSuccess) {
   *   throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
   * }
   * const list = response.getData()
   * console.log(`Result: ${list?.length}`) // Number of items received
   */
  public override async make<T = unknown>(options: ActionCallListV3): Promise<Result<T[]>> {
    const batchSize = options?.limit ?? 50
    const result: Result<T[]> = new Result()

    const idKey = options?.idKey ?? 'id'
    const cursorIdKey = options?.cursorIdKey ?? idKey
    const customKeyForResult = options?.customKeyForResult ?? null
    const params = options?.params ?? {}

    // Warn and strip user-provided `order` — cursor pagination requires ordering by cursorIdKey only
    if ('order' in params && params['order']) {
      this._logger.warning('callList.make: user-provided `order` parameter is ignored because cursor-based pagination requires ordering by cursorIdKey. Use `filter` to narrow results instead.')
    }

    const { order: _ignoredOrder, ...restParams } = params as TypeCallParams
    const requestParams: TypeCallParams = {
      ...restParams,
      order: { [cursorIdKey]: 'ASC' },
      filter: [...(params['filter'] || [])],
      pagination: { page: 0, limit: batchSize }
    }

    const allItems: T[] = []
    try {
      for await (const page of keysetPaginate<T>(this._b24, this._logger, {
        method: options.method,
        requestId: options.requestId,
        customKeyForResult,
        initialCursor: 0,
        // Emulated keyset: append the `[cursorIdKey, '>', cursor]` page filter.
        buildParams: cursor => ({ ...requestParams, filter: [...requestParams.filter, [cursorIdKey, '>', cursor]] }),
        // Advance by the numeric id read from the last item via `idKey`. A
        // non-numeric value (almost always an `idKey` that doesn't match the
        // response field — e.g. sorting by `ID` while the response carries a
        // lowercase `id`) stops the walk instead of silently truncating.
        readNextCursor: (lastItem) => {
          const value = Number.parseInt(lastItem[idKey], 10)
          return Number.isFinite(value) ? value : null
        },
        noCursorWarning: `callList.make: pagination stops here — no numeric id could be read from the returned items via idKey "${idKey}". Make sure idKey matches the id field in the response; if the sortable field name differs from it, also set cursorIdKey (e.g. idKey: 'id', cursorIdKey: 'ID').`,
        errorLabel: 'callFastListMethod'
      })) {
        for (const item of page) {
          allItems.push(item)
        }
      }
    } catch (error) {
      if (error instanceof KeysetPaginationError) {
        for (const [index, err] of error.errors) {
          result.addError(err, index)
        }
      } else {
        throw error
      }
    }

    return result.setData(allItems)
  }
}
