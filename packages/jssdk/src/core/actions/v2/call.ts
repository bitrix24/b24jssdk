import type { ActionOptions } from '../abstract-action'
import type { TypeCallParams } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { AbstractAction } from '../abstract-action'
import { versionManager } from '../../version-manager'
import { ApiVersion } from '../../../types/b24'
import { LoggerFactory } from '../../../logger'
import { SdkError } from '../../sdk-error'

export type ActionCall = ActionOptions & {
  method: string
  params?: TypeCallParams
  requestId?: string
}

/*
 * Call by Api:v2
 * @todo add docs
 */
export class Call extends AbstractAction {
  public override async make<T = unknown>(options: ActionCall): Promise<AjaxResult<T>> {
    if (versionManager.isSupport(ApiVersion.v3, options.method)) {
      LoggerFactory.forcedLog(
        this._logger,
        'warning',
        `The method ${options.method} is available in API version 3. It's worth migrating to the new API.`,
        {
          method: options.method,
          requestId: options.requestId,
          code: 'JSSDK_AVAILABLE_API_VERSION_3'
        }
      )
    }

    if (!versionManager.isSupport(ApiVersion.v2, options.method)) {
      throw new SdkError({
        code: 'JSSDK_CORE_B24_API_V2_NOT_SUPPORT_METHOD',
        description: `Api:v2 not support method ${options.method}`,
        status: 500
      })
    }
    const params = options.params || {}
    return this._b24.getHttpClient(ApiVersion.v2).call<T>(options.method, params, options.requestId)
  }
}
