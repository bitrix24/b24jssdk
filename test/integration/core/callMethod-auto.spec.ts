import { describe, it, expect } from 'vitest'
import { setupB24Tests } from '../../0_setup/hooks-integration-jssdk'
import { AjaxError } from '../../../packages/jssdk/src/'
import type { SdkError } from '../../../packages/jssdk/src/'

describe('core callMethod @apiAuto isSuccess', () => {
  const { getB24Client, getMapId } = setupB24Tests()

  it('server.time @apiAuto @apiV2', async () => {
    const b24 = getB24Client()

    const method = 'server.time'
    const params = {}
    const requestId = `test@apiAuto/${method}`
    const response = await b24.callMethod(method, params, requestId)

    expect(response.isSuccess).toBe(true)
    const result = response.getData().result
    const time = response.getData().time
    expect(result).toBeDefined()
    expect(time).toHaveProperty('operating')
    expect(time.operating).toBeGreaterThanOrEqual(0)
    expect(time.operating_reset_at).toBeGreaterThanOrEqual(0)
  })

  it('tasks.task.get @apiAuto @apiV3 isSuccess', async () => {
    const b24 = getB24Client()

    const method = 'tasks.task.get'
    const params = {
      id: getMapId().taskSuccess,
      select: ['id', 'title']
    }
    const requestId = `test@apiAuto/${method}`
    const response = await b24.callMethod(method, params, requestId)

    expect(response.isSuccess).toBe(true)

    const result = response.getData().result
    expect(result.item).toBeDefined()
    expect(result.item.id).toBeDefined()

    const time = response.getData().time
    expect(time).toHaveProperty('operating')
    expect(time.operating).toBeGreaterThanOrEqual(0)
    expect(time.operating_reset_at).toBeGreaterThan(0)
  })

  it('tasks.task.get @apiAuto @apiV3 !isSuccess fail Id', async () => {
    const b24 = getB24Client()

    const method = 'tasks.task.get'
    const params = {
      id: getMapId().taskFail,
      select: ['id', 'title']
    }
    const requestId = `test@apiAuto/${method}`
    try {
      await b24.callMethod(method, params, requestId)
    } catch (error) {
      if (
        error instanceof AjaxError
      ) {
        expect(error.code).toBe('BITRIX_REST_V3_EXCEPTION_ENTITYNOTFOUNDEXCEPTION')
      } else {
        throw error
      }
    }
  })

  it('tasks.task.get @apiAuto @apiV3 !isSuccess wrong Id', async () => {
    const b24 = getB24Client()

    const method = 'tasks.task.get'
    const params = {
      id: getMapId().taskWrong,
      select: ['id', 'title']
    }
    const requestId = `test@apiAuto/${method}`

    const response = await b24.callMethod(method, params, requestId)

    expect(response.isSuccess).not.toBe(true)

    const errors = Array.from(response.getErrors()) as SdkError[]
    const mainError = errors.find(error => error?.code === 'BITRIX_REST_V3_EXCEPTION_ENTITYNOTFOUNDEXCEPTION')
    expect(mainError).toBeDefined()

    const result = response.getData()
    expect(result).toBeUndefined()
  })
})
