import type { ActionOptions } from '../abstract-action'
import type { TypeCallParams } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { AbstractAction } from '../abstract-action'
import { ApiVersion } from '../../../types/b24'

export type ActionCallV2 = ActionOptions & {
  method: string
  params?: TypeCallParams
  requestId?: string
}

/**
 * Calls the Bitrix24 REST API method `restApi:v2`
 *
 * Executes a single REST API request against the v2 HTTP client and returns the raw response.
 * Unlike `CallListV2`, `FetchListV2`, `BatchV2`, or `BatchByChunkV2`, this class makes exactly
 * one HTTP call and returns the result without any pagination or batching logic.
 */
export class CallV2 extends AbstractAction {
  /**
   * Calls the Bitrix24 REST API method.
   *
   * @template T - The expected data type in the response (default is `unknown`).
   *
   * @param {ActionCallV2} options - parameters for executing the request.
   *     - `method: string` - REST API method name (eg: `crm.item.get`)
   *     - `params?: TypeCallParams` - Parameters for calling the method.
   *     - `requestId?: string` - Unique request identifier for tracking. Used for query deduplication and debugging.
   *
   * @returns {Promise<AjaxResult<T>>} A promise that resolves to the result of an REST API call.
   *
   * @example
   * import { EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'
   *
   * interface CrmItem { id: number, name: string, lastName: string }
   * const response = await b24.actions.v2.call.make<{ item: CrmItem }>({
   *   method: 'crm.item.get',
   *   params: {
   *     entityTypeId: EnumCrmEntityTypeId.contact,
   *     id: 123
   *   },
   *   requestId: 'item-123'
   * })
   * if (!response.isSuccess) {
   *   throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
   * }
   * console.log(response.getData().result.item.name)
   */
  public override async make<T = unknown>(options: ActionCallV2): Promise<AjaxResult<T>> {
    const params = options.params || {}
    return this._b24.getHttpClient(ApiVersion.v2).call<T>(options.method, params, options.requestId)
  }
}
