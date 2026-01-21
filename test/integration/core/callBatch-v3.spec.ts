import type {
  BatchCommandsArrayUniversal, BatchCommandsObjectUniversal, BatchNamedCommandsUniversal,
  Result
} from '../../../packages/jssdk/src/'
import { describe, it, expect } from 'vitest'
import { setupB24Tests } from '../../0_setup/hooks-integration-jssdk'
import { AjaxResult, Text } from '../../../packages/jssdk/src/'

/**
 * @todo add test batch inner link
 */
describe('core callBatch @apiV3', () => {
  const { getB24Client, getMapId } = setupB24Tests()
  it('as BatchCommandsArrayUniversal @apiV3 isSuccess isHaltOnError returnAjax', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchCommandsArrayUniversal = [
      ['tasks.task.get', { id: getMapId().taskSuccess, select: ['id', 'title'] }],
      ['tasks.task.update', { id: getMapId().taskSuccess, fields: { title: `TEST: [${Text.getDateForLog()}]` } }]
    ]

    const method = 'callBatchAsArray'
    const requestId = `test@apiV3/${method}`
    const options = { isHaltOnError: true, returnAjaxResult: true, requestId }

    /**
     * This is the load to see the operating
     */
    // await Promise.all(Array.from({ length: 20 }, () => b24.callV3(batchCalls[0][0], batchCalls[0][1], requestId)))

    const response = await b24.callBatchV3<({ id: number } | { result: boolean })[]>(batchCalls, options)

    expect(response.isSuccess).toBe(true)

    const resultData = (response as Result<AjaxResult<{ id: number } | { result: boolean }>[]>).getData()
    expect(resultData.length).toBeGreaterThan(0)

    expect(resultData).toBeDefined()
    for (const resultRow of resultData) {
      expect(resultRow).toBeInstanceOf(AjaxResult)
      expect(resultRow.isSuccess).toBe(true)
      const rowData = resultRow.getData()
      const result = rowData.result
      if ('result' in result) {
        expect(result).toHaveProperty('result')
        expect(result.result).toBeTruthy()
      } else {
        expect(result).toHaveProperty('item')
        expect(result.item.id).toBeDefined()
      }

      const time = rowData.time
      expect(time).toHaveProperty('operating')
      // @todo waite apiV3 fix docs
      expect(time.operating).toEqual(0)
      expect(time.operating_reset_at).toBeGreaterThan(0)
    }
  })
  it('as BatchCommandsObjectUniversal @apiV3 isSuccess isHaltOnError returnAjax', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchCommandsObjectUniversal = [
      { method: 'tasks.task.get', params: { id: getMapId().taskSuccess, select: ['id', 'title'] } },
      { method: 'tasks.task.update', params: { id: getMapId().taskSuccess, fields: { title: `TEST: [${Text.getDateForLog()}]` } } }
    ]

    const method = 'callBatchAsArrayObject'
    const requestId = `test@apiV3/${method}`
    const options = { isHaltOnError: true, returnAjaxResult: true, requestId }

    /**
     * This is the load to see the operating
     */
    // await Promise.all(Array.from({ length: 20 }, () => b24.callV3(batchCalls[0][0], batchCalls[0][1], requestId)))

    const response = await b24.callBatchV3<({ id: number } | { result: boolean })[]>(batchCalls, options)
    expect(response.isSuccess).toBe(true)

    const resultData = (response as Result<AjaxResult<{ id: number } | { result: boolean }>[]>).getData()

    expect(resultData).toBeDefined()
    for (const resultRow of resultData) {
      expect(resultRow).toBeInstanceOf(AjaxResult)
      expect(resultRow.isSuccess).toBe(true)

      const rowData = resultRow.getData()
      const result = rowData.result
      if ('result' in result) {
        expect(result).toHaveProperty('result')
        expect(result.result).toBeTruthy()
      } else {
        expect(result).toHaveProperty('item')
        expect(result.item.id).toBeDefined()
      }

      const time = rowData.time
      expect(time).toHaveProperty('operating')
      // @todo waite apiV3 fix docs
      expect(time.operating).toEqual(0)
      expect(time.operating_reset_at).toBeGreaterThan(0)
    }
  })
  it('as BatchNamedCommandsUniversal @apiV3 isSuccess isHaltOnError returnAjax', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchNamedCommandsUniversal = {
      cmd11: {
        method: 'tasks.task.get',
        params: { id: getMapId().taskSuccess, select: ['id', 'title'] }
      },
      cmd21: [
        'tasks.task.update',
        {
          id: getMapId().taskSuccess,
          fields: {
            title: `TEST: [${Text.getDateForLog()}]`
          }
        }
      ]
    }

    const keys = Object.keys(batchCalls)
    const method = 'callBatchAsObject'
    const requestId = `test@apiV3/${method}`
    const options = { isHaltOnError: true, returnAjaxResult: true, requestId }

    /**
     * This is the load to see the operating
     */
    // await Promise.all(Array.from({ length: 20 }, () => b24.callV3(batchCalls[0][0], batchCalls[0][1], requestId)))

    const response = await b24.callBatchV3<({ id: number } | { result: boolean })[]>(batchCalls, options)
    expect(response.isSuccess).toBe(true)

    const resultData = (response as Result<Record<string | number, AjaxResult<{ id: number } | { result: boolean }>>>).getData()
    expect(resultData).toBeDefined()
    for (const [index, resultRow] of Object.entries(resultData)) {
      expect(resultRow).toBeInstanceOf(AjaxResult)
      expect(resultRow.isSuccess).toBe(true)
      expect(keys).toContain(index)

      const rowData = resultRow.getData()
      const result = rowData.result
      if ('result' in result) {
        expect(result).toHaveProperty('result')
        expect(result.result).toBeTruthy()
      } else {
        expect(result).toHaveProperty('item')
        expect(result.item.id).toBeDefined()
      }

      const time = rowData.time
      expect(time).toHaveProperty('operating')
      // @todo waite apiV3 fix docs
      expect(time.operating).toEqual(0)
      expect(time.operating_reset_at).toBeGreaterThan(0)
    }
  })

  it('as BatchCommandsArrayUniversal @apiV3 isSuccess isHaltOnError', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchCommandsArrayUniversal = [
      ['tasks.task.get', { id: getMapId().taskSuccess, select: ['id', 'title'] }],
      ['tasks.task.update', { id: getMapId().taskSuccess, fields: { title: `TEST: [${Text.getDateForLog()}]` } }]
    ]

    const method = 'callBatchAsArray'
    const requestId = `test@apiV3/${method}`
    const options = { isHaltOnError: true, returnAjaxResult: false, requestId }

    /**
     * This is the load to see the operating
     */
    // await Promise.all(Array.from({ length: 20 }, () => b24.callV3(batchCalls[0][0], batchCalls[0][1], requestId)))

    const response = await b24.callBatchV3<({ id: number } | { result: boolean })[]>(batchCalls, options)

    expect(response.isSuccess).toBe(true)

    const resultData = (response as Result<({ item: { id: number } } | { result: boolean })[]>).getData()

    expect(resultData.length).toBeGreaterThan(0)
    for (const resultRow of resultData) {
      expect(resultRow).not.toBeInstanceOf(AjaxResult)
      const result = resultRow
      if ('result' in result) {
        expect(result).toHaveProperty('result')
        expect(result.result).toBeTruthy()
      } else {
        expect(result).toHaveProperty('item')
        expect(result.item.id).toBeDefined()
      }

      expect(resultRow).not.toHaveProperty('time')
    }
  })

  it('as BatchCommandsArrayUniversal @apiV3 !isSuccess !isHaltOnError returnAjax', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchCommandsArrayUniversal = [
      ['tasks.task.get', { id: getMapId().taskSuccess, select: ['id', 'title'] }],
      ['tasks.task.get', { ddId: getMapId().taskSuccess, select: ['id', 'title'] }],
      ['tasks.task.update', { id: getMapId().taskSuccess, fields: { title: `TEST: [${Text.getDateForLog()}]` } }],
      ['tasks.task.update', { ddId: getMapId().taskSuccess, fields: { title: `TEST: [${Text.getDateForLog()}]` } }]
    ]

    const method = 'callBatchAsArray'
    const requestId = `test@apiV3/${method}`
    const options = { isHaltOnError: false, returnAjaxResult: true, requestId }

    const response = await b24.callBatchV3<({ id: number } | { result: boolean })[]>(batchCalls, options)

    expect(response.isSuccess).toBe(false)

    const _resultData = (response as Result<AjaxResult<{ id: number | { result: boolean } }>[]>).getData()

    /**
     * In API V3, batch processing does not return data for each row in case of parallel processing errors.
     *
     * @see AbstractProcessingV3.handleResults()
     *
     * @todo ! api ver3 waite docs - this fake
     */
    expect(response.getErrorMessages().length).toBe(1)
  })
  it('as BatchCommandsObjectUniversal @apiV3 !isSuccess !isHaltOnError returnAjax', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchCommandsObjectUniversal = [
      { method: 'tasks.task.get', params: { id: getMapId().taskSuccess, select: ['id', 'title'] } },
      { method: 'tasks.task.get', params: { id: getMapId().taskFail, select: ['id', 'title'] } },
      { method: 'tasks.task.update', params: { id: getMapId().taskSuccess, fields: { title: `TEST: [${Text.getDateForLog()}]` } } },
      { method: 'tasks.task.update', params: { id: getMapId().taskWrong, fields: { title: `TEST: [${Text.getDateForLog()}]` } } }
    ]

    const method = 'callBatchAsArrayObject'
    const requestId = `test@apiV3/${method}`
    const options = { isHaltOnError: false, returnAjaxResult: true, requestId }

    const response = await b24.callBatchV3<({ id: number } | { result: boolean })[]>(batchCalls, options)

    expect(response.isSuccess).toBe(false)

    const _resultData = (response as Result<AjaxResult<{ id: number } | { result: boolean }>[]>).getData()

    /**
     * In API V3, batch processing does not return data for each row in case of parallel processing errors.
     *
     * @see AbstractProcessingV3.handleResults()
     *
     * @todo ! api ver3 waite docs - this fake
     */
    expect(response.getErrorMessages().length).toBe(1)
  })
  it('as BatchNamedCommandsUniversal @apiV3 !isSuccess !isHaltOnError returnAjax', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchNamedCommandsUniversal = {
      cmd11: {
        method: 'tasks.task.get',
        params: { id: getMapId().taskSuccess, select: ['id', 'title'] }
      },
      cmd12: {
        method: 'tasks.task.get',
        params: { id: getMapId().taskFail, select: ['id', 'title'] }
      },
      cmd21: [
        'tasks.task.update',
        {
          id: getMapId().taskSuccess,
          fields: {
            title: `TEST: [${Text.getDateForLog()}]`
          }
        }
      ],
      cmd22: [
        'tasks.task.update',
        {
          id: getMapId().taskWrong,
          fields: {
            title: `TEST: [${Text.getDateForLog()}]`
          }
        }
      ]
    }

    const method = 'callBatchAsObject'
    const requestId = `test@apiV3/${method}`
    const options = { isHaltOnError: false, returnAjaxResult: true, requestId }

    const response = await b24.callBatchV3<({ id: number } | { result: boolean })[]>(batchCalls, options)

    expect(response.isSuccess).toBe(false)

    const _resultData = (response as Result<Record<string | number, AjaxResult<{ id: number } | { result: boolean }>>>).getData()
    /**
     * In API V3, batch processing does not return data for each row in case of parallel processing errors.
     *
     * @see AbstractProcessingV3.handleResults()
     *
     * @todo ! api ver3 waite docs - this fake
     */
    expect(response.getErrorMessages().length).toBe(1)
  })

  it('as BatchCommandsArrayUniversal @apiV3 !isSuccess !isHaltOnError', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchCommandsArrayUniversal = [
      ['tasks.task.get', { id: getMapId().taskSuccess, select: ['id', 'title'] }],
      ['tasks.task.get', { ddId: getMapId().taskSuccess, select: ['id', 'title'] }],
      ['tasks.task.update', { id: getMapId().taskSuccess, fields: { title: `TEST: [${Text.getDateForLog()}]` } }],
      ['tasks.task.update', { ddId: getMapId().taskSuccess, fields: { title: `TEST: [${Text.getDateForLog()}]` } }]
    ]

    const method = 'callBatchAsArray'
    const requestId = `test@apiV3/${method}`
    const options = { isHaltOnError: false, returnAjaxResult: false, requestId }

    const response = await b24.callBatchV3<({ id: number } | { result: boolean })[]>(batchCalls, options)

    expect(response.isSuccess).toBe(false)

    const _resultData = (response as Result<({ item: { id: number } } | { result: boolean })[]>).getData()

    /**
     * In API V3, batch processing does not return data for each row in case of parallel processing errors.
     *
     * @see AbstractProcessingV3.handleResults()
     *
     * @todo ! api ver3 waite docs - this fake
     */
    expect(response.getErrorMessages().length).toBe(1)
  })

  it('as BatchCommandsArrayUniversal @apiV3 !isSuccess isHaltOnError returnAjax', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchCommandsArrayUniversal = [
      ['tasks.task.get', { id: getMapId().taskSuccess, select: ['id', 'title'] }],
      ['tasks.task.get', { ddId: getMapId().taskSuccess, select: ['id', 'title'] }],
      ['tasks.task.update', { id: getMapId().taskSuccess, fields: { title: `TEST: [${Text.getDateForLog()}]` } }],
      ['tasks.task.update', { ddId: getMapId().taskSuccess, fields: { title: `TEST: [${Text.getDateForLog()}]` } }]
    ]

    const method = 'callBatchAsArray'
    const requestId = `test@apiV3/${method}`
    const options = { isHaltOnError: true, returnAjaxResult: true, requestId }

    const response = await b24.callBatchV3<({ id: number } | { result: boolean })[]>(batchCalls, options)

    expect(response.isSuccess).toBe(false)

    const _resultData = (response as Result<AjaxResult<{ id: number } | { result: boolean }>[]>).getData()

    /**
     * In API V3, batch processing does not return data for each row in case of parallel processing errors.
     *
     * @see AbstractProcessingV3.handleResults()
     *
     * @todo ! api ver3 waite docs - this fake
     */
    expect(response.getErrorMessages().length).toBe(1)
  })
  it('as BatchCommandsObjectUniversal @apiV3 !isSuccess isHaltOnError returnAjax', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchCommandsObjectUniversal = [
      { method: 'tasks.task.get', params: { id: getMapId().taskSuccess, select: ['id', 'title'] } },
      { method: 'tasks.task.get', params: { id: getMapId().taskFail, select: ['id', 'title'] } },
      { method: 'tasks.task.update', params: { id: getMapId().taskSuccess, fields: { title: `TEST: [${Text.getDateForLog()}]` } } },
      { method: 'tasks.task.update', params: { id: getMapId().taskWrong, fields: { title: `TEST: [${Text.getDateForLog()}]` } } }
    ]

    const method = 'callBatchAsArrayObject'
    const requestId = `test@apiV3/${method}`
    const options = { isHaltOnError: true, returnAjaxResult: true, requestId }

    const response = await b24.callBatchV3<({ id: number } | { result: boolean })[]>(batchCalls, options)

    expect(response.isSuccess).toBe(false)

    const _resultData = (response as Result<AjaxResult<{ id: number } | { result: boolean }>[]>).getData()

    /**
     * In API V3, batch processing does not return data for each row in case of parallel processing errors.
     *
     * @see AbstractProcessingV3.handleResults()
     *
     * @todo ! api ver3 waite docs - this fake
     */
    expect(response.getErrorMessages().length).toBe(1)
  })
  it('as BatchNamedCommandsUniversal @apiV3 !isSuccess isHaltOnError returnAjax', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchNamedCommandsUniversal = {
      cmd11: {
        method: 'tasks.task.get',
        params: { id: getMapId().taskSuccess, select: ['id', 'title'] }
      },
      cmd12: {
        method: 'tasks.task.get',
        params: { id: getMapId().taskFail, select: ['id', 'title'] }
      },
      cmd21: [
        'tasks.task.update',
        {
          id: getMapId().taskSuccess,
          fields: {
            title: `TEST: [${Text.getDateForLog()}]`
          }
        }
      ],
      cmd22: [
        'tasks.task.update',
        {
          id: getMapId().taskWrong,
          fields: {
            title: `TEST: [${Text.getDateForLog()}]`
          }
        }
      ]
    }

    const method = 'callBatchAsObject'
    const requestId = `test@apiV3/${method}`
    const options = { isHaltOnError: true, returnAjaxResult: true, requestId }

    const response = await b24.callBatchV3<({ id: number } | { result: boolean })[]>(batchCalls, options)

    expect(response.isSuccess).toBe(false)

    const _resultData = (response as Result<Record<string | number, AjaxResult<{ id: number } | { result: boolean }>>>).getData()

    /**
     * In API V3, batch processing does not return data for each row in case of parallel processing errors.
     *
     * @see AbstractProcessingV3.handleResults()
     *
     * @todo ! api ver3 waite docs - this fake
     */
    expect(response.getErrorMessages().length).toBe(1)
  })

  it('as BatchCommandsArrayUniversal @apiV3 !isSuccess isHaltOnError', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchCommandsArrayUniversal = [
      ['tasks.task.get', { id: getMapId().taskSuccess, select: ['id', 'title'] }],
      ['tasks.task.get', { ddId: getMapId().taskSuccess, select: ['id', 'title'] }],
      ['tasks.task.update', { id: getMapId().taskSuccess, fields: { title: `TEST: [${Text.getDateForLog()}]` } }],
      ['tasks.task.update', { ddId: getMapId().taskSuccess, fields: { title: `TEST: [${Text.getDateForLog()}]` } }]
    ]

    const method = 'callBatchAsArray'
    const requestId = `test@apiV3/${method}`
    const options = { isHaltOnError: true, returnAjaxResult: false, requestId }

    const response = await b24.callBatchV3<({ id: number } | { result: boolean })[]>(batchCalls, options)

    expect(response.isSuccess).toBe(false)

    const _resultData = (response as Result<({ item: { id: number } } | { result: boolean })[]>).getData()

    /**
     * In API V3, batch processing does not return data for each row in case of parallel processing errors.
     *
     * @see AbstractProcessingV3.handleResults()
     *
     * @todo ! api ver3 waite docs - this fake
     */
    expect(response.getErrorMessages().length).toBe(1)
  })
  // console.debug(JSON.stringify(resultData, null, 2))
  // console.debug(JSON.stringify(_resultData, null, 2))
})
