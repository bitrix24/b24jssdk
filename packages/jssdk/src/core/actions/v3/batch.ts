import type { ActionOptions } from '../abstract-action'
import type { CallBatchResult, IB24BatchOptions } from '../../../types/b24'
import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchNamedCommandsUniversal
} from '../../../types/http'
import { AbstractBatch } from '../abstract-batch'
import { ApiVersion } from '../../../types/b24'
import { versionManager } from '../../version-manager'
import { SdkError } from '../../sdk-error'

export type ActionBatchV3 = ActionOptions & {
  calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal
  options?: IB24BatchOptions
}

/**
 * Executes a batch request to the Bitrix24 REST API with a maximum number of commands of no more than 50. `restApi:v3`
 * Allows you to execute multiple requests in a single API call, significantly improving performance.
 *
 * @todo add docs
 */
export class BatchV3 extends AbstractBatch {
  /**
   * Executes a batch request to the Bitrix24 REST API with a maximum number of commands of no more than 50.
   * Allows you to execute multiple requests in a single API call, significantly improving performance.
   *
   * @template T - The data type returned by batch query commands (default is `unknown`)
   *
   * @param {ActionBatchV3} options - parameters for executing the request.
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
   * interface TaskItem { id: number, title: string }
   * const response = await b24.actions.v3.batch.make<{ item: TaskItem }>({
   *   calls: [
   *     ['tasks.task.get', { id: 1, select: ['id', 'title'] }],
   *     ['tasks.task.get', { id: 2, select: ['id', 'title'] }],
   *     ['tasks.task.get', { id: 3, select: ['id', 'title'] }]
   *   ],
   *   options: {
   *     isHaltOnError: true,
   *     returnAjaxResult: true,
   *     requestId: 'batch-123'
   *   }
   * })
   * if (!response.isSuccess) {
   *   throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
   * }
   *
   * const results = response.getData() as AjaxResult<{ item: TaskItem }>[]
   * results.forEach((result, index) => {
   *   if (result.isSuccess) {
   *    console.log(`Item ${index + 1}:`, result.getData().result.item)
   *   }
   * })
   *
   * @example
   * const response = await b24.actions.v3.batch.make({
   *   calls: [
   *     { method: 'tasks.task.get', params: { id: 1, select: ['id', 'title'] } },
   *     { method: 'tasks.task.get', params: { id: 2, select: ['id', 'title'] } }
   *   ],
   *   options: {
   *     isHaltOnError: true,
   *     returnAjaxResult: true,
   *     requestId: 'batch-123'
   *   }
   * })
   * if (!response.isSuccess) {
   *   throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
   * }
   *
   * @example
   * interface TaskItem { id: number, title: string }
   * interface MainEventLogItem { id: number, userId: number }
   * const response = await b24.actions.v3.batch.make<{ item: TaskItem } | { items: MainEventLogItem[] }>({
   *   calls: {
   *     Task: { method: 'tasks.task.get', params: { id: 1, select: ['id', 'title'] } },
   *     MainEventLog: ['main.eventlog.list', { select: ['id', 'userId'], pagination: { limit: 5 } }]
   *   },
   *   options: {
   *     isHaltOnError: true,
   *     returnAjaxResult: true,
   *     requestId: 'batch-123'
   *   }
   * })
   * if (!response.isSuccess) {
   *   throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
   * }
   *
   * const results = response.getData() as Record<string, AjaxResult<{ item: TaskItem } | { items: MainEventLogItem[] }>>
   * console.log('Task:', results.Task.getData().result.item as TaskItem)
   * console.log('MainEventLog:', results.MainEventLog.getData().result.items as MainEventLogItem[])
   *
   * @warning The maximum number of commands in one batch request is 50.
   * @note A batch request executes faster than sequential single calls,
   *     but if one command fails, the entire batch may fail
   *     (depending on API settings and options).
   */
  public override async make<T = unknown>(options: ActionBatchV3): Promise<CallBatchResult<T>> {
    const opts = {
      ...options.options,
      apiVersion: ApiVersion.v3
    }

    if (versionManager.automaticallyObtainApiVersionForBatch(options.calls) !== opts.apiVersion) {
      throw new SdkError({
        code: 'JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3',
        description: `restApi:v3 not support some methods in calls: ${JSON.stringify(options.calls)}`,
        status: 500
      })
    }

    const response = await this._b24.getHttpClient(ApiVersion.v3).batch<T>(options.calls, opts)

    return this._processBatchResponse<T>(response, options.calls, opts)
  }
}
