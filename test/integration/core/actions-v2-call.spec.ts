import { describe, it, expect } from 'vitest'
import { setupB24Tests } from '../../0_setup/hooks-integration-jssdk'
import { SdkError } from '../../../packages/jssdk/src/'

describe('core.actions.call @apiV2', () => {
  const { getB24Client, getMapId } = setupB24Tests()

  it('server.time @apiV2 isSuccess', async () => {
    const b24 = getB24Client()

    const method = 'server.time'
    const params = {}
    const requestId = `test@apiV2/${method}`
    const response = await b24.actions.v2.call.make({ method, params, requestId })

    expect(response.isSuccess).toBe(true)
    expect(response.getData().result).toBeDefined()
    expect(response.getData().time).toHaveProperty('operating')
  })

  it('tasks.task.get @apiV2 isSuccess', async () => {
    const b24 = getB24Client()

    const method = 'tasks.task.get'
    const params = {
      taskId: getMapId().taskSuccess,
      select: ['ID', 'TITLE']
    }
    const requestId = `test@apiV2/${method}`
    const response = await b24.actions.v2.call.make({ method, params, requestId })

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

  it('tasks.task.get @apiV2 !isSuccess fail Id', async () => {
    const b24 = getB24Client()

    const method = 'tasks.task.get'
    const params = {
      taskId: getMapId().taskFail,
      select: ['ID', 'TITLE']
    }
    const requestId = `test@apiV2/${method}`
    try {
      await b24.actions.v2.call.make({ method, params, requestId })
    } catch (error) {
      if (
        error instanceof SdkError
      ) {
        expect(error.code).toBe('ERR_BAD_REQUEST')
      } else {
        throw error
      }
    }
  })

  it('tasks.task.get @apiV2 !isSuccess wrong Id', async () => {
    const b24 = getB24Client()

    const method = 'tasks.task.get'
    const params = {
      taskId: getMapId().taskWrong,
      select: ['ID', 'TITLE']
    }
    const requestId = `test@apiV2/${method}`
    const response = await b24.actions.v2.call.make({ method, params, requestId })

    expect(response.isSuccess).toBe(true)

    const result = response.getData().result

    expect(result).not.toHaveProperty('task')

    const time = response.getData().time
    expect(time).toHaveProperty('operating')
  })
})
