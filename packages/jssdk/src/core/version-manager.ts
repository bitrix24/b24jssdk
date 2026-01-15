import { ApiVersion } from '../types/b24'
import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchNamedCommandsUniversal
} from '../types/http'
import { ParseRow } from './interaction/batch/parse-row'
import { SdkError } from './sdk-error'

/**
 * @todo add docs ??
 */
class VersionManager {
  #supportMethods: string[]

  constructor() {
    /**
     * get from https://{portal}/rest/api/{user_id}/{webhook}/documentation
     * @see https://apidocs.bitrix24.com/api-reference/rest-v3/index.html#openapi
     */
    this.#supportMethods = [
      '/batch', // @todo
      '/scopes', // done
      '/rest.scope.list', // done
      '/rest.documentation.openapi',
      '/documentation',
      /** @see /settings/configs/event_log.php */
      '/main.eventlog.list', // done
      '/main.eventlog.get', // done
      '/main.eventlog.tail', // done
      '/tasks.task.chat.message.send',
      '/tasks.task.access.get',
      '/tasks.task.file.attach',
      '/tasks.task.update', // done
      '/tasks.task.delete',
      '/tasks.task.add',
      '/tasks.task.get' // done
      // @todo When API.v3 arrives - change in AuthOAuthManager.initIsAdmin()
      // '/profile'
    ]
  }

  static create(): VersionManager {
    return new VersionManager()
  }

  /**
   * List of supported API versions
   * The highest version must be first
   */
  public getAllApiVersions(): ApiVersion[] {
    return [ApiVersion.v3, ApiVersion.v2]
  }

  public isSupport(version: ApiVersion, method: string): boolean {
    switch (version) {
      case ApiVersion.v2:
        return true
      case ApiVersion.v3:
        return this.#v3Support(method)
    }

    return false
  }

  #v3Support(method: string): boolean {
    return this.#supportMethods.includes(`/${method}`)
  }

  /**
   * Automatically obtain the API version
   */
  public automaticallyObtainApiVersion(method: string): ApiVersion {
    const version = this.getAllApiVersions().find(version => versionManager.isSupport(version, method))
    if (!version) {
      throw new SdkError({
        code: 'JSSDK_VERSION_MANAGER_NOT_DETECT_FOR_METHOD',
        description: `No API version found that supports method ${method}.`,
        status: 500
      })
    }

    return version
  }

  /**
   * Automatically obtain the API version for Batch
   *
   * @todo test methods
   *   `[['crm.item.get', { entityTypeId: 3, id: 1 }]]`
   *   `[{ method: 'crm.item.get', params: { entityTypeId: 3, id: 1 } }]`
   *   `{ cmd1: { method: 'crm.item.get', params: { entityTypeId: 3, id: 1 } }, cmd2: ['crm.item.get', { entityTypeId: 2, id: 2 }] }`
   */
  public automaticallyObtainApiVersionForBatch(
    calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal
  ): ApiVersion {
    const cmd = ParseRow.getMethodsFromCommands(calls)

    let isAllSupportV3 = true
    for (const method in cmd) {
      if (!versionManager.isSupport(ApiVersion.v3, method)) {
        isAllSupportV3 = false
        break
      }
    }

    if (isAllSupportV3) {
      return ApiVersion.v3
    }
    return ApiVersion.v2
  }
}

export const versionManager = VersionManager.create()
