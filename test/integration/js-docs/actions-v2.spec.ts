import type { AjaxResult, BatchCommandsArrayUniversal } from '../../../packages/jssdk/src/'
import { describe, it, expect } from 'vitest'
import { setupB24Tests } from '../../0_setup/hooks-integration-jssdk'
import { EnumCrmEntityTypeId } from '../../../packages/jssdk/src/'
import { Text } from '../../../packages/jssdk/src/'

describe('js-docs.actions @apiV2', () => {
  const { getB24Client, getMapId } = setupB24Tests()

  // @todo ! uncoment
  // it('CallV2', async () => {
  //   const b24 = getB24Client()
  //
  //   interface CrmItem { id: number, name: string, lastName: string }
  //   const response = await b24.actions.v2.call.make<{ item: CrmItem }>({
  //     method: 'crm.item.get',
  //     params: { entityTypeId: EnumCrmEntityTypeId.contact, id: getMapId().crmCompanySuccessMin },
  //     requestId: 'item-123'
  //   })
  //   if (!response.isSuccess) {
  //     throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
  //   }
  //   b24.getLogger().debug('response', {
  //     data: response.getData().result.item.name
  //   })
  //
  //   expect(response.isSuccess).toBe(true)
  //   const result = response.getData().result
  //   expect(result.item).toBeDefined()
  //   expect(result.item.name).toBeDefined()
  // })

  /**
   * @todo ! fix select -> more small size
   */
  it('CallListV2', async () => {
    const b24 = getB24Client()

    interface CrmItem { id: number, name: string }
    const sixMonthAgo = new Date()
    sixMonthAgo.setMonth((new Date()).getMonth() - 6)
    sixMonthAgo.setHours(0, 0, 0)
    const response = await b24.actions.v2.callList.make<CrmItem>({
      method: 'crm.item.list',
      params: {
        entityTypeId: EnumCrmEntityTypeId.contact,
        filter: { '>=createdTime': Text.toB24Format(sixMonthAgo) }, // created at least 6 months ago
        select: ['id', 'userId']
      },
      idKey: 'id',
      customKeyForResult: 'items',
      requestId: 'list-123'
    })
    if (!response.isSuccess) {
      throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
    }
    const list = response.getData()

    b24.getLogger().info('response', {
      data: list?.length // Number of items received
    })

    // expect(response.isSuccess).toBe(true)
    // const result = response.getData().result
    // expect(result.item).toBeDefined()
    // expect(result.item).toBeDefined()
    // expect(result.item.title).toBeDefined()
  })

  /**
   * @todo ! waite wile rest unLock
   */
  // it('FetchListV3', async () => {
  //   const b24 = getB24Client()
  //
  //   interface MainEventLogItem { id: number, userId: number }
  //   const sixMonthAgo = new Date()
  //   sixMonthAgo.setMonth((new Date()).getMonth() - 6)
  //   sixMonthAgo.setHours(0, 0, 0)
  //   const generator = b24.actions.v3.fetchList.make<MainEventLogItem>({
  //     method: 'main.eventlog.list',
  //     params: {
  //       // filter: [
  //       //   // ['timestampX', '>=', Text.toB24Format(sixMonthAgo)] // created at least 6 months ago
  //       // ],
  //       select: ['id', 'userId']
  //     },
  //     idKey: 'id',
  //     customKeyForResult: 'items',
  //     requestId: 'eventlog-123'
  //     // limit: 60
  //   })
  //   for await (const chunk of generator) {
  //     b24.getLogger().info('response', {
  //       data: chunk?.length
  //     })
  //   }
  //
  //   // expect(response.isSuccess).toBe(true)
  //   // const result = response.getData().result
  //   // expect(result.item).toBeDefined()
  //   // expect(result.item).toBeDefined()
  //   // expect(result.item.title).toBeDefined()
  // })

  // @todo ! uncoment this
  // it('BatchV3 as BatchCommandsArrayUniversal', async () => {
  //   const b24 = getB24Client()
  //
  //   interface TaskItem { id: number, title: string }
  //   const response = await b24.actions.v3.batch.make<{ item: TaskItem }>({
  //     calls: [
  //       ['tasks.task.get', { id: getMapId().taskSuccess, select: ['id', 'title'] }],
  //       ['tasks.task.get', { id: getMapId().taskSuccess, select: ['id', 'title'] }],
  //       ['tasks.task.get', { id: getMapId().taskSuccess, select: ['id', 'title'] }]
  //     ],
  //     options: {
  //       isHaltOnError: true,
  //       returnAjaxResult: true,
  //       requestId: 'batch-123'
  //     }
  //   })
  //
  //   if (!response.isSuccess) {
  //     throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
  //   }
  //
  //   const results = response.getData() as AjaxResult<{ item: TaskItem }>[]
  //   results.forEach((result, index) => {
  //     if (result.isSuccess) {
  //       b24.getLogger().debug(`Item ${index + 1}`, {
  //         item: result.getData().result.item
  //       })
  //     }
  //   })
  //
  //   expect(response.isSuccess).toBe(true)
  // })
  //
  // it('BatchV3 as BatchCommandsObjectUniversal', async () => {
  //   const b24 = getB24Client()
  //
  //   interface TaskItem { id: number, title: string }
  //   const response = await b24.actions.v3.batch.make<{ item: TaskItem }>({
  //     calls: [
  //       { method: 'tasks.task.get', params: { id: getMapId().taskSuccess, select: ['id', 'title'] } },
  //       { method: 'tasks.task.get', params: { id: getMapId().taskSuccess, select: ['id', 'title'] } }
  //     ],
  //     options: {
  //       isHaltOnError: true,
  //       returnAjaxResult: true,
  //       requestId: 'batch-123'
  //     }
  //   })
  //
  //   if (!response.isSuccess) {
  //     throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
  //   }
  //
  //   const results = response.getData() as AjaxResult<{ item: TaskItem }>[]
  //   results.forEach((result, index) => {
  //     if (result.isSuccess) {
  //       b24.getLogger().debug(`Item ${index + 1}`, {
  //         item: result.getData().result.item
  //       })
  //     }
  //   })
  //
  //   expect(response.isSuccess).toBe(true)
  // })
  //
  // it('BatchV3 as BatchNamedCommandsUniversal', async () => {
  //   const b24 = getB24Client()
  //
  //   interface TaskItem { id: number, title: string }
  //   interface MainEventLogItem { id: number, userId: number }
  //   const response = await b24.actions.v3.batch.make<{ item: TaskItem } | { items: MainEventLogItem[] }>({
  //     calls: {
  //       Task: { method: 'tasks.task.get', params: { id: 1, select: ['id', 'title'] } },
  //       MainEventLog: ['main.eventlog.list', { select: ['id', 'userId'], pagination: { limit: 5 } }]
  //     },
  //     options: {
  //       isHaltOnError: true,
  //       returnAjaxResult: true,
  //       requestId: 'batch-123'
  //     }
  //   })
  //
  //   if (!response.isSuccess) {
  //     throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
  //   }
  //
  //   const results = response.getData() as Record<string, AjaxResult<{ item: TaskItem } | { items: MainEventLogItem[] }>>
  //   b24.getLogger().debug(`Task`, {
  //     item: results.Task.getData().result.item as TaskItem
  //   })
  //   b24.getLogger().debug(`MainEventLog`, {
  //     item: results.MainEventLog.getData().result.items as MainEventLogItem[]
  //   })
  //
  //   expect(response.isSuccess).toBe(true)
  // })
  //
  // it('BatchByChunkV3', async () => {
  //   const b24 = getB24Client()
  //
  //   interface TaskItem { id: number, title: string }
  //   const commands: BatchCommandsArrayUniversal = Array.from({ length: 150 }, (_, _i) =>
  //     ['tasks.task.get', { id: getMapId().taskSuccess, select: ['id', 'title'] }]
  //   )
  //
  //   const response = await b24.actions.v3.batchByChunk.make<{ item: TaskItem }>({
  //     calls: commands,
  //     options: {
  //       isHaltOnError: false,
  //       requestId: 'batch-by-chunk-123'
  //     }
  //   })
  //
  //   if (!response.isSuccess) {
  //     throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
  //   }
  //
  //   const data = response.getData()
  //   const items: TaskItem[] = []
  //   data.forEach((chunkRow) => {
  //     items.push(chunkRow.item)
  //   })
  //   b24.getLogger().debug(`Successfully retrieved`, {
  //     items: items.length
  //   })
  //
  //   expect(response.isSuccess).toBe(true)
  // })
})
