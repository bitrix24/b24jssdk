/**
 * Canonical compile-checked example for the "Standard Module Template" from
 * .github/contributing/package-structure.md (§ Standard Module Template).
 *
 * If this file stops compiling, the contributing guide is out of sync with the SDK.
 * Prerequisite: pnpm run dev:prepare (builds dist/ and its type declarations).
 */

import type { AjaxResult, LoggerInterface, TypeB24 } from '@bitrix24/b24jssdk'
import { LoggerFactory, SdkError } from '@bitrix24/b24jssdk'

export class MyManager {
  protected _b24: TypeB24
  protected _logger: LoggerInterface

  constructor(b24: TypeB24) {
    this._b24 = b24
    this._logger = LoggerFactory.createNullLogger()
  }

  setLogger(logger: LoggerInterface): void {
    this._logger = logger
  }

  getLogger(): LoggerInterface {
    return this._logger
  }

  async fetch(id: number): Promise<AjaxResult<{ item: { id: number } }>> {
    if (id <= 0) {
      throw new SdkError({
        code: 'MY_MANAGER_BAD_ID',
        description: 'MyManager.fetch: id must be positive',
        status: 400
      })
    }

    return this._b24.actions.v3.call.make<{ item: { id: number } }>({
      method: 'my.entity.get',
      params: { id },
      requestId: 'my-manager/fetch'
    })
  }
}
