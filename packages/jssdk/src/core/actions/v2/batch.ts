import type { CallBatchResult, IB24BatchOptions } from '../../../types/b24'
import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchNamedCommandsUniversal
} from '../../../types/http'
import { AbstractBatch } from '../abstract-batch'
import { ApiVersion } from '../../../types/b24'

export type ActionBatchV2 = {
  calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal
  options?: IB24BatchOptions
}

/**
 * Executes a batch request to the Bitrix24 REST API with a maximum number of commands of no more than 50. `restApi:v2`
 * Allows you to execute multiple requests in a single API call, significantly improving performance.
 *
 * Sends up to 50 commands in a single v2 batch HTTP call and returns their results together.
 * Supports array, object, and named-command formats. Unlike `BatchByChunkV2`, it does not
 * split large command sets automatically — callers must ensure the command count stays within
 * the 50-command limit.
 */
export class BatchV2 extends AbstractBatch {
  /**
   * Executes a batch request to the Bitrix24 REST API: up to 50 commands in one
   * HTTP call, in array, object or named-command form. `restApi:v2`
   *
   * **The argument reference, the three `calls` formats, the options table and
   * worked examples live on the [batch page](https://bitrix24.github.io/b24jssdk/docs/working-with-the-rest-api/batch-rest-api-ver2/).**
   * Deliberately not repeated here: that copy is compiled on every CI run and
   * this one would not be — no pass type-checks a JSDoc `@example` (#420).
   *
   * What matters while editing this file:
   *   - **50 commands maximum.** This action does not split; `BatchByChunkV2`
   *     is the one that does.
   *   - **`getData()` has no `result` envelope here.** It returns the keyed map
   *     or array directly — only `call.make` returns `{ result, time }` (#425).
   *   - **Flags live in `options`.** At the top level they are dropped, which is
   *     why `_warnMisplacedOptions` runs first (#426).
   *
   * @template T - The data type returned by batch query commands (default `unknown`)
   * @param {ActionBatchV2} options - `calls` plus an optional `options` bag; see
   *   {@link ActionBatchV2} and {@link IB24BatchOptions} for the members.
   * @returns {Promise<CallBatchResult<T>>} results in the shape of the input:
   *   an array for array input, an object keyed by command name for named input.
   *   With `options.returnAjaxResult` each entry is an `AjaxResult` rather than
   *   the raw payload.
   *
   * @example
   * import type { AjaxResult } from '@bitrix24/b24jssdk'
   *
   * const response = await b24.actions.v2.batch.make<{ item: Contact }>({
   *   calls: {
   *     first: ['crm.item.get', { entityTypeId: 3, id: 1 }],
   *     second: ['crm.item.get', { entityTypeId: 3, id: 2 }]
   *   },
   *   options: { isHaltOnError: false, returnAjaxResult: true, requestId: 'batch-123' }
   * })
   * if (!response.isSuccess) {
   *   throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
   * }
   * const data = response.getData()! as Record<string, AjaxResult<{ item: Contact }>>
   * console.log(data['first']!.getData()!.result.item)
   *
   * @warning The maximum number of commands in one batch request is 50.
   * @note A batch request executes faster than sequential single calls,
   *     but if one command fails, the entire batch may fail
   *     (depending on API settings and options).
   */
  public override async make<T = unknown>(options: ActionBatchV2): Promise<CallBatchResult<T>> {
    this._warnMisplacedOptions(
      options,
      ['isHaltOnError', 'returnAjaxResult', 'requestId'],
      'options'
    )

    const opts = {
      ...options.options,
      apiVersion: ApiVersion.v2
    }

    const response = await this._b24.getHttpClient(ApiVersion.v2).batch<T>(options.calls, opts)

    return this._processBatchResponse<T>(response, options.calls, opts)
  }
}
