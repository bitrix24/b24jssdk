import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchNamedCommandsUniversal,
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
     * @todo api ver3 waite docs - this fake
     */
    expect(response.getErrorMessages().length).toBe(1)
  })

  /**
   * @todo api ver3 waite docs
   * @todo test parallel
   * @todo test fail
   */
  it('use batch:ref @apiV3', async () => {
    const b24 = getB24Client()

    // const batchCalls: BatchCommandsObjectUniversal = [
    //   {
    //     method: 'main.message.get',
    //     params: {
    //       id: getMapId().messageSuccessV1,
    //       select: ['id', 'message', 'chat.id', 'chat.title']
    //     },
    //     as: 'FirstMessage' // @memo: this is `{ $ref: 'FirstMessage.xx' }`
    //   },
    //   {
    //     method: 'main.message.get',
    //     params: {
    //       id: getMapId().messageSuccessV2,
    //       select: ['id', 'message', 'chat.id', 'chat.title']
    //     }
    //     // @memo: this is `{ $ref: '1.xx' }`
    //   },
    //   {
    //     method: 'main.chat.update',
    //     params: {
    //       id: { $ref: 'FirstMessage.id' },
    //       fields: { title: `TEST: [${Text.getDateForLog()}]` }
    //     }
    //   },
    //   {
    //     method: 'main.chat.list',
    //     params: {
    //       filter: [
    //         ['id', 'in', [3, 4, 5, { $ref: 'FirstMessage.id' }, { $ref: '1.id' }]]
    //       ],
    //       select: ['id', 'message', 'chat.id', 'authorId']
    //     },
    //     as: 'MessagesList' // @memo: this is `{ $refArray: 'MessagesList.xx' }`
    //   },
    //   {
    //     method: 'main.user.list',
    //     params: {
    //       filter: [
    //         ['id', 'in', { $refArray: 'MessagesList.authorId' }]
    //       ],
    //       select: ['id', 'name']
    //     }
    //   }
    // ]

    const batchCalls: BatchNamedCommandsUniversal = {
      // test $ref
      FirstEventLogMessage: {
        method: 'main.eventlog.get',
        params: {
          id: getMapId().eventLogMessageSuccessV1,
          select: ['id', 'timestampX', 'userId', 'userAgent']
        },
        as: 'FirstEventLogMessage' // @memo: this is `{ $ref: 'FirstEventLogMessage.xx' }`
      },
      1: {
        method: 'main.eventlog.get',
        params: {
          id: getMapId().eventLogMessageSuccessV2,
          select: ['id', 'timestampX', 'userId', 'userAgent']
        }
        // @memo: this is `{ $ref: '1.xx' }`
      },
      EventLogMessagesList1: {
        method: 'main.eventlog.list',
        params: {
          order: { id: 'ASC' },
          filter: [
            ['id', 'in', [-1, 2, { $ref: 'FirstEventLogMessage.id' }, { $ref: '1.id' }]]
          ],
          select: ['id', 'userId']
        },
        as: 'EventLogMessagesList1' // @memo: this is `{ $refArray: 'EventLogMessagesList.xx' }`
      },
      // test $refArray
      EventLogMessagesList2: {
        method: 'main.eventlog.list',
        params: {
          order: { id: 'DESC' },
          filter: [
            ['userId', 'in', { $refArray: 'EventLogMessagesList1.userId' }]
          ],
          pagination: { page: 0, limit: 4 },
          select: ['id', 'timestampX', 'userId', 'userAgent']
        }
      },
      // test pagination
      MessagesListPageAll: {
        method: 'main.eventlog.list',
        params: {
          order: { id: 'DESC' },
          filter: [['id', '>', 0]],
          pagination: { page: 1, limit: 4 },
          select: ['id']
        }
      },
      MessagesListPage1: {
        method: 'main.eventlog.list',
        params: {
          order: { id: 'DESC' },
          filter: [['id', '>', 0]],
          pagination: { page: 1, limit: 2 },
          select: ['id']
        }
      },
      MessagesListPage2: {
        method: 'main.eventlog.list',
        params: {
          order: { id: 'DESC' },
          filter: [['id', '>', 0]],
          pagination: { page: 2, limit: 2 },
          select: ['id']
        }
      }
    }

    const method = 'callBatchAsArrayObject'
    const requestId = `test@apiV3/${method}`
    const options = { isHaltOnError: false, returnAjaxResult: true, requestId }

    const response = await b24.callBatchV3<({ id: number } | { result: boolean })[]>(batchCalls, options)
    if (!response.isSuccess) {
      throw new Error(response.getErrorMessages().join('; '))
    }

    expect(response.isSuccess).toBe(true)
    const resultData = (response as Result<Record<string, AjaxResult<any>>>).getData()
    // FirstEventLogMessage
    {
      expect(resultData.FirstEventLogMessage).toBeInstanceOf(AjaxResult)
      expect(resultData.FirstEventLogMessage.isSuccess).toBe(true)
      const rowData = resultData.FirstEventLogMessage.getData()
      expect(rowData.result).toHaveProperty('item')
      expect(rowData.result.item.id).toBe(getMapId().eventLogMessageSuccessV1)
      const time = rowData.time
      expect(time).toHaveProperty('operating')
      // @todo waite apiV3 fix docs
      expect(time.operating).toEqual(0)
      expect(time.operating_reset_at).toBeGreaterThan(0)
    }
    // 1
    {
      expect(resultData[1]).toBeInstanceOf(AjaxResult)
      expect(resultData[1].isSuccess).toBe(true)
      const rowData = resultData[1].getData()
      expect(rowData.result).toHaveProperty('item')
      expect(rowData.result.item.id).toBe(getMapId().eventLogMessageSuccessV2)
    }
    // EventLogMessagesList1
    {
      expect(resultData.EventLogMessagesList1).toBeInstanceOf(AjaxResult)
      expect(resultData.EventLogMessagesList1.isSuccess).toBe(true)
      const rowData = resultData.EventLogMessagesList1.getData()
      expect(rowData.result).toHaveProperty('items')
      expect(rowData.result.items.length).toBe(2)
      const time = rowData.time
      expect(time).toHaveProperty('operating')
      // @todo waite apiV3 fix docs
      expect(time.operating).toEqual(0)
      expect(time.operating_reset_at).toBeGreaterThan(0)
    }
    // EventLogMessagesList2
    {
      expect(resultData.EventLogMessagesList2).toBeInstanceOf(AjaxResult)
      expect(resultData.EventLogMessagesList2.isSuccess).toBe(true)
      const rowData = resultData.EventLogMessagesList2.getData()
      expect(rowData.result).toHaveProperty('items')
      expect(rowData.result.items.length).not.toBeGreaterThan(4)
    }
    // MessagesListPageAll

    const listPagination: number[] = []
    {
      expect(resultData.MessagesListPageAll).toBeInstanceOf(AjaxResult)
      expect(resultData.MessagesListPageAll.isSuccess).toBe(true)
      const rowData = resultData.MessagesListPageAll.getData()
      expect(rowData.result).toHaveProperty('items')
      expect(rowData.result.items.length).not.toBeGreaterThan(4)

      for (const row of rowData.result.items) {
        listPagination.push(Number.parseInt(row.id))
      }
    }
    // MessagesListPage1
    {
      const page1 = listPagination.slice(0, 2)
      expect(resultData.MessagesListPage1).toBeInstanceOf(AjaxResult)
      expect(resultData.MessagesListPage1.isSuccess).toBe(true)
      const rowData = resultData.MessagesListPage1.getData()
      expect(rowData.result).toHaveProperty('items')
      expect(rowData.result.items.length).not.toBeGreaterThan(2)
      for (const row of rowData.result.items) {
        expect(page1).toContain(row.id)
      }
    }
    // MessagesListPage2
    {
      const page2 = listPagination.slice(2, 4)
      expect(resultData.MessagesListPage2).toBeInstanceOf(AjaxResult)
      expect(resultData.MessagesListPage2.isSuccess).toBe(true)
      const rowData = resultData.MessagesListPage2.getData()
      expect(rowData.result).toHaveProperty('items')
      expect(rowData.result.items.length).not.toBeGreaterThan(2)
      for (const row of rowData.result.items) {
        expect(page2).toContain(row.id)
      }
    }
    // console.debug(
    //   { operating: b24.getHttpClient(ApiVersion.v3).getStats().operatingStats },
    //   JSON.stringify(resultData, null, 2)
    //   // JSON.stringify(resultData.map(row => row.getData().result), null, 2)
    // )
  })
  // console.debug(JSON.stringify(resultData, null, 2))
  // console.debug(JSON.stringify(_resultData, null, 2))
})
