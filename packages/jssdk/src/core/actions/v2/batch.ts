import type { ActionOptions } from '../abstract-action'
import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchNamedCommandsUniversal
} from '../../../types/http'
import type { CallBatchResult, IB24BatchOptions } from '../../../types/b24'
import { AbstractBatch } from '../abstract-batch'
import { ApiVersion } from '../../../types/b24'

export type ActionBatchV2 = ActionOptions & {
  calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal
  options?: IB24BatchOptions
}

/**
 * Api:v2
 * @todo add docs
 * @todo add test
 */
export class BatchV2 extends AbstractBatch {
  public override async make<T = unknown>(options: ActionBatchV2): Promise<CallBatchResult<T>> {
    const opts = {
      ...options.options,
      apiVersion: ApiVersion.v2
    }

    const response = await this._b24.getHttpClient(ApiVersion.v2).batch<T>(options.calls, opts)

    return this._processBatchResponse<T>(response, options.calls, opts)
  }
}
