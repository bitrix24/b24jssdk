import type { ActionOptions } from '../abstract-action'
import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchNamedCommandsUniversal
} from '../../../types/http'
import type { CallBatchResult, IB24BatchOptions } from '../../../types/b24'
import { AbstractBatch } from '../abstract-batch'
import { ApiVersion } from '../../../types/b24'
import { versionManager } from '../../version-manager'
import { SdkError } from '../../sdk-error'

export type ActionBatchV3 = ActionOptions & {
  calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal
  options?: IB24BatchOptions
}

/**
 * Api:v3
 * @todo add docs
 * @todo add test
 */
export class BatchV3 extends AbstractBatch {
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
