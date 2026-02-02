import type { AjaxResult, BatchCommandsArrayUniversal } from '../../../packages/jssdk/src/'
import { describe, it, expect } from 'vitest'
import { setupB24Tests } from '../../0_setup/hooks-integration-jssdk'
import { EnumCrmEntityTypeId, Text } from '../../../packages/jssdk/src/'

describe('js-docs.actions @apiV2', () => {
  const { getB24Client, getMapId } = setupB24Tests()

  it('CallV2', async () => {
    const b24 = getB24Client()

    interface CrmItem { id: number, name: string, lastName: string }
    const response = await b24.actions.v2.call.make<{ item: CrmItem }>({
      method: 'crm.item.get',
      params: {
        entityTypeId: EnumCrmEntityTypeId.contact,
        id: getMapId().crmCompanySuccessMin
      },
      requestId: 'item-123'
    })
    if (!response.isSuccess) {
      throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
    }
    b24.getLogger().debug('response', {
      data: response.getData().result.item.name
    })

    expect(response.isSuccess).toBe(true)
    const result = response.getData().result
    expect(result.item).toBeDefined()
    expect(result.item.name).toBeDefined()
  })

  it('CallListV2', async () => {
    const b24 = getB24Client()

    interface CrmItem { id: number, title: string }
    const sixMonthAgo = new Date()
    sixMonthAgo.setMonth((new Date()).getMonth() - 6)
    sixMonthAgo.setHours(0, 0, 0)
    const response = await b24.actions.v2.callList.make<CrmItem>({
      method: 'crm.item.list',
      params: {
        entityTypeId: EnumCrmEntityTypeId.company,
        filter: {
          '=%title': 'A%',
          '>=createdTime': Text.toB24Format(sixMonthAgo) // created at least 6 months ago
        },
        select: ['id', 'title']
      },
      idKey: 'id',
      customKeyForResult: 'items',
      requestId: 'list-123'
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
  })

  it('FetchListV2', async () => {
    const b24 = getB24Client()

    interface CrmItem { id: number, title: string }
    const sixMonthAgo = new Date()
    sixMonthAgo.setMonth((new Date()).getMonth() - 6)
    sixMonthAgo.setHours(0, 0, 0)
    const generator = b24.actions.v2.fetchList.make<CrmItem>({
      method: 'crm.item.list',
      params: {
        entityTypeId: EnumCrmEntityTypeId.company,
        filter: {
          '=%title': 'A%',
          '>=createdTime': Text.toB24Format(sixMonthAgo) // created at least 6 months ago
        },
        select: ['id', 'title']
      },
      idKey: 'id',
      customKeyForResult: 'items',
      requestId: 'list-123'
    })

    for await (const chunk of generator) {
      expect(chunk.length).toBeGreaterThan(0)
      // Process chunk (e.g., save to database, analyze, etc.)
      b24.getLogger().debug(`Processing ${chunk.length} items`, { data: chunk })
    }
  })

  it('BatchV2 as BatchCommandsArrayUniversal', async () => {
    const b24 = getB24Client()

    interface Contact { id: number, name: string }
    const response = await b24.actions.v2.batch.make<{ item: Contact }>({
      calls: [
        ['crm.item.get', { entityTypeId: EnumCrmEntityTypeId.contact, id: getMapId().crmContactSuccessMin }],
        ['crm.item.get', { entityTypeId: EnumCrmEntityTypeId.contact, id: getMapId().crmContactSuccessMin }],
        ['crm.item.get', { entityTypeId: EnumCrmEntityTypeId.contact, id: getMapId().crmContactSuccessMin }]
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

    const results = response.getData() as AjaxResult<{ item: Contact }>[]
    results.forEach((result, index) => {
      if (result.isSuccess) {
        b24.getLogger().debug(`Item ${index + 1}`, {
          item: result.getData().result.item
        })
      }
    })

    expect(response.isSuccess).toBe(true)
  })

  it('BatchV2 as BatchCommandsObjectUniversal', async () => {
    const b24 = getB24Client()

    interface Contact { id: number, name: string }
    const response = await b24.actions.v2.batch.make<{ item: Contact }>({
      calls: [
        { method: 'crm.item.get', params: { entityTypeId: EnumCrmEntityTypeId.contact, id: getMapId().crmContactSuccessMin } },
        { method: 'crm.item.get', params: { entityTypeId: EnumCrmEntityTypeId.contact, id: getMapId().crmContactSuccessMin } }
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

    const results = response.getData() as AjaxResult<{ item: Contact }>[]
    results.forEach((result, index) => {
      if (result.isSuccess) {
        b24.getLogger().debug(`Item ${index + 1}`, {
          item: result.getData().result.item
        })
      }
    })

    expect(response.isSuccess).toBe(true)
  })

  it('BatchV2 as BatchNamedCommandsUniversal', async () => {
    const b24 = getB24Client()

    interface Contact { id: number, name: string }
    interface Deal { id: number, title: string }
    const response = await b24.actions.v2.batch.make<{ item: Contact } | { item: Deal }>({
      calls: {
        Contact: { method: 'crm.item.get', params: { entityTypeId: EnumCrmEntityTypeId.contact, id: getMapId().crmContactSuccessMin } },
        Deal: ['crm.item.get', { entityTypeId: EnumCrmEntityTypeId.deal, id: getMapId().crmDealSuccessMin }]
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

    const results = response.getData() as Record<string, AjaxResult<{ item: Contact } | { items: Deal }>>
    b24.getLogger().debug(`Contact`, {
      item: results.Contact.getData().result.item as Contact
    })
    b24.getLogger().debug(`Deal`, {
      item: results.Deal.getData().result.item as Deal
    })

    expect(response.isSuccess).toBe(true)
  })

  it('BatchByChunkV2', async () => {
    const b24 = getB24Client()

    interface Contact { id: number, name: string }
    const commands: BatchCommandsArrayUniversal = Array.from({ length: 150 }, (_, _i) =>
      ['crm.item.get', { entityTypeId: EnumCrmEntityTypeId.contact, id: getMapId().crmContactSuccessMin }]
    )

    const response = await b24.actions.v2.batchByChunk.make<{ item: Contact }>({
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
    const items: Contact[] = []
    data.forEach((chunkRow) => {
      items.push(chunkRow.item)
    })
    b24.getLogger().debug(`Successfully retrieved`, {
      items: items.length
    })

    expect(response.isSuccess).toBe(true)
  })
})
