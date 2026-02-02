import type { Result } from '../../../packages/jssdk/src/'
import { describe, it, expect } from 'vitest'
import { setupB24Tests } from '../../0_setup/hooks-integration-jssdk'
import { AjaxResult, EnumCrmEntityTypeId } from '../../../packages/jssdk/src/'

describe('core.deprecated @apiV2', () => {
  const { getB24Client, getMapId } = setupB24Tests()

  it('callMethod server.time', async () => {
    const b24 = getB24Client()

    const method = 'server.time'
    const params = {}
    const response = await b24.callMethod(method, params)

    expect(response.isSuccess).toBe(true)
    const result = response.getData().result
    const time = response.getData().time
    expect(result).toBeDefined()
    expect(time).toHaveProperty('operating')
    expect(time.operating).toBeGreaterThanOrEqual(0)
    expect(time.operating_reset_at).toBeGreaterThanOrEqual(0)
  })

  it('callMethod tasks.task.get', async () => {
    const b24 = getB24Client()

    const method = 'tasks.task.get'
    const params = {
      id: getMapId().taskSuccess,
      select: ['ID', 'TITLE']
    }
    const response = await b24.callMethod(method, params)

    expect(response.isSuccess).toBe(true)

    const result = response.getData().result
    expect(result.task).toBeDefined()
    expect(result.task).toHaveProperty('id')
    expect(result.task).toHaveProperty('title')

    const time = response.getData().time
    expect(time).toHaveProperty('operating')
    expect(time.operating).toBeGreaterThanOrEqual(0)
    expect(time.operating_reset_at).toBeGreaterThan(0)
  })

  it('callMethod crm.item.list and use start', async () => {
    const b24 = getB24Client()

    const method = 'crm.item.list'
    const params = {
      entityTypeId: EnumCrmEntityTypeId.company,
      filter: { '>id': getMapId().crmCompanySuccessMin },
      select: ['id'],
      start: undefined
    }

    const listPagination: number[] = []
    const responsePage11 = await b24.callMethod(method, params, 0)
    expect(responsePage11.isSuccess).toBe(true)

    const result11 = responsePage11.getData().result
    expect(result11.items).toBeDefined()
    expect(result11.items.length).toBeGreaterThan(2)
    for (const row of result11.items) {
      listPagination.push(Number.parseInt(row.id))
    }

    const responsePage12 = await b24.callMethod(method, params, 50)
    expect(responsePage12.isSuccess).toBe(true)

    const result12 = responsePage12.getData().result
    expect(result12.items).toBeDefined()
    expect(result12.items.length).toBeGreaterThan(2)
    for (const row of result12.items.slice(0, 2)) {
      expect(listPagination).not.toContain(row.id)
    }

    params.start = 0
    const responsePage21 = await b24.callMethod(method, params, 100)
    expect(responsePage21.isSuccess).toBe(true)

    const result21 = responsePage21.getData().result
    expect(result21.items).toBeDefined()
    expect(result21.items.length).toBeGreaterThan(2)
    for (const row of result21.items.slice(0, 2)) {
      expect(listPagination).toContain(row.id)
    }

    params.start = 50
    const responsePage22 = await b24.callMethod(method, params, 150)
    expect(responsePage22.isSuccess).toBe(true)

    const result22 = responsePage22.getData().result
    expect(result22.items).toBeDefined()
    expect(result22.items.length).toBeGreaterThan(2)
    for (const row of result22.items.slice(0, 2)) {
      expect(listPagination).not.toContain(row.id)
    }
  })

  it('callListMethod crm.item.list', async () => {
    const b24 = getB24Client()

    const method = 'crm.item.list'
    const params = {
      entityTypeId: EnumCrmEntityTypeId.company,
      filter: {
        '=%title': 'A%'
      },
      select: ['id', 'title']
    }

    const response = await b24.callListMethod(
      method,
      params,
      null,
      'items'
    )
    expect(response.isSuccess).toBe(true)

    const result = response.getData()
    expect(result.length).toBeGreaterThan(50)
  })

  it('fetchListMethod crm.item.list', async () => {
    const b24 = getB24Client()

    const method = 'crm.item.list'
    const params = {
      entityTypeId: EnumCrmEntityTypeId.company,
      filter: {
        '=%title': 'A%'
      },
      select: ['id', 'title']
    }

    const generator = b24.fetchListMethod(
      method,
      params,
      'id',
      'items'
    )

    for await (const chunk of generator) {
      expect(chunk.length).toBeGreaterThan(0)
      // for (const entity of chunk) {
      //   console.log(entity)
      // }
    }
  })

  it('callBatch crm.item.get', async () => {
    const b24 = getB24Client()

    const batchCalls = {
      Company: {
        method: 'crm.item.get',
        params: {
          entityTypeId: EnumCrmEntityTypeId.company,
          id: getMapId().crmCompanySuccessMin
        }
      },
      Contact: {
        method: 'crm.item.get',
        params: {
          entityTypeId: EnumCrmEntityTypeId.contact,
          id: getMapId().crmContactSuccessMin
        }
      }
    }
    const isHaltOnError = true
    const returnAjaxResult = true

    const response = await b24.callBatch(
      batchCalls,
      isHaltOnError,
      returnAjaxResult
    )

    expect(response.isSuccess).toBe(true)

    const resultData = (response as Result<Record<string, AjaxResult<any>>>).getData()
    // Company
    {
      expect(resultData.Company).toBeInstanceOf(AjaxResult)
      expect(resultData.Company.isSuccess).toBe(true)
      const rowData = resultData.Company.getData()
      expect(rowData.result).toHaveProperty('item')
      expect(rowData.result.item.id).toBe(getMapId().crmCompanySuccessMin)
      const time = rowData.time
      expect(time).toHaveProperty('operating')
      expect(time.operating).toBeGreaterThanOrEqual(0)
      expect(time.operating_reset_at).toBeGreaterThan(0)
    }
    // Contact
    {
      expect(resultData.Contact).toBeInstanceOf(AjaxResult)
      expect(resultData.Contact.isSuccess).toBe(true)
      const rowData = resultData.Contact.getData()
      expect(rowData.result).toHaveProperty('item')
      expect(rowData.result.item.id).toBe(getMapId().crmContactSuccessMin)
      const time = rowData.time
      expect(time).toHaveProperty('operating')
      expect(time.operating).toBeGreaterThanOrEqual(0)
      expect(time.operating_reset_at).toBeGreaterThan(0)
    }
  })

  it('callBatchByChunk crm.item.get', async () => {
    const b24 = getB24Client()

    const batchCalls = Array.from({ length: 150 }, (_, _i) =>
      ['crm.item.get', { entityTypeId: EnumCrmEntityTypeId.contact, id: getMapId().crmContactSuccessMin }]
    )

    const isHaltOnError = false

    const response = await b24.callBatchByChunk(
      batchCalls,
      isHaltOnError
    )

    expect(response.isSuccess).toBe(true)
    const list: number[] = []
    const resultData = response.getData()
    for (const row of resultData) {
      list.push(Number.parseInt(row.item.id))
    }

    expect(list.length).toBe(batchCalls.length)
  })
})
