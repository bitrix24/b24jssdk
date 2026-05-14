/**
 * Unit-style tests for batch processing strategies — exercise the
 * response-parsing logic directly without hitting a real Bitrix24 portal.
 *
 * Covers regression for issue #23: a REST method that returns `null` inside a
 * batch must be surfaced as `null` from `AjaxResult.getData().result` (not
 * coerced to `{}`).
 */
import { describe, it, expect } from 'vitest'
import { AjaxResult } from '../../../packages/jssdk/src/core/http/ajax-result'
import { RestrictionManager } from '../../../packages/jssdk/src/core/http/limiters/manager'
import { ParamsFactory } from '../../../packages/jssdk/src/core/http/limiters/params-factory'
import type { SdkError } from '../../../packages/jssdk/src/core/sdk-error'
import type { BatchCommandV3 } from '../../../packages/jssdk/src/types/http'
import type { BatchPayload, PayloadTime } from '../../../packages/jssdk/src/types/payloads'
import type { ResponseHelper } from '../../../packages/jssdk/src/core/interaction/batch/processing/interface-strategy'
import { ProcessingAsObjectV2 } from '../../../packages/jssdk/src/core/interaction/batch/processing/v2/as-object'
import { ProcessingAsObjectV3 } from '../../../packages/jssdk/src/core/interaction/batch/processing/v3/as-object'

function buildPayloadTime(): PayloadTime {
  return {
    start: 0,
    finish: 0,
    duration: 0,
    processing: 0,
    date_start: '1970-01-01T00:00:00+00:00',
    date_finish: '1970-01-01T00:00:00+00:00',
    operating_reset_at: 1,
    operating: 0
  }
}

function buildResponseHelper<T>(
  payload: BatchPayload<T>,
  requestId = 'unit-test'
): ResponseHelper<T> {
  const response = new AjaxResult<BatchPayload<T>>({
    answer: payload,
    query: { method: 'batch', params: {}, requestId },
    status: 200
  })

  return {
    requestId,
    parallelDefaultValue: false,
    response,
    restrictionManager: new RestrictionManager(ParamsFactory.getDefault())
  }
}

describe('batch processing preserves null result (issue #23)', () => {
  it('@apiV2 forwards null from result[index] as null, not {}', async () => {
    const strategy = new ProcessingAsObjectV2()
    const commands: BatchCommandV3[] = [
      { method: 'im.chat.get', query: {}, as: 'chatGet' }
    ]

    const helper = buildResponseHelper<unknown>({
      result: {
        result: { chatGet: null as unknown },
        result_error: {},
        result_total: {},
        result_next: {},
        result_time: { chatGet: buildPayloadTime() }
      },
      time: buildPayloadTime()
    } as unknown as BatchPayload<unknown>)

    const items = await strategy.prepareItems(commands, helper)
    const row = items.get('chatGet')

    expect(row).toBeInstanceOf(AjaxResult)
    expect(row?.isSuccess).toBe(true)
    expect(row?.getData()!.result).toBeNull()
  })

  it('@apiV2 skips entries that are entirely absent (no data, no error)', async () => {
    const strategy = new ProcessingAsObjectV2()
    const commands: BatchCommandV3[] = [
      { method: 'im.chat.get', query: {}, as: 'missing' }
    ]

    const helper = buildResponseHelper<unknown>({
      result: {
        result: {},
        result_error: {},
        result_total: {},
        result_next: {},
        result_time: {}
      },
      time: buildPayloadTime()
    } as unknown as BatchPayload<unknown>)

    const items = await strategy.prepareItems(commands, helper)
    expect(items.size).toBe(0)
  })

  it('@apiV3 forwards null from result[index] as null, not {}', async () => {
    const strategy = new ProcessingAsObjectV3()
    const commands: BatchCommandV3[] = [
      { method: 'im.chat.get', query: {}, as: 'chatGet' }
    ]

    // v3 puts per-command results directly under `result` as an array;
    // prepareItems looks them up by array index — `as`-keys are mapped later
    // in handleResults via `command.as ?? index`.
    const helper = buildResponseHelper<unknown>({
      result: [null as unknown],
      time: buildPayloadTime()
    } as unknown as BatchPayload<unknown>)

    const items = await strategy.prepareItems(commands, helper)
    const row = items.get(0)

    expect(row).toBeInstanceOf(AjaxResult)
    expect(row?.isSuccess).toBe(true)
    expect(row?.getData()!.result).toBeNull()
  })

  it('@apiV3 throws _V3_EMPTY_COMMAND_RESPONSE when an entry is missing entirely', async () => {
    const strategy = new ProcessingAsObjectV3()
    const commands: BatchCommandV3[] = [
      { method: 'im.chat.get', query: {}, as: 'missing' }
    ]

    const helper = buildResponseHelper<unknown>({
      result: {},
      time: buildPayloadTime()
    } as unknown as BatchPayload<unknown>)

    await expect(strategy.prepareItems(commands, helper)).rejects.toMatchObject({
      code: 'JSSDK_INTERACTION_BATCH_STRATEGY_V3_EMPTY_COMMAND_RESPONSE'
    } satisfies Partial<SdkError>)
  })
})
