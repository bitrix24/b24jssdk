import type { ActionOptions } from '../abstract-action'
import type { TypeCallParams } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { AbstractAction } from '../abstract-action'
import { versionManager } from '../../version-manager'
import { ApiVersion } from '../../../types/b24'
import { SdkError } from '../../sdk-error'

export type ActionCallV3 = ActionOptions & {
  method: string
  params?: TypeCallParams
  requestId?: string
}

/**
 * Calls the Bitrix24 REST API method `restApi:v3`
 *
 * @todo add docs
 */
export class CallV3 extends AbstractAction {
  /**
   * Calls the Bitrix24 REST API method.
   *
   * @template T - The expected data type in the response (default is `unknown`).
   *
   * @param {ActionCallV3} options - parameters for executing the request.
   *     - `method: string` - REST API method name (eg: `crm.item.get`)
   *     - `params?: TypeCallParams` - Parameters for calling the method.
   *     - `requestId?: string` - Unique request identifier for tracking. Used for query deduplication and debugging.
   *
   * @returns {Promise<AjaxResult<T>>} A promise that resolves to the result of an REST API call.
   *
   * @example
   * interface TaskItem { id: number, title: string }
   * const response = await b24.actions.v3.call.make<{ item: TaskItem }>({
   *   method: 'tasks.task.get',
   *   params: { id: 123, select: ['id', 'title'] },
   *   requestId: 'task-123'
   * })
   * if (!response.isSuccess) {
   *   throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
   * }
   * console.log(response.getData().result.item.title)
   */
  public override async make<T = unknown>(options: ActionCallV3): Promise<AjaxResult<T>> {
    if (!versionManager.isSupport(ApiVersion.v3, options.method)) {
      throw new SdkError({
        code: 'JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3',
        description: `restApi:v3 not support method ${options.method}`,
        status: 500
      })
    }
    const params = options.params || {}
    return this._b24.getHttpClient(ApiVersion.v3).call<T>(options.method, params, options.requestId)
  }
}
