import { ApiVersion } from '../../types/b24'

class VersionManager {
  #supportMethods: string[]

  constructor() {
    /**
     * get from https://{portal}/rest/api/{user_id}/{webhook}/documentation
     * @see https://apidocs.bitrix24.com/api-reference/rest-v3/index.html#openapi
     */
    this.#supportMethods = [
      '/batch',
      '/scopes',
      '/rest.scope.list',
      '/rest.documentation.openapi',
      '/documentation',
      '/main.eventlog.list',
      '/main.eventlog.get',
      '/main.eventlog.tail',
      '/tasks.task.chat.message.send',
      '/tasks.task.access.get',
      '/tasks.task.file.attach',
      '/tasks.task.update',
      '/tasks.task.delete',
      '/tasks.task.add',
      '/tasks.task.get',
      // @todo remove this
      '/tasks.task.list'
    ]
  }

  static create(): VersionManager {
    return new VersionManager()
  }

  public isSupport(version: ApiVersion, method: string): boolean {
    switch (version) {
      case ApiVersion.v1:
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
}

export const versionManager = VersionManager.create()
