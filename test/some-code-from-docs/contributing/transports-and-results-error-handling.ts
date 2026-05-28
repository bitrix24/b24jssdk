/**
 * Canonical compile-checked example for Result handling and error inspection from
 * .github/contributing/transports-and-results.md (§ Result Type, § Error Types).
 *
 * Covers:
 *  - v3 call + isSuccess guard + getData()
 *  - SdkError thrown for invariant violations (constructor takes SdkErrorDetails, not a string)
 *  - AjaxError surfaced via Result.getErrors() — access via .code / .status / .message
 *
 * If this file stops compiling, the contributing guide is out of sync with the SDK.
 * Prerequisite: pnpm run dev:prepare (builds dist/ and its type declarations).
 */

import type { TypeB24 } from '@bitrix24/b24jssdk'
import { AjaxError, SdkError } from '@bitrix24/b24jssdk'

export async function callAndHandleResult(b24: TypeB24) {
  const result = await b24.actions.v3.call.make({
    method: 'user.get',
    params: { ID: 1 },
    requestId: 'app/user.get'
  })

  if (!result.isSuccess) {
    // result.getErrorMessages() returns string[]; result.getErrors() returns IterableIterator<Error>
    void result.getErrorMessages()
    void result.getErrors()
    return
  }

  void result.getData()
}

export async function callAndInspectAjaxError(b24: TypeB24) {
  const payload = { fields: { TITLE: 'New Lead' } }
  const result = await b24.actions.v3.call.make({
    method: 'crm.lead.add',
    params: payload,
    requestId: 'app/crm.lead.add'
  })
  const [err] = result.getErrors()
  if (err instanceof AjaxError) {
    // AjaxError properties: .code (string), .status (number), .message (string)
    void err.code
    void err.status
    void err.message
  }
}

export function sdkErrorExample(): never {
  // SdkError constructor takes a SdkErrorDetails object, not a plain string.
  throw new SdkError({
    code: 'B24_HOOK_URL_REQUIRED',
    description: 'B24Hook.fromWebhookUrl: url is required',
    status: 400
  })
}
