import { describe, it, expect } from 'vitest'
import { setupB24Tests } from '../../0_setup/hooks-integration-jssdk'
import { AjaxError, SdkError, Text } from '../../../packages/jssdk/src/'

/**
 * @todo add test new type functions `Aggregate`, `Tail`
 */
describe('core callMethod @apiV3', () => {
  const { getB24Client, getMapId } = setupB24Tests()

  it('server.time @apiV3 @notSupported', async () => {
    const b24 = getB24Client()

    const method = 'server.time'
    const params = {}
    const requestId = `test@apiV3/${method}`
    try {
      // @todo on this
      const response = await b24.actions.v3.call.make({ method, params, requestId })

      expect(response.isSuccess).toBe(true)
      const result = response.getData().result
      const time = response.getData().time
      expect(result).toBeDefined()
      expect(time).toHaveProperty('operating')
      expect(time.operating).toBeGreaterThanOrEqual(0)
      expect(time.operating_reset_at).toBeGreaterThanOrEqual(0)
    } catch (error) {
      if (!(error instanceof SdkError)) {
        throw error
      }

      expect(error.code).toEqual('JSSDK_CORE_B24_API_V3_NOT_SUPPORT_METHOD')
    }
  })

  it('tasks.task.get @apiV3 isSuccess', async () => {
    const b24 = getB24Client()

    const method = 'tasks.task.get'
    const params = {
      id: getMapId().taskSuccess,
      select: ['id', 'title']
    }
    const requestId = `test@apiV3/${method}`
    const response = await b24.actions.v3.call.make({ method, params, requestId })

    expect(response.isSuccess).toBe(true)

    const result = response.getData().result
    expect(result.item).toBeDefined()
    expect(result.item.id).toBeDefined()

    const time = response.getData().time
    expect(time).toHaveProperty('operating')
    expect(time.operating).toBeGreaterThanOrEqual(0)
    expect(time.operating_reset_at).toBeGreaterThan(0)
  })

  it('tasks.task.get @apiV3 !isSuccess fail Id', async () => {
    const b24 = getB24Client()

    const method = 'tasks.task.get'
    const params = {
      id: getMapId().taskFail,
      select: ['id', 'title']
    }
    const requestId = `test@apiV3/${method}`
    try {
      await b24.actions.v3.call.make({ method, params, requestId })
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

  it('tasks.task.get @apiV3 !isSuccess wrong Id', async () => {
    const b24 = getB24Client()

    const method = 'tasks.task.get'
    const params = {
      id: getMapId().taskWrong,
      select: ['id', 'title']
    }
    const requestId = `test@apiV3/${method}`

    const response = await b24.actions.v3.call.make({ method, params, requestId })

    expect(response.isSuccess).not.toBe(true)

    const errors = Array.from(response.getErrors()) as SdkError[]
    const mainError = errors.find(error => error?.code === 'BITRIX_REST_V3_EXCEPTION_ENTITYNOTFOUNDEXCEPTION')
    expect(mainError).toBeDefined()

    const result = response.getData()
    expect(result).toBeUndefined()
  })

  it('tasks.task.update @apiV3 isSuccess', async () => {
    const b24 = getB24Client()

    const method = 'tasks.task.update'
    const params = {
      id: getMapId().taskSuccess,
      fields: {
        title: `TEST: [${Text.getDateForLog()}]`
      }
    }
    const requestId = `test@apiV3/${method}`

    /**
     * This is the load to see the operating
     */
    // await Promise.all(Array.from({ length: 20 }, () => b24.callV3(method, params, requestId)))

    const response = await b24.actions.v3.call.make({ method, params, requestId })

    expect(response.isSuccess).toBe(true)
    const result = response.getData().result
    const time = response.getData().time
    expect(result).toBeDefined()
    expect(result).toHaveProperty('result')
    expect(result.result).toBeTruthy()
    expect(time).toHaveProperty('operating')
    expect(time.operating).toBeGreaterThanOrEqual(0)
    expect(time.operating_reset_at).toBeGreaterThanOrEqual(0)
  })
})
