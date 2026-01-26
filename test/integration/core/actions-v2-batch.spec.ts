import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal, BatchNamedCommandsUniversal,
  Result,
  SdkError
} from '../../../packages/jssdk/src/'
import { describe, it, expect } from 'vitest'
import { setupB24Tests } from '../../0_setup/hooks-integration-jssdk'
import { EnumCrmEntityTypeId, AjaxResult } from '../../../packages/jssdk/src/'

/**
 * @todo add test batch inner link
 */
describe('core callBatch @apiV2', () => {
  const { getB24Client, getMapId } = setupB24Tests()
  it('as BatchCommandsArrayUniversal @apiV2 isSuccess isHaltOnError returnAjax', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchCommandsArrayUniversal = [
      ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': getMapId().crmCompanySuccessMin } }],
      ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': getMapId().crmCompanySuccessMax } }]
    ]

    const method = 'callBatchAsArray'
    const requestId = `test@apiV2/${method}`
    const options = { isHaltOnError: true, returnAjaxResult: true, requestId }
    const response = await b24.actions.v2.batch.make<{ id: number }[]>({
      calls: batchCalls,
      options
    })

    expect(response.isSuccess).toBe(true)

    const resultData = (response as Result<AjaxResult<{ id: number }>[]>).getData()
    expect(resultData.length).toBeGreaterThan(0)
    for (const resultRow of resultData) {
      expect(resultRow).toBeInstanceOf(AjaxResult)
      expect(resultRow.isSuccess).toBe(true)
      const rowData = resultRow.getData()
      const result = rowData.result
      expect(result).toHaveProperty('items')
      expect(result.items.length).toBeGreaterThan(0)

      const time = rowData.time
      expect(time).toHaveProperty('operating')
      expect(time.operating).toBeGreaterThanOrEqual(0)
      expect(time.operating_reset_at).toBeGreaterThan(0)
    }
  })
  it('as BatchCommandsObjectUniversal @apiV2 isSuccess isHaltOnError returnAjax', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchCommandsObjectUniversal = [
      { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': getMapId().crmCompanySuccessMin } } },
      { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': getMapId().crmCompanySuccessMax } } }
    ]

    const method = 'callBatchAsArrayObject'
    const requestId = `test@apiV2/${method}`
    const options = { isHaltOnError: true, returnAjaxResult: true, requestId }
    const response = await b24.actions.v2.batch.make<{ id: number }[]>({
      calls: batchCalls,
      options
    })
    expect(response.isSuccess).toBe(true)

    const resultData = (response as Result<AjaxResult<{ id: number }>[]>).getData()

    expect(resultData).toBeDefined()
    for (const resultRow of resultData) {
      expect(resultRow).toBeInstanceOf(AjaxResult)
      expect(resultRow.isSuccess).toBe(true)

      const rowData = resultRow.getData()
      const result = rowData.result
      expect(result).toHaveProperty('items')
      expect(result.items.length).toBeGreaterThan(0)

      const time = rowData.time
      expect(time).toHaveProperty('operating')
      expect(time.operating).toBeGreaterThanOrEqual(0)
      expect(time.operating_reset_at).toBeGreaterThan(0)
    }
  })
  it('as BatchNamedCommandsUniversal @apiV2 isSuccess isHaltOnError returnAjax', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchNamedCommandsUniversal = {
      cmd11: {
        method: 'crm.item.list',
        params: {
          entityTypeId: EnumCrmEntityTypeId.company,
          select: ['id'],
          filter: { '>id': getMapId().crmCompanySuccessMin }
        }
      },
      cmd21: [
        'crm.item.list',
        {
          entityTypeId: EnumCrmEntityTypeId.company,
          select: ['id'],
          filter: { '>id': getMapId().crmCompanySuccessMax }
        }
      ]
    }

    const keys = Object.keys(batchCalls)
    const method = 'callBatchAsObject'
    const requestId = `test@apiV2/${method}`
    const options = { isHaltOnError: true, returnAjaxResult: true, requestId }
    const response = await b24.actions.v2.batch.make<{ id: number }[]>({
      calls: batchCalls,
      options
    })
    expect(response.isSuccess).toBe(true)

    const resultData = (response as Result<Record<string | number, AjaxResult<{ id: number }>>>).getData()
    expect(resultData).toBeDefined()
    for (const [index, resultRow] of Object.entries(resultData)) {
      expect(resultRow).toBeInstanceOf(AjaxResult)
      expect(resultRow.isSuccess).toBe(true)
      expect(keys).toContain(index)

      const rowData = resultRow.getData()
      const result = rowData.result
      expect(result).toHaveProperty('items')
      expect(result.items.length).toBeGreaterThan(0)

      const time = rowData.time
      expect(time).toHaveProperty('operating')
      expect(time.operating).toBeGreaterThanOrEqual(0)
      expect(time.operating_reset_at).toBeGreaterThan(0)
    }
  })

  it('as BatchCommandsArrayUniversal @apiV2 isSuccess isHaltOnError', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchCommandsArrayUniversal = [
      ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': getMapId().crmCompanySuccessMin } }],
      ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': getMapId().crmCompanySuccessMax } }]
    ]

    const method = 'callBatchAsArray'
    const requestId = `test@apiV2/${method}`
    const options = { isHaltOnError: true, returnAjaxResult: false, requestId }
    const response = await b24.actions.v2.batch.make<{ items: { id: number }[] }[]>({
      calls: batchCalls,
      options
    })

    expect(response.isSuccess).toBe(true)

    const resultData = (response as Result<{ items: { id: number }[] }[]>).getData()

    expect(resultData.length).toBeGreaterThan(0)

    for (const resultRow of resultData) {
      expect(resultRow).not.toBeInstanceOf(AjaxResult)
      const result = resultRow
      expect(result).toHaveProperty('items')
      expect(result.items.length).toBeGreaterThan(0)

      expect(resultRow).not.toHaveProperty('time')
    }
  })

  it('as BatchCommandsArrayUniversal @apiV2 !isSuccess !isHaltOnError returnAjax', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchCommandsArrayUniversal = [
      ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': getMapId().crmCompanySuccessMin } }],
      ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>ddId': getMapId().crmCompanySuccessMin } }],
      ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': getMapId().crmCompanySuccessMax } }],
      ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>ddId': getMapId().crmCompanySuccessMax } }]
    ]

    const method = 'callBatchAsArray'
    const requestId = `test@apiV2/${method}`
    const options = { isHaltOnError: false, returnAjaxResult: true, requestId }
    const response = await b24.actions.v2.batch.make<{ id: number }[]>({
      calls: batchCalls,
      options
    })

    expect(response.isSuccess).toBe(false)

    const resultData = (response as Result<AjaxResult<{ id: number }>[]>).getData()

    expect(response.getErrorMessages().length).toBe(2)
    for (const resultRow of resultData) {
      expect(resultRow).toBeInstanceOf(AjaxResult)
      if (resultRow.isSuccess) {
        expect(resultRow.isSuccess).toBe(true)

        const rowData = resultRow.getData()
        const result = rowData.result
        expect(result).toHaveProperty('items')
        expect(result.items.length).toBeGreaterThan(0)

        const time = rowData.time
        expect(time).toHaveProperty('operating')
        expect(time.operating).toBeGreaterThanOrEqual(0)
        expect(time.operating_reset_at).toBeGreaterThan(0)
      } else {
        const errors = Array.from(resultRow.getErrors()) as SdkError[]
        const mainError = errors.find(error => error?.code === 'INVALID_ARG_VALUE')
        expect(mainError).toBeDefined()
      }
    }

    const errors = Array.from(response.getErrors()) as SdkError[]
    const mainError = errors.find(error => error?.code === 'INVALID_ARG_VALUE')
    expect(mainError).toBeDefined()
  })
  it('as BatchCommandsObjectUniversal @apiV2 !isSuccess !isHaltOnError returnAjax', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchCommandsObjectUniversal = [
      { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': getMapId().crmCompanySuccessMin } } },
      { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>ddId': getMapId().crmCompanySuccessMin } } },
      { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': getMapId().crmCompanySuccessMax } } },
      { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>ddId': getMapId().crmCompanySuccessMax } } }
    ]

    const method = 'callBatchAsArrayObject'
    const requestId = `test@apiV2/${method}`
    const options = { isHaltOnError: false, returnAjaxResult: true, requestId }
    const response = await b24.actions.v2.batch.make<{ id: number }[]>({
      calls: batchCalls,
      options
    })

    expect(response.isSuccess).toBe(false)

    const resultData = (response as Result<AjaxResult<{ id: number }>[]>).getData()

    expect(response.getErrorMessages().length).toBe(2)
    expect(resultData).toBeDefined()
    for (const resultRow of resultData) {
      expect(resultRow).toBeInstanceOf(AjaxResult)
      if (resultRow.isSuccess) {
        expect(resultRow.isSuccess).toBe(true)

        const rowData = resultRow.getData()
        const result = rowData.result
        expect(result).toHaveProperty('items')
        expect(result.items.length).toBeGreaterThan(0)

        const time = rowData.time
        expect(time).toHaveProperty('operating')
        expect(time.operating).toBeGreaterThanOrEqual(0)
        expect(time.operating_reset_at).toBeGreaterThan(0)
      } else {
        const errors = Array.from(resultRow.getErrors()) as SdkError[]
        const mainError = errors.find(error => error?.code === 'INVALID_ARG_VALUE')
        expect(mainError).toBeDefined()
      }
    }

    const errors = Array.from(response.getErrors()) as SdkError[]
    const mainError = errors.find(error => error?.code === 'INVALID_ARG_VALUE')
    expect(mainError).toBeDefined()
  })
  it('as BatchNamedCommandsUniversal @apiV2 !isSuccess !isHaltOnError returnAjax', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchNamedCommandsUniversal = {
      cmd11: {
        method: 'crm.item.list',
        params: {
          entityTypeId: EnumCrmEntityTypeId.company,
          select: ['id'],
          filter: { '>id': getMapId().crmCompanySuccessMin }
        }
      },
      cmd12: {
        method: 'crm.item.list',
        params: {
          entityTypeId: EnumCrmEntityTypeId.company,
          select: ['id'],
          filter: { '>ddId': getMapId().crmCompanySuccessMin }
        }
      },
      cmd21: [
        'crm.item.list',
        {
          entityTypeId: EnumCrmEntityTypeId.company,
          select: ['id'],
          filter: { '>id': getMapId().crmCompanySuccessMax }
        }
      ],
      cmd22: [
        'crm.item.list',
        {
          entityTypeId: EnumCrmEntityTypeId.company,
          select: ['id'],
          filter: { '>ddId': getMapId().crmCompanySuccessMax }
        }
      ]
    }

    const keys = Object.keys(batchCalls)
    const method = 'callBatchAsObject'
    const requestId = `test@apiV2/${method}`
    const options = { isHaltOnError: false, returnAjaxResult: true, requestId }
    const response = await b24.actions.v2.batch.make<{ id: number }[]>({
      calls: batchCalls,
      options
    })
    expect(response.isSuccess).toBe(false)

    const resultData = (response as Result<Record<string | number, AjaxResult<{ id: number }>>>).getData()

    expect(response.getErrorMessages().length).toBe(2)
    expect(resultData).toBeDefined()
    for (const [index, resultRow] of Object.entries(resultData)) {
      expect(resultRow).toBeInstanceOf(AjaxResult)
      if (resultRow.isSuccess) {
        expect(resultRow.isSuccess).toBe(true)
        expect(keys).toContain(index)

        const rowData = resultRow.getData()
        const result = rowData.result
        expect(result).toHaveProperty('items')
        expect(result.items.length).toBeGreaterThan(0)

        const time = rowData.time
        expect(time).toHaveProperty('operating')
        expect(time.operating).toBeGreaterThanOrEqual(0)
        expect(time.operating_reset_at).toBeGreaterThan(0)
      } else {
        expect(keys).toContain(index)
        const errors = Array.from(resultRow.getErrors()) as SdkError[]
        const mainError = errors.find(error => error?.code === 'INVALID_ARG_VALUE')
        expect(mainError).toBeDefined()
      }
    }

    const errors = Array.from(response.getErrors()) as SdkError[]
    const mainError = errors.find(error => error?.code === 'INVALID_ARG_VALUE')
    expect(mainError).toBeDefined()
  })

  it('as BatchCommandsArrayUniversal @apiV2 !isSuccess !isHaltOnError', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchCommandsArrayUniversal = [
      ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': getMapId().crmCompanySuccessMin } }],
      ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>ddId': getMapId().crmCompanySuccessMin } }],
      ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': getMapId().crmCompanySuccessMax } }],
      ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>ddId': getMapId().crmCompanySuccessMax } }]
    ]

    const method = 'callBatchAsArray'
    const requestId = `test@apiV2/${method}`
    const options = { isHaltOnError: false, returnAjaxResult: false, requestId }
    const response = await b24.actions.v2.batch.make<{ items: { id: number }[] }[]>({
      calls: batchCalls,
      options
    })

    expect(response.isSuccess).toBe(false)

    const resultData = (response as Result<{ items: { id: number }[] }[]>).getData()

    expect(response.getErrorMessages().length).toBe(2)

    for (const resultRow of resultData) {
      expect(resultRow).not.toBeInstanceOf(AjaxResult)
      const result = resultRow
      expect(result).toHaveProperty('items')
      expect(result.items.length).toBeGreaterThan(0)

      expect(resultRow).not.toHaveProperty('time')
    }
  })

  it('as BatchCommandsArrayUniversal @apiV2 !isSuccess isHaltOnError returnAjax', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchCommandsArrayUniversal = [
      ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': getMapId().crmCompanySuccessMin } }],
      ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>ddId': getMapId().crmCompanySuccessMin } }],
      ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': getMapId().crmCompanySuccessMax } }],
      ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>ddId': getMapId().crmCompanySuccessMax } }]
    ]

    const method = 'callBatchAsArray'
    const requestId = `test@apiV2/${method}`
    const options = { isHaltOnError: true, returnAjaxResult: true, requestId }
    const response = await b24.actions.v2.batch.make<{ id: number }[]>({
      calls: batchCalls,
      options
    })

    expect(response.isSuccess).toBe(false)

    const resultData = (response as Result<AjaxResult<{ id: number }>[]>).getData()

    expect(response.getErrorMessages().length).toBe(1)
    expect(resultData).toBeDefined()
    for (const resultRow of resultData) {
      expect(resultRow).toBeInstanceOf(AjaxResult)
      if (resultRow.isSuccess) {
        expect(resultRow.isSuccess).toBe(true)

        const rowData = resultRow.getData()
        const result = rowData.result
        expect(result).toHaveProperty('items')
        expect(result.items.length).toBeGreaterThan(0)

        const time = rowData.time
        expect(time).toHaveProperty('operating')
        expect(time.operating).toBeGreaterThanOrEqual(0)
        expect(time.operating_reset_at).toBeGreaterThan(0)
      } else {
        const errors = Array.from(resultRow.getErrors()) as SdkError[]
        const mainError = errors.find(error => error?.code === 'INVALID_ARG_VALUE')
        expect(mainError).toBeDefined()
      }
    }

    const errors = Array.from(response.getErrors()) as SdkError[]
    const mainError = errors.find(error => error?.code === 'INVALID_ARG_VALUE')
    expect(mainError).toBeDefined()
  })
  it('as BatchCommandsObjectUniversal @apiV2 !isSuccess isHaltOnError returnAjax', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchCommandsObjectUniversal = [
      { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': getMapId().crmCompanySuccessMin } } },
      { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>ddId': getMapId().crmCompanySuccessMin } } },
      { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': getMapId().crmCompanySuccessMax } } },
      { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>ddId': getMapId().crmCompanySuccessMax } } }
    ]

    const method = 'callBatchAsArrayObject'
    const requestId = `test@apiV2/${method}`
    const options = { isHaltOnError: true, returnAjaxResult: true, requestId }
    const response = await b24.actions.v2.batch.make<{ id: number }[]>({
      calls: batchCalls,
      options
    })
    expect(response.isSuccess).toBe(false)

    const resultData = (response as Result<AjaxResult<{ id: number }>[]>).getData()

    expect(response.getErrorMessages().length).toBe(1)
    expect(resultData).toBeDefined()
    for (const resultRow of resultData) {
      expect(resultRow).toBeInstanceOf(AjaxResult)
      if (resultRow.isSuccess) {
        expect(resultRow.isSuccess).toBe(true)

        const rowData = resultRow.getData()
        const result = rowData.result
        expect(result).toHaveProperty('items')
        expect(result.items.length).toBeGreaterThan(0)

        const time = rowData.time
        expect(time).toHaveProperty('operating')
        expect(time.operating).toBeGreaterThanOrEqual(0)
        expect(time.operating_reset_at).toBeGreaterThan(0)
      } else {
        const errors = Array.from(resultRow.getErrors()) as SdkError[]
        const mainError = errors.find(error => error?.code === 'INVALID_ARG_VALUE')
        expect(mainError).toBeDefined()
      }
    }

    const errors = Array.from(response.getErrors()) as SdkError[]
    const mainError = errors.find(error => error?.code === 'INVALID_ARG_VALUE')
    expect(mainError).toBeDefined()
  })
  it('as BatchNamedCommandsUniversal @apiV2 !isSuccess isHaltOnError returnAjax', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchNamedCommandsUniversal = {
      cmd11: {
        method: 'crm.item.list',
        params: {
          entityTypeId: EnumCrmEntityTypeId.company,
          select: ['id'],
          filter: { '>id': getMapId().crmCompanySuccessMin }
        }
      },
      cmd12: {
        method: 'crm.item.list',
        params: {
          entityTypeId: EnumCrmEntityTypeId.company,
          select: ['id'],
          filter: { '>ddId': getMapId().crmCompanySuccessMin }
        }
      },
      cmd21: [
        'crm.item.list',
        {
          entityTypeId: EnumCrmEntityTypeId.company,
          select: ['id'],
          filter: { '>id': getMapId().crmCompanySuccessMax }
        }
      ],
      cmd22: [
        'crm.item.list',
        {
          entityTypeId: EnumCrmEntityTypeId.company,
          select: ['id'],
          filter: { '>ddId': getMapId().crmCompanySuccessMax }
        }
      ]
    }

    const keys = Object.keys(batchCalls)
    const method = 'callBatchAsObject'
    const requestId = `test@apiV2/${method}`
    const options = { isHaltOnError: true, returnAjaxResult: true, requestId }
    const response = await b24.actions.v2.batch.make<{ id: number }[]>({
      calls: batchCalls,
      options
    })
    expect(response.isSuccess).toBe(false)

    const resultData = (response as Result<Record<string | number, AjaxResult<{ id: number }>>>).getData()
    expect(response.getErrorMessages().length).toBe(1)
    expect(resultData).toBeDefined()
    for (const [index, resultRow] of Object.entries(resultData)) {
      expect(resultRow).toBeInstanceOf(AjaxResult)
      if (resultRow.isSuccess) {
        expect(resultRow.isSuccess).toBe(true)
        expect(keys).toContain(index)

        const rowData = resultRow.getData()
        const result = rowData.result
        expect(result).toHaveProperty('items')
        expect(result.items.length).toBeGreaterThan(0)

        const time = rowData.time
        expect(time).toHaveProperty('operating')
        expect(time.operating).toBeGreaterThanOrEqual(0)
        expect(time.operating_reset_at).toBeGreaterThan(0)
      } else {
        expect(keys).toContain(index)
        const errors = Array.from(resultRow.getErrors()) as SdkError[]
        const mainError = errors.find(error => error?.code === 'INVALID_ARG_VALUE')
        expect(mainError).toBeDefined()
      }
    }

    const errors = Array.from(response.getErrors()) as SdkError[]
    const mainError = errors.find(error => error?.code === 'INVALID_ARG_VALUE')
    expect(mainError).toBeDefined()
  })

  it('as BatchCommandsArrayUniversal @apiV2 !isSuccess isHaltOnError', async () => {
    const b24 = getB24Client()

    const batchCalls: BatchCommandsArrayUniversal = [
      ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': getMapId().crmCompanySuccessMin } }],
      ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>ddId': getMapId().crmCompanySuccessMin } }],
      ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': getMapId().crmCompanySuccessMax } }],
      ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>ddId': getMapId().crmCompanySuccessMax } }]
    ]

    const method = 'callBatchAsArray'
    const requestId = `test@apiV2/${method}`
    const options = { isHaltOnError: true, returnAjaxResult: false, requestId }
    const response = await b24.actions.v2.batch.make<{ items: { id: number }[] }[]>({
      calls: batchCalls,
      options
    })

    expect(response.isSuccess).toBe(false)

    const resultData = (response as Result<{ items: { id: number }[] }[]>).getData()

    expect(response.getErrorMessages().length).toBe(1)

    for (const resultRow of resultData) {
      expect(resultRow).not.toBeInstanceOf(AjaxResult)
      const result = resultRow
      expect(result).toHaveProperty('items')
      expect(result.items.length).toBeGreaterThan(0)

      expect(resultRow).not.toHaveProperty('time')
    }

    const errors = Array.from(response.getErrors()) as SdkError[]
    const mainError = errors.find(error => error?.code === 'INVALID_ARG_VALUE')
    expect(mainError).toBeDefined()
  })
})
