import type { ActionOptions } from '../abstract-action'
import type { TypeCallParams } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { AbstractAction } from '../abstract-action'
import { versionManager } from '../../version-manager'
import { ApiVersion } from '../../../types/b24'
import { LoggerFactory } from '../../../logger'

export type ActionCallV2 = ActionOptions & {
  method: string
  params?: TypeCallParams
  requestId?: string
}

/**
 * Calls the Bitrix24 REST API method `restApi:v2`
 *
 * @todo add docs
 * @todo test example
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
   * interface CrmItem { id: number, name: string, lastName: string }
   * const response = await b24.actions.v2.call.make<{ item: CrmItem }>({
   *   method: 'crm.item.get',
   *   params: { entityTypeId: 3, id: 123 },
   *   requestId: 'item-123'
   * })
   * if (!response.isSuccess) {
   *   throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
   * }
   * console.log(response.getData().result.item.name)
   */
  public override async make<T = unknown>(options: ActionCallV2): Promise<AjaxResult<T>> {
    if (versionManager.isSupport(ApiVersion.v3, options.method)) {
      LoggerFactory.forcedLog(
        this._logger,
        'warning',
        `The method ${options.method} is available in restApi:v3. It's worth migrating to the new API.`,
        {
          method: options.method,
          requestId: options.requestId,
          code: 'JSSDK_CORE_METHOD_AVAILABLE_IN_API_V3'
        }
      )
    }

    const params = options.params || {}
    return this._b24.getHttpClient(ApiVersion.v2).call<T>(options.method, params, options.requestId)
  }
}
