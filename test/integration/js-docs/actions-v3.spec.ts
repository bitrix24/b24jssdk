import type { AjaxResult, BatchCommandsArrayUniversal } from '../../../packages/jssdk/src/'
import { SdkError, Text } from '../../../packages/jssdk/src/'
import { describe, it, expect } from 'vitest'
import { setupB24Tests } from '../../0_setup/hooks-integration-jssdk'

describe('js-docs.actions @apiV3', () => {
  const { getB24Client, getMapId } = setupB24Tests()

  it('CallV3', async () => {
    const b24 = getB24Client()

    interface TaskItem { id: number, title: string }
    const response = await b24.actions.v3.call.make<{ item: TaskItem }>({
      method: 'tasks.task.get',
      params: { id: getMapId().taskSuccess, select: ['id', 'title'] },
      requestId: 'task-123'
    })
    if (!response.isSuccess) {
      throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
    }
    b24.getLogger().debug('response', {
      data: response.getData().result.item.title
    })

    expect(response.isSuccess).toBe(true)
    const result = response.getData().result
    expect(result.item).toBeDefined()
    expect(result.item.title).toBeDefined()
  })

  /**
   * @todo Please fix this when `restApi:v3` is ready.
   */
  it('CallListV3', async () => {
    const b24 = getB24Client()

    try {
      interface MainEventLogItem { id: number, userId: number }
      const sixMonthAgo = new Date()
      sixMonthAgo.setMonth((new Date()).getMonth() - 6)
      sixMonthAgo.setHours(0, 0, 0)
      const response = await b24.actions.v3.callList.make<MainEventLogItem>({
        method: 'main.eventlog.list',
        params: {
          filter: [
            ['timestampX', '>=', Text.toB24Format(sixMonthAgo)] // created at least 6 months ago
          ],
          select: ['id', 'userId']
        },
        idKey: 'id',
        customKeyForResult: 'items',
        requestId: 'eventlog-123',
        limit: 60
      })
      if (!response.isSuccess) {
        throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
      }
      const list = response.getData()
      expect(list.length).toBeGreaterThan(0)
      b24.getLogger().debug('response', {
        data: list?.length // Number of items received
      })

      expect(response.isSuccess).toBe(true)
    } catch (error) {
      if (!(error instanceof SdkError)) {
        throw error
      }
      expect(error.code).toEqual('INTERNAL_SERVER_ERROR')
      console.warn('❌ Some problem in b24.actions.v3.callList.make for main.eventlog.list')
    }
  })

  /**
   * @todo Please fix this when `restApi:v3` is ready.
   */
  it('FetchListV3', async () => {
    const b24 = getB24Client()
    try {
      interface MainEventLogItem { id: number, userId: number }
      const sixMonthAgo = new Date()
      sixMonthAgo.setMonth((new Date()).getMonth() - 6)
      sixMonthAgo.setHours(0, 0, 0)
      const generator = b24.actions.v3.fetchList.make<MainEventLogItem>({
        method: 'main.eventlog.list',
        params: {
          filter: [
            ['timestampX', '>=', Text.toB24Format(sixMonthAgo)] // created at least 6 months ago
          ],
          select: ['id', 'userId']
        },
        idKey: 'id',
        customKeyForResult: 'items',
        requestId: 'eventlog-123',
        limit: 10
      })
      for await (const chunk of generator) {
        expect(chunk.length).toBeGreaterThan(0)
        // Process chunk (e.g., save to database, analyze, etc.)
        b24.getLogger().debug(`Processing ${chunk.length} items`, { data: chunk })
      }
    } catch (error) {
      if (!(error instanceof SdkError)) {
        throw error
      }
      expect(error.code).toEqual('INTERNAL_SERVER_ERROR')
      console.warn('❌ Some problem in b24.actions.v3.fetchList.make for main.eventlog.list')
    }
  })

  it('BatchV3 as BatchCommandsArrayUniversal', async () => {
    const b24 = getB24Client()

    interface TaskItem { id: number, title: string }
    const response = await b24.actions.v3.batch.make<{ item: TaskItem }>({
      calls: [
        ['tasks.task.get', { id: getMapId().taskSuccess, select: ['id', 'title'] }],
        ['tasks.task.get', { id: getMapId().taskSuccess, select: ['id', 'title'] }],
        ['tasks.task.get', { id: getMapId().taskSuccess, select: ['id', 'title'] }]
      ],
      options: {
        isHaltOnError: true,
        returnAjaxResult: true,
        requestId: 'batch-123'
      }
    })

    if (!response.isSuccess) {
      throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
    }

    const results = response.getData() as AjaxResult<{ item: TaskItem }>[]
    results.forEach((result, index) => {
      if (result.isSuccess) {
        b24.getLogger().debug(`Item ${index + 1}`, {
          item: result.getData().result.item
        })
      }
    })

    expect(response.isSuccess).toBe(true)
  })

  it('BatchV3 as BatchCommandsObjectUniversal', async () => {
    const b24 = getB24Client()

    interface TaskItem { id: number, title: string }
    const response = await b24.actions.v3.batch.make<{ item: TaskItem }>({
      calls: [
        { method: 'tasks.task.get', params: { id: getMapId().taskSuccess, select: ['id', 'title'] } },
        { method: 'tasks.task.get', params: { id: getMapId().taskSuccess, select: ['id', 'title'] } }
      ],
      options: {
        isHaltOnError: true,
        returnAjaxResult: true,
        requestId: 'batch-123'
      }
    })

    if (!response.isSuccess) {
      throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
    }

    const results = response.getData() as AjaxResult<{ item: TaskItem }>[]
    results.forEach((result, index) => {
      if (result.isSuccess) {
        b24.getLogger().debug(`Item ${index + 1}`, {
          item: result.getData().result.item
        })
      }
    })

    expect(response.isSuccess).toBe(true)
  })

  it('BatchV3 as BatchNamedCommandsUniversal', async () => {
    const b24 = getB24Client()

    interface TaskItem { id: number, title: string }
    interface MainEventLogItem { id: number, userId: number }
    const response = await b24.actions.v3.batch.make<{ item: TaskItem } | { items: MainEventLogItem[] }>({
      calls: {
        Task: { method: 'tasks.task.get', params: { id: 1, select: ['id', 'title'] } },
        MainEventLog: ['main.eventlog.list', { select: ['id', 'userId'], pagination: { limit: 5 } }]
      },
      options: {
        isHaltOnError: true,
        returnAjaxResult: true,
        requestId: 'batch-123'
      }
    })

    if (!response.isSuccess) {
      throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
    }

    const results = response.getData() as Record<string, AjaxResult<{ item: TaskItem } | { items: MainEventLogItem[] }>>
    b24.getLogger().debug(`Task`, {
      item: results.Task.getData().result.item as TaskItem
    })
    b24.getLogger().debug(`MainEventLog`, {
      item: results.MainEventLog.getData().result.items as MainEventLogItem[]
    })

    expect(response.isSuccess).toBe(true)
  })

  it('BatchByChunkV3', async () => {
    const b24 = getB24Client()

    interface TaskItem { id: number, title: string }
    const commands: BatchCommandsArrayUniversal = Array.from({ length: 150 }, (_, _i) =>
      ['tasks.task.get', { id: getMapId().taskSuccess, select: ['id', 'title'] }]
    )

    const response = await b24.actions.v3.batchByChunk.make<{ item: TaskItem }>({
      calls: commands,
      options: {
        isHaltOnError: false,
        requestId: 'batch-by-chunk-123'
      }
    })

    if (!response.isSuccess) {
      throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
    }

    const data = response.getData()
    const items: TaskItem[] = []
    data.forEach((chunkRow) => {
      items.push(chunkRow.item)
    })
    b24.getLogger().debug(`Successfully retrieved`, {
      items: items.length
    })

    expect(response.isSuccess).toBe(true)
  })
})
