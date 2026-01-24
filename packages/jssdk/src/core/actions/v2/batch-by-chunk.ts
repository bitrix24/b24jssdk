import type { ActionOptions } from '../abstract-action'
import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal, BatchCommandsUniversal
} from '../../../types/http'
import type { IB24BatchOptions } from '../../../types/b24'
import { AbstractBatch } from '../abstract-batch'
import { ApiVersion } from '../../../types/b24'
import { Result } from '../../result'

export type ActionBatchByChunkV2 = ActionOptions & {
  calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal
  options?: Omit<IB24BatchOptions, 'returnAjaxResult'>
}

/**
 * Api:v2
 * @todo add docs
 * @todo add test
 */
export class BatchByChunkV2 extends AbstractBatch {
  public override async make<T = unknown>(options: ActionBatchByChunkV2): Promise<Result<T[]>> {
    const batchSize = 50

    const opts = {
      ...options.options,
      returnAjaxResult: false,
      apiVersion: ApiVersion.v2
    }

    // callBatchByChunk
    const result = new Result<T[]>()

    const dataResult: T[] = []
    const chunks = this.chunkArray(options.calls as BatchCommandsUniversal, batchSize) as BatchCommandsArrayUniversal[] | BatchCommandsObjectUniversal[]

    for (const chunkRequest of chunks) {
      const response = await this._b24.getHttpClient(ApiVersion.v2).batch<T[]>(chunkRequest, opts)

      if (!response.isSuccess) {
        this._logger.error('callBatchByChunk Api:v2', {
          messages: response.getErrorMessages(),
          calls: chunkRequest,
          options: opts
        })
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
