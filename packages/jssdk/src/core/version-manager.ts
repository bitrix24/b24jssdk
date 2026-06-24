import { ApiVersion } from '../types/b24'
import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchNamedCommandsUniversal
} from '../types/http'
import { ParseRow } from './interaction/batch/parse-row'
import { SdkError } from './sdk-error'

/**
 * Decides which REST API version (v2 or v3) a method is routed through:
 * v3 only for methods on the published allowlist (`#supportMethods`); everything
 * else falls back to v2.
 */
class VersionManager {
  #supportMethods: string[]

  constructor() {
    /**
     * Mirrors the methods published under Bitrix24 REST v3 (per the module pages
     * of apidocs rest-v3). Absences are intentional — a module exposes only what
     * is published (e.g. `timeman` is read-only in v3: no `record.get` / `add` /
     * `update`). Entries WITHOUT a `// done` marker are routed but not yet verified
     * end-to-end against a live portal in this SDK.
     *
     * Source of truth: https://{portal}/rest/api/{user_id}/{webhook}/documentation
     * @see https://apidocs.bitrix24.com/api-reference/rest-v3/index.html#openapi
     */
    this.#supportMethods = [
      // --- infrastructure ---
      '/batch', // done
      '/scopes', // done
      '/rest.scope.list', // done
      '/rest.documentation.openapi',
      '/documentation',

      // --- main ---
      /** @see /settings/configs/event_log.php */
      '/main.eventlog.list', // done
      '/main.eventlog.get', // done
      '/main.eventlog.tail', // done
      '/main.eventlog.field.list',
      '/main.eventlog.field.get',

      // --- mail (rest-v3) ---
      '/mail.mailbox.list',
      '/mail.mailbox.get',
      '/mail.mailbox.senders',
      '/mail.mailbox.field.list',
      '/mail.mailbox.field.get',
      '/mail.message.list',
      '/mail.message.get',
      '/mail.message.thread',
      '/mail.message.send',
      '/mail.message.reply',
      '/mail.message.forward',
      '/mail.message.movetofolder',
      '/mail.message.createcrmactivity',
      '/mail.message.removecrmactivity',
      '/mail.message.createtask',
      '/mail.message.createcalendarevent',
      '/mail.message.createchat',
      '/mail.message.createfeedpost',
      '/mail.message.field.list',
      '/mail.message.field.get',
      '/mail.recipient.listcontacts',
      '/mail.recipient.listemployees',
      '/mail.recipient.field.list',
      '/mail.recipient.field.get',

      // --- humanresources (rest-v3) ---
      '/humanresources.node.add',
      '/humanresources.node.edit',
      '/humanresources.node.get',
      '/humanresources.node.list',
      '/humanresources.node.search',
      '/humanresources.node.children',
      '/humanresources.node.count',
      '/humanresources.node.move',
      '/humanresources.node.field.list',
      '/humanresources.node.field.get',
      '/humanresources.node.member.add',
      '/humanresources.node.member.set',
      '/humanresources.node.member.move',
      '/humanresources.node.member.remove',
      '/humanresources.node.communication.edit',
      '/humanresources.node.communication.list',
      '/humanresources.employee.search',
      '/humanresources.employee.subordinates',
      '/humanresources.employee.count',
      '/humanresources.employee.multidepartment',
      '/humanresources.employee.field.list',
      '/humanresources.employee.field.get',

      // --- tasks (rest-v3) ---
      '/tasks.task.add',
      '/tasks.task.list',
      '/tasks.task.get', // done
      '/tasks.task.update', // done
      '/tasks.task.delete',
      '/tasks.task.access.get',
      '/tasks.task.file.attach',
      '/tasks.task.chat.message.send',
      '/tasks.task.result.add',
      '/tasks.task.result.addfromchatmessage',
      '/tasks.task.result.update',
      '/tasks.task.result.list',
      '/tasks.task.result.delete',
      '/tasks.task.field.list',
      '/tasks.task.field.get',
      '/tasks.task.access.field.list',
      '/tasks.task.access.field.get',
      '/tasks.task.file.field.list',
      '/tasks.task.file.field.get',
      '/tasks.task.chat.message.field.list',
      '/tasks.task.chat.message.field.get',

      // --- timeman (rest-v3) — read-only in v3 (no record.get / add / update / delete) ---
      '/timeman.record.list',
      '/timeman.record.field.list',
      '/timeman.record.field.get'

      // Cross-module methods are cross-referenced from the rest-v3 pages above but
      // belong to modules not actualized here — add them when those modules land:
      //   user.get                                          — user module (seen on humanresources + timeman)
      //   im.message.update / im.message.delete / im.dialog.messages.get  — im module (seen on tasks)
      //   disk.storage.uploadfile / disk.folder.uploadfile /
      //   disk.storage.getchildren / disk.folder.getchildren            — disk module (seen on tasks)
      //
      // @todo When API.v3 arrives - change in AuthOAuthManager.initIsAdmin()
      // '/profile' // wait
      // '/main.message.get' // wait
      // '/main.chat.update' // wait
      // '/main.chat.list' // wait
      // '/main.user.list' // wait
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
      case ApiVersion.v3:
        return this.#v3Support(method)
      case ApiVersion.v2:
        return true
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
    const commands = ParseRow.getMethodsFromCommands(calls)

    let isAllSupportV3 = true
    for (const [_, method] of commands.entries()) {
      if (!this.isSupport(ApiVersion.v3, method)) {
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
