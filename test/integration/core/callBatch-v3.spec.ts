import type {
  BatchCommandsArrayUniversal,
  PayloadTime,
  Result
} from '../../../packages/jssdk/src/'
import { describe, it, expect } from 'vitest'
import { setupB24Tests } from '../../0_setup/hooks-integration-jssdk'
import { AjaxResult } from '../../../packages/jssdk/src/'

describe('core callBatch @apiV3', () => {
  const { getB24Client, getMapId } = setupB24Tests()
  it('as array like BatchCommandsArrayUniversal @apiV3 isSuccess isHaltOnError returnAjax returnTime', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchCommandsArrayUniversal = [
      ['tasks.task.get', { id: getMapId().taskSuccess, select: ['id', 'title'] }],
      ['tasks.task.get', { id: getMapId().taskSuccess, select: ['id', 'title'] }]
    ]

    const method = 'callBatchAsArray'
    const requestId = `test@apiV3/${method}`
    const options = { isHaltOnError: true, returnAjaxResult: true, returnTime: true, requestId }
    const response = await b24.callBatchV3<{ id: number }[]>(batchCalls, options)

    expect(response.isSuccess).toBe(true)

    const resultData = (response as Result<{
      result: AjaxResult<{ id: number }>[]
      time?: PayloadTime
    }>).getData()

    expect(resultData.result).toBeDefined()
    for (const resultRow of resultData.result) {
      expect(resultRow).toBeInstanceOf(AjaxResult)
      expect(resultRow.isSuccess).toBe(true)

      const rowData = resultRow.getData()
      const result = rowData.result
      expect(result).toHaveProperty('item')
      expect(result.item.id).toBeDefined()

      const time = rowData.time
      expect(time).toHaveProperty('operating')
      expect(time.operating).toBeGreaterThanOrEqual(0)
      expect(time.operating_reset_at).toBeGreaterThan(0)
    }

    const time = resultData.time
    expect(time).toHaveProperty('operating')
    expect(time.operating).toEqual(0)

    console.debug(resultData)
  })
})
