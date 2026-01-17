import { describe, it, expect } from 'vitest'
import { setupB24Tests } from '../../0_setup/hooks-integration-jssdk'
import { AjaxError, SdkError } from '../../../packages/jssdk/src/'

describe('core callMethod @apiV2', () => {
  const { getB24Client } = setupB24Tests()

  it('server.time @apiV3 @notSupported', async () => {
    const b24 = getB24Client()

    const method = 'server.time'
    const params = {}
    const requestId = `test@apiV3/${method}`
    try {
      // @todo on this
      const response = await b24.callV3(method, params, requestId)

      expect(response.isSuccess).toBe(true)
      const result = response.getData().result
      const time = response.getData().time
      expect(result).toBeDefined()
      expect(time).toHaveProperty('operating')
      expect(time.operating).toBeGreaterThanOrEqual(0)
      expect(time.operating_reset_at).toBeGreaterThanOrEqual(0)
    } catch (error) {
      if (
        error instanceof SdkError
        && error.code === 'JSSDK_CORE_B24_API_V3_NOT_SUPPORT_METHOD'
      ) {
        console.log(`⏳ ${method} not supported yet`)
      } else {
        throw error
      }
    }
  })

  it('tasks.task.get @apiV3', async () => {
    const b24 = getB24Client()

    const method = 'tasks.task.get'
    const params = {
      id: 1,
      select: ['id', 'title']
    }
    const requestId = `test@apiV3/${method}`
    const response = await b24.callV3(method, params, requestId)

    expect(response.isSuccess).toBe(true)

    const result = response.getData().result
    expect(result.item).toBeDefined()
    expect(result.item.id).toBeDefined()

    const time = response.getData().time
    expect(time).toHaveProperty('operating')
    expect(time.operating).toBeGreaterThanOrEqual(0)
    expect(time.operating_reset_at).toBeGreaterThan(0)
  })

  it('tasks.task.get @apiV3 fail Id', async () => {
    const b24 = getB24Client()

    const method = 'tasks.task.get'
    const params = {
      id: -1,
      select: ['id', 'title']
    }
    const requestId = `test@apiV3/${method}`
    try {
      await b24.callV3(method, params, requestId)
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

  it('tasks.task.get @apiV3 wrong Id', async () => {
    const b24 = getB24Client()

    const method = 'tasks.task.get'
    const params = {
      id: 2,
      select: ['id', 'title']
    }
    const requestId = `test@apiV3/${method}`
    /**
     * @todo - this not throw exception
     */
    const response = await b24.callV3(method, params, requestId)

    expect(response.isSuccess).not.toBe(true)

    const result = response.getData().result
    expect(result).not.toHaveProperty('id')

    const time = response.getData().time
    expect(time).not.toHaveProperty('operating')
  })
})
