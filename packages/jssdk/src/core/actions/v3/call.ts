import type { TypeCallParamsV3 } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { AbstractAction } from '../abstract-action'
import { ApiVersion } from '../../../types/b24'

export type ActionCallV3 = {
  method: string
  params?: TypeCallParamsV3
  requestId?: string
  /**
   * `Idempotency-Key` for this call — an arbitrary string naming one business
   * operation, so that a repeat of it does not create a second entity.
   *
   * Opt-in: the SDK never generates one, because the dedup scope is
   * webhook/application x user x method and only the caller knows which
   * operation a call belongs to. Pass the *same* key on a retry of the *same*
   * operation, and read {@link AjaxResult.isIdempotentReplay} to tell a replay
   * from a fresh write.
   *
   * @see https://apidocs.bitrix24.ru/api-reference/rest-v3.html — section
   *   «Повторный вызов без дублей»
   */
  idempotencyKey?: string
}

/**
 * Calls the Bitrix24 REST API method `restApi:v3`
 *
 * Executes a single REST API request against the v3 HTTP client and returns the raw response.
 * Unlike its v2 counterpart `CallV2`, it routes through the v3 endpoint without a client-side
 * method allowlist — the server validates the method and returns `METHODNOTFOUNDEXCEPTION` for
 * unknown ones. Like `CallV2`, it makes exactly one HTTP call with no pagination or batching.
 */
export class CallV3 extends AbstractAction {
  /**
   * Calls the Bitrix24 REST API method.
   *
   * @template T - The expected data type in the response (default is `unknown`).
   *
   * @param {ActionCallV3} options - parameters for executing the request.
   *     - `method: string` - REST API method name (eg: `tasks.task.get`)
   *     - `params?: TypeCallParamsV3` - Parameters for calling the method.
   *     - `requestId?: string` - Unique request identifier for tracking and debugging — sent as the `bx24_request_id` query parameter. It does not deduplicate anything; for that see `idempotencyKey` (restApi:v3).
   *     - `idempotencyKey?: string` - `Idempotency-Key` header; a repeat with the same key and body
   *       replays the stored response instead of writing again.
   *
   * @returns {Promise<AjaxResult<T>>} A promise that resolves to the result of an REST API call.
   *
   * @example
   * interface TaskItem { id: number, title: string }
   * const response = await b24.actions.v3.call.make<{ item: TaskItem }>({
   *   method: 'tasks.task.get',
   *   params: { id: 123, select: ['id', 'title'] },
   *   requestId: 'task-123'
   * })
   * if (!response.isSuccess) {
   *   throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
   * }
   * console.log(response.getData()!.result.item.title)
   *
   * @example
   * declare const orderId: number
   * // A write that is safe to retry: the same key means the same operation.
   * // Derive the key from your own identifiers rather than minting one at the
   * // call site — a `crypto.randomUUID()` here would be a fresh key on every
   * // attempt, so a retry from another process would still write a duplicate.
   * const created = await b24.actions.v3.call.make<{ item: { id: number } }>({
   *   method: 'tasks.task.add',
   *   params: { fields: { title: 'Ship it', creatorId: 1, responsibleId: 1 } },
   *   idempotencyKey: `ship-task-for-order-${orderId}`
   * })
   * // Sending the very same call again returns the very same task,
   * // and `created.isIdempotentReplay()` is `true` on that second response.
   */
  public override async make<T = unknown>(options: ActionCallV3): Promise<AjaxResult<T>> {
    // No client-side allowlist: the method is sent straight to the v3 endpoint
    // and the server decides (an unknown method returns METHODNOTFOUNDEXCEPTION).
    const params = options.params || {}
    return this._b24.getHttpClient(ApiVersion.v3).call<T>(
      options.method,
      params,
      options.requestId,
      undefined === options.idempotencyKey ? undefined : { idempotencyKey: options.idempotencyKey }
    )
  }
}
