import type { ActionOptions } from '../abstract-action'
import type { CallBatchResult, IB24BatchOptions } from '../../../types/b24'
import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchNamedCommandsUniversal
} from '../../../types/http'
import { AbstractBatch } from '../abstract-batch'
import { ApiVersion } from '../../../types/b24'

export type ActionBatchV2 = ActionOptions & {
  calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal
  options?: IB24BatchOptions
}

/**
 * Executes a batch request to the Bitrix24 REST API with a maximum number of commands of no more than 50. `restApi:v2`
 * Allows you to execute multiple requests in a single API call, significantly improving performance.
 *
 * @todo add docs
 * @todo test example
 */
export class BatchV2 extends AbstractBatch {
  /**
   * Executes a batch request to the Bitrix24 REST API with a maximum number of commands of no more than 50.
   * Allows you to execute multiple requests in a single API call, significantly improving performance.
   *
   * @template T - The data type returned by batch query commands (default is `unknown`)
   *
   * @param {ActionBatchV2} options - parameters for executing the request.
   *     - `calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal` - Commands to execute in a batch.
   *        Supports several formats:
   *        1. Array of tuples: `[['method1', params1], ['method2', params2], ...]`
   *        2. Array of objects: `[{ method: 'method1', params: params1 }, { method: 'method2', params: params2 }, ...]`
   *        3. An object with named commands: `{ cmd1: { method: 'method1', params: params1 }, cmd2: ['method2', params2], ...}`
   *     - `options?: IB24BatchOptions` - Additional options for executing a batch request.
   *        - `isHaltOnError?: boolean` - Whether to stop execution on the first error (default: true)
   *        - `requestId?: string` - Unique request identifier for tracking. Used for query deduplication and debugging (default: undefined)
   *        - `returnAjaxResult?: boolean` - Whether to return an AjaxResult object instead of data (default: false)
   *
   * @returns {Promise<CallBatchResult<T>>} A promise that is resolved by the result of executing a batch request:
   *     - On success: a `Result` object with the command execution results
   *     - The structure of the results depends on the format of the `calls` input data:
   *          - For an array of commands, an array of results in the same order
   *          - For named commands, an object with keys corresponding to the command names
   *
   * @example
   * interface Contact { id: number, name: string }
   * const response = await b24.actions.v2.batch.make<{ item: Contact }>({
   *   calls: [
   *     ['crm.item.get', { entityTypeId: 3, id: 1 }],
   *     ['crm.item.get', { entityTypeId: 3, id: 2 }],
   *     ['crm.item.get', { entityTypeId: 3, id: 3 }]
   *   ],
   *   options: {
   *     isHaltOnError: true,
   *     returnAjaxResult: true,
   *     requestId: 'batch-123'
   *   }
   * })
   *
   * if (!response.isSuccess) {
   *   throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
   * }
   *
   * const results = response.getData() as AjaxResult<{ item: Contact }>[]
   * results.forEach((result, index) => {
   *   if (result.isSuccess) {
   *    console.log(`Item ${index + 1}:`, result.getData()?.item)
   *   }
   * })
   *
   * @example
   * const response = await b24.actions.v2.batch.make({
   *   calls: [
   *     { method: 'crm.item.get', params: { entityTypeId: 3, id: 1 } },
   *     { method: 'crm.item.get', params: { entityTypeId: 3, id: 2 } }
   *   ],
   *   options: {
   *     isHaltOnError: true,
   *     returnAjaxResult: true,
   *     requestId: 'batch-123'
   *   }
   * })
   *
   * @example
   * interface Contact { id: number, name: string }
   * interface Deal { id: number, title: string }
   * const response = await b24.actions.v2.batch.make<{ item: Contact } | { item: Deal }>({
   *   calls: {
   *     Contact: { method: 'crm.item.get', params: { entityTypeId: 3, id: 1 } },
   *     Deal: ['crm.item.get', { entityTypeId: 2, id: 2 }]
   *   },
   *   options: {
   *     isHaltOnError: true,
   *     returnAjaxResult: true,
   *     requestId: 'batch-123'
   *   }
   * })
   *
   * const results = response.getData() as Record<string, AjaxResult<{ item: Contact } | { item: Deal }>>
   * console.log('Contact:', results.Contact.getData().result.item as Contact)
   * console.log('Deal:', results.Deal.getData().result.item as Deal)
   *
   * @warning The maximum number of commands in one batch request is 50.
   * @note A batch request executes faster than sequential single calls,
   *     but if one command fails, the entire batch may fail
   *     (depending on API settings and options).
   */
  public override async make<T = unknown>(options: ActionBatchV2): Promise<CallBatchResult<T>> {
    const opts = {
      ...options.options,
      apiVersion: ApiVersion.v2
    }

    const response = await this._b24.getHttpClient(ApiVersion.v2).batch<T>(options.calls, opts)

    return this._processBatchResponse<T>(response, options.calls, opts)
  }
}
