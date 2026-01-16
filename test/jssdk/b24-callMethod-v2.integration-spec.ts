import { describe, it, expect } from 'vitest'
import { setupB24Tests } from '../utils/hooks-integration-jssdk'
import { SdkError } from '@bitrix24/b24jssdk'

describe('@apiV2 B24:callMethod', () => {
  const { getB24Client } = setupB24Tests()
  it('server.time @apiV2', async () => {
    const b24 = getB24Client()

    const method = 'server.time'
    const params = {}
    const requestId = `test@apiV3/${method}`
    const response = await b24.callV2(method, params, requestId)

    expect(response.isSuccess).toBe(true)
    expect(response.getData().result).toBeDefined()
    expect(response.getData().time).toHaveProperty('operating')
  })

  it('tasks.task.get @apiV2', async () => {
    const b24 = getB24Client()

    const method = 'tasks.task.get'
    const params = {
      taskId: 1,
      select: ['ID', 'TITLE']
    }
    const requestId = `test@apiV2/${method}`
    const response = await b24.callV2(method, params, requestId)

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

  it('tasks.task.get @apiV2 fail Id', async () => {
    const b24 = getB24Client()

    const method = 'tasks.task.get'
    const params = {
      taskId: -1,
      select: ['ID', 'TITLE']
    }
    const requestId = `test@apiV2/${method}`
    try {
      await b24.callV2(method, params, requestId)
    } catch (error) {
      if (
        error instanceof SdkError
      ) {
        expect(error.message).toBe('wrong task id')
      } else {
        throw error
      }
    }
  })

  it('tasks.task.get @apiV2 wrong Id', async () => {
    const b24 = getB24Client()

    const method = 'tasks.task.get'
    const params = {
      taskId: 2,
      select: ['ID', 'TITLE']
    }
    const requestId = `test@apiV2/${method}`
    const response = await b24.callV2(method, params, requestId)

    expect(response.isSuccess).toBe(true)

    const result = response.getData().result
    expect(result).not.toHaveProperty('id')

    const time = response.getData().time
    expect(time).toHaveProperty('operating')
  })
})
