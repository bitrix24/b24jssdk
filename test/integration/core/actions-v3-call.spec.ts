import { describe, it, expect } from 'vitest'
import { setupB24Tests } from '../../0_setup/hooks-integration-jssdk'
import { AjaxError, type SdkError } from '../../../packages/jssdk/src/'

/**
 * `Tail` (fetchTail/callTail) and `Aggregate` ship with unit coverage
 * (test/integration/core/list-tail-v3.unit.spec.ts, aggregate-v3.unit.spec.ts).
 * Live-portal coverage here is still a gap: tail needs a `*.tail` method with the
 * right scope, and no module on the reference portal exposes `*.aggregate`.
 */
describe('core.actions.call @apiV3', () => {
  const { getB24Client, getMapId } = setupB24Tests()

  it('server.time @apiV3 @notSupported', async () => {
    const b24 = getB24Client()

    // The SDK no longer gates v3 by a client-side allowlist: a non-v3 method is
    // sent to the v3 endpoint and the server rejects it (no SDK throw). For
    // `server.time` the v3 server replies "method not found" as a soft error.
    const method = 'server.time'
    const params = {}
    const requestId = `test@apiV3/${method}`
    const response = await b24.actions.v3.call.make({ method, params, requestId })

    expect(response.isSuccess).toBe(false)
    expect(response.getErrorMessages().join(' ')).toMatch(/not found|не найден|METHODNOTFOUND/i)
  })

  it('tasks.task.get @apiV3 isSuccess', async () => {
    const b24 = getB24Client()

    const method = 'tasks.task.get'
    const params = {
      id: getMapId().taskSuccess,
      select: ['id', 'title']
    }
    const requestId = `test@apiV3/${method}`
    const response = await b24.actions.v3.call.make<{ item: { id: number, title: string } }>({ method, params, requestId })

    expect(response.isSuccess).toBe(true)

    const result = response.getData()!.result
    expect(result.item).toBeDefined()
    expect(result.item.id).toBeDefined()
    expect(result.item.title).toBeDefined()

    const time = response.getData()!.time
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

    const result = response.getData()!
    expect(result).toBeUndefined()
  })

  // @todo fix this 2026-05-15 INTERNAL_SERVER_ERROR
  // it('tasks.task.update @apiV3 isSuccess', async () => {
  //   const b24 = getB24Client()
  //
  //   const method = 'tasks.task.update'
  //   const params = {
  //     id: getMapId().taskSuccess,
  //     fields: {
  //       title: `TEST: [${Text.getDateForLog()}]`
  //     }
  //   }
  //   const requestId = `test@apiV3/${method}`
  //
  //   const response = await b24.actions.v3.call.make<{ result: boolean }>({ method, params, requestId })
  //
  //   expect(response.isSuccess).toBe(true)
  //
  //   const result = response.getData()!.result
  //   const time = response.getData()!.time
  //
  //   expect(result).toBeDefined()
  //   expect(result).toHaveProperty('result')
  //   expect(result.result).toBeTruthy()
  //
  //   expect(time).toHaveProperty('operating')
  //   expect(time.operating).toBeGreaterThanOrEqual(0)
  //   expect(time.operating_reset_at).toBeGreaterThanOrEqual(0)
  // })
})
