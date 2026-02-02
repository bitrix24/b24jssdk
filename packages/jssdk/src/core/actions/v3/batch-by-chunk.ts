import type { ActionOptions } from '../abstract-action'
import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal, BatchCommandsUniversal
} from '../../../types/http'
import type { IB24BatchOptions } from '../../../types/b24'
import { AbstractBatch } from '../abstract-batch'
import { ApiVersion } from '../../../types/b24'
import { Result } from '../../result'

export type ActionBatchByChunkV3 = ActionOptions & {
  calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal
  options?: Omit<IB24BatchOptions, 'returnAjaxResult'>
}

/**
 * Executes a batch request with automatic chunking for any number of commands. `restApi:v3`
 *
 * @todo add docs
 * @todo test self
 * @todo test example
 */
export class BatchByChunkV3 extends AbstractBatch {
  /**
   * Executes a batch request with automatic chunking for any number of commands.
   * Unlike `BatchV3`, which is limited to 50 commands, this method automatically splits
   * a large set of commands into multiple batches and executes them sequentially.
   *
   * @template T - The data type returned by commands (default: `unknown`)
   *
   * @param {ActionBatchByChunkV3} options - parameters for executing the request.
   *     - `calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal` - Commands to execute in a batch.
   *        Supports several formats:
   *        1. Array of tuples: `[['method1', params1], ['method2', params2], ...]`
   *        2. Array of objects: `[{ method: 'method1', params: params1 }, { method: 'method2', params: params2 }, ...]`
   *        - Note: Named commands are not supported as they are difficult to process when chunking.
   *     - `options?: Omit<IB24BatchOptions, 'returnAjaxResult'>` - Additional options for executing a batch request.
   *        - `isHaltOnError?: boolean` - Whether to stop execution on the first error (default: true)
   *        - `requestId?: string` - Unique request identifier for tracking. Used for query deduplication and debugging (default: undefined)
   *
   * @returns {Promise<Result<T[]>>} A promise that is resolved by the result of executing all commands.
   *
   * @example
   * interface TaskItem { id: number, title: string }
   * const commands: BatchCommandsArrayUniversal = Array.from({ length: 150 }, (_, i) =>
   *   ['tasks.task.get', { id: i + 1, select: ['id', 'title'] }]
   * )
   *
   * const response = await b24.actions.v3.batchByChunk.make<{ item: TaskItem }>({
   *   calls: commands,
   *   options: {
   *     isHaltOnError: false,
   *     requestId: 'batch-by-chunk-123'
   *   }
   * })
   *
   * if (!response.isSuccess) {
   *   throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
   * }
   *
   * const resultData = response.getData()
   * const items: TaskItem[] = []
   * resultData.forEach((chunkRow) => {
   *   items.push(chunkRow.item)
   * })
   * console.log(`Successfully retrieved ${items.length} items`)
   *
   * @tip For very large command sets, consider using server-side task queues instead of bulk batch requests.
   */
  public override async make<T = unknown>(options: ActionBatchByChunkV3): Promise<Result<T[]>> {
    const batchSize = 50

    const opts = {
      ...options.options,
      returnAjaxResult: false,
      apiVersion: ApiVersion.v3
    }

    // callBatchByChunk
    const result = new Result<T[]>()

    const dataResult: T[] = []
    const chunks = this.chunkArray(options.calls as BatchCommandsUniversal, batchSize) as BatchCommandsArrayUniversal[] | BatchCommandsObjectUniversal[]

    for (const chunkRequest of chunks) {
      const response = await this._b24.getHttpClient(ApiVersion.v3).batch<T[]>(chunkRequest, opts)

      if (!response.isSuccess) {
        this._addBatchErrorsIfAny(response, result)
      }

      for (const [_index, data] of response.getData()!.result!) {
        // @memo Add only success rows
        if (data.isSuccess) {
          dataResult.push(data.getData()!.result)
        }
      }
    }

    return result.setData(dataResult)
  }
}
