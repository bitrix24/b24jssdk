import type { B24Hook, TypeCallParams, AjaxResult, BatchCommandsArrayUniversal, BatchCommandsObjectUniversal } from '../../packages/jssdk/src/index'
// beforeAll, afterAll
import { expect, test } from 'vitest'
import { setupTestGlobals, getB24Client } from './setup-under-load-jssdk'
import { Result, SdkError, ApiVersion, EnumCrmEntityTypeId } from '../../packages/jssdk/src/index'

/**
 * Hooks for under load tests with Bitrix24
 */
export const useB24TestHooks = () => {
  console.log('🚀 Setting up B24 for operation under load ...')
  setupTestGlobals()

  // beforeAll(() => {
  //   // console.log('🚀 Setting up B24 for operation under load ...')
  //   setupTestGlobals()
  // })

  // afterAll(() => {
  //   const b24 = getB24Client()
  //   b24.destroy()
  // })

  return {
    getB24Client
  }
}

/**
 * Short alias for using hooks
 */
export const setupB24Tests = useB24TestHooks

export type TestResult = {
  requestId: string
  duration: number
  operating: number
}

export enum CustomMethod {
  callBatch = 'callBatch',
  callBatchByChunk = 'callBatchByChunk'
}

export const testConfig = {
  parallel: 1,
  ttlCall: 200,
  calls: {
    crmDealListV2: {
      apiVersion: ApiVersion.v2,
      method: 'crm.deal.list',
      params: { start: 1, select: ['ID'], filter: { '>ID': 100 } }
    },
    crmItemListAsCompanyV2: {
      apiVersion: ApiVersion.v2,
      method: 'crm.item.list',
      params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': 2 } }
    },
    batchCrmItemListAsCompanyV2: {
      apiVersion: ApiVersion.v2,
      method: CustomMethod.callBatch,
      params: [
        {
          method: 'crm.item.list',
          params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': 2 } }
        },
        {
          method: 'crm.item.list',
          params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': 200 } }
        },
        {
          method: 'crm.item.list',
          params: { entityTypeId: EnumCrmEntityTypeId.contact, select: ['id'], filter: { '>id': 2 } }
        },
        {
          method: 'crm.item.list',
          params: { entityTypeId: EnumCrmEntityTypeId.contact, select: ['id'], filter: { '>id': 200 } }
        }
      ]
    },
    batchByChunkCrmItemListAsCompanyV2: {
      apiVersion: ApiVersion.v2,
      method: CustomMethod.callBatchByChunk,
      params: {
        method: 'crm.item.list',
        params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': 2 } }
      }
    },
    tasksTaskGerV3: {
      apiVersion: ApiVersion.v3,
      method: 'tasks.task.get',
      params: { id: 1, select: ['id', 'title', 'siteId'] }
    },
    batchTasksTaskGerV3: {
      apiVersion: ApiVersion.v3,
      method: CustomMethod.callBatch,
      params: [
        {
          method: 'tasks.task.get',
          params: { id: 1, select: ['id', 'title', 'siteId'] }
        },
        {
          method: 'tasks.task.get',
          params: { id: 3, select: ['id', 'title', 'siteId'] }
        }
      ]
    },
    batchByChunkTasksTaskGerV3: {
      apiVersion: ApiVersion.v3,
      method: CustomMethod.callBatchByChunk,
      params: {
        method: 'tasks.task.get',
        params: { id: 1, select: ['id', 'title'] }
      }
    }
  }
}

export abstract class AbstractLoadTester {
  protected _b24: B24Hook
  protected _apiVersion: ApiVersion
  protected _stats: {
    total: number
    success: number
    errors: number
  }

  protected _method: string
  protected _params: TypeCallParams

  constructor(b24: B24Hook, method: string, params: TypeCallParams) {
    this._b24 = b24
    this._method = method
    this._params = params
    this._stats = {
      total: 0,
      success: 0,
      errors: 0
    }
  }

  get stats() {
    return this._stats
  }

  protected _prepareResponse(data: any): any {
    return Array.isArray(data.result)
      ? data.result.slice(0, 2)
      : 'items' in data.result
        ? data.result.items.slice(0, 2)
        : data.result
  }

  protected async _makeRequest(requestId: string, iterator: number): Promise<Result<TestResult>> {
    if (this._method === CustomMethod.callBatchByChunk) {
      return this._makeRequestBatchByChunk(requestId, iterator)
    } else if (this._method === CustomMethod.callBatch) {
      return this._makeRequestBatch(requestId, iterator)
    } else {
      return this._makeRequestBase(requestId, iterator)
    }
  }

  protected abstract _makeRequestBatchByChunk(requestId: string, iterator: number): Promise<Result<TestResult>>
  protected abstract _makeRequestBatch(requestId: string, iterator: number): Promise<Result<TestResult>>
  protected abstract _makeRequestBase(requestId: string, iterator: number): Promise<Result<TestResult>>

  public async runLotOfTests(
    testId: string,
    requestCount: number
  ): Promise<Result<TestResult>[]> {
    const results: Result<TestResult>[] = []

    for (let i = 0; i < requestCount; i++) {
      const result = await this._makeRequest(`${testId}-${i + 1}/${requestCount}`, i)

      results.push(result)

      // Updating statistics
      this._stats.total++
      if (result.isSuccess) {
        this._stats.success++
      } else {
        this._stats.errors++
      }
    }

    return results
  }
}

export class LoadTesterV2 extends AbstractLoadTester {
  constructor(b24: B24Hook, method: string, params: TypeCallParams) {
    super(b24, method, params)

    this._apiVersion = ApiVersion.v2
  }

  protected override async _makeRequestBase(requestId: string, iterator: number): Promise<Result<TestResult>> {
    const start = Date.now()
    try {
      const response = await this._b24.actions.v2.call.make({
        method: this._method,
        params: this._params,
        requestId
      })

      if (!response.isSuccess) {
        throw new SdkError({
          code: `JSSDK_TEST_UNDER_LOAD_API_${this._apiVersion}_SOME_ERROR`,
          description: response.getErrorMessages().join('; '),
          status: 500
        })
      }

      const duration = Date.now() - start

      if (iterator % 1 === 0) {
        this._b24.getLogger().warning('response', {
          requestId,
          apiVersion: this._apiVersion,
          method: this._method,
          result: this._prepareResponse(response.getData()),
          operating: this._b24.getHttpClient(this._apiVersion).getStats().operatingStats,
          duration: `${(duration / 1000).toFixed(2)} sec`
        })
      }

      return (new Result<TestResult>()).setData({
        requestId,
        duration,
        operating: response.getData().time.operating
      })
    } catch (error) {
      return (new Result<TestResult>())
        .setData({
          requestId,
          duration: Date.now() - start,
          operating: 0
        })
        .addError(error)
    }
  }

  protected override async _makeRequestBatch(requestId: string, iterator: number): Promise<Result<TestResult>> {
    const start = Date.now()
    try {
      const response = await this._b24.actions.v2.batch.make({
        calls: this._params,
        options: { isHaltOnError: true, returnAjaxResult: true, requestId }
      })

      if (!response.isSuccess) {
        throw new SdkError({
          code: `JSSDK_TEST_UNDER_LOAD_API_${this._apiVersion}_SOME_ERROR`,
          description: response.getErrorMessages().join('; '),
          status: 500
        })
      }

      const duration = Date.now() - start
      const resultData = (response as Result<AjaxResult<{ id: number }>[]>).getData()
      if (iterator % 1 === 0) {
        this._b24.getLogger().warning('response', {
          requestId,
          apiVersion: this._apiVersion,
          method: this._method,
          result: resultData.slice(0, 2).map(responseAjax => typeof responseAjax.getData().result?.items === 'undefined' ? JSON.stringify(responseAjax.getData().result) : responseAjax.getData().result.items.map(item => item.id).slice(0, 5).join(', ')),
          operating: this._b24.getHttpClient(this._apiVersion).getStats().operatingStats,
          duration: `${(duration / 1000).toFixed(2)} sec`
        })
      }

      return (new Result<TestResult>()).setData({
        requestId,
        duration,
        operating: 0
      })
    } catch (error) {
      return (new Result<TestResult>())
        .setData({
          requestId,
          duration: Date.now() - start,
          operating: 0
        })
        .addError(error)
    }
  }

  protected override async _makeRequestBatchByChunk(requestId: string, iterator: number): Promise<Result<TestResult>> {
    const start = Date.now()
    try {
      const batchCalls = Array.from({ length: 60 }, () => [
        this._params.method,
        this._params.params
      ])
      const response = await this._b24.actions.v2.batchByChunk.make({
        calls: batchCalls as BatchCommandsArrayUniversal | BatchCommandsObjectUniversal,
        options: { isHaltOnError: true, requestId }
      })

      if (!response.isSuccess) {
        throw new SdkError({
          code: `JSSDK_TEST_UNDER_LOAD_API_${this._apiVersion}_SOME_ERROR`,
          description: response.getErrorMessages().join('; '),
          status: 500
        })
      }

      const duration = Date.now() - start
      const resultData = (response as Result<{ items: { id: number }[] }[]>).getData()
      if (iterator % 1 === 0) {
        this._b24.getLogger().warning('response', {
          requestId,
          apiVersion: this._apiVersion,
          method: this._method,
          result: resultData.slice(0, 2).map(row => typeof row.items === 'undefined' ? row : row.items.map(item => item.id).slice(0, 5).join(', ')),
          operating: this._b24.getHttpClient(this._apiVersion).getStats().operatingStats,
          duration: `${(duration / 1000).toFixed(2)} sec`
        })
      }

      return (new Result<TestResult>()).setData({
        requestId,
        duration,
        operating: 0
      })
    } catch (error) {
      console.error(error)
      return (new Result<TestResult>())
        .setData({
          requestId,
          duration: Date.now() - start,
          operating: 0
        })
        .addError(error)
    }
  }
}

export class LoadTesterV3 extends AbstractLoadTester {
  constructor(b24: B24Hook, method: string, params: TypeCallParams) {
    super(b24, method, params)

    this._apiVersion = ApiVersion.v3
  }

  protected override async _makeRequestBase(requestId: string, iterator: number): Promise<Result<TestResult>> {
    const start = Date.now()
    try {
      const response = await this._b24.actions.v3.call.make({
        method: this._method,
        params: this._params,
        requestId
      })

      if (!response.isSuccess) {
        throw new SdkError({
          code: `JSSDK_TEST_UNDER_LOAD_API_${this._apiVersion}_SOME_ERROR`,
          description: response.getErrorMessages().join('; '),
          status: 500
        })
      }

      const duration = Date.now() - start

      if (iterator % 1 === 0) {
        this._b24.getLogger().warning('response', {
          requestId,
          apiVersion: this._apiVersion,
          method: this._method,
          result: this._prepareResponse(response.getData()),
          operating: this._b24.getHttpClient(this._apiVersion).getStats().operatingStats,
          duration: `${(duration / 1000).toFixed(2)} sec`
        })
      }

      return (new Result<TestResult>()).setData({
        requestId,
        duration,
        operating: response.getData().time.operating
      })
    } catch (error) {
      return (new Result<TestResult>())
        .setData({
          requestId,
          duration: Date.now() - start,
          operating: 0
        })
        .addError(error)
    }
  }

  protected override async _makeRequestBatch(requestId: string, iterator: number): Promise<Result<TestResult>> {
    const start = Date.now()
    try {
      const response = await this._b24.actions.v3.batch.make({
        calls: this._params,
        options: { isHaltOnError: true, returnAjaxResult: true, requestId }
      })

      if (!response.isSuccess) {
        throw new SdkError({
          code: `JSSDK_TEST_UNDER_LOAD_API_${this._apiVersion}_SOME_ERROR`,
          description: response.getErrorMessages().join('; '),
          status: 500
        })
      }

      const duration = Date.now() - start
      const resultData = (response as Result<AjaxResult<any>[]>).getData()
      if (iterator % 1 === 0) {
        this._b24.getLogger().warning('response', {
          requestId,
          apiVersion: this._apiVersion,
          method: this._method,
          result: resultData.slice(0, 2).map(responseAjax => typeof responseAjax.getData().result?.items === 'undefined' ? JSON.stringify(responseAjax.getData().result) : responseAjax.getData().result.items.map(item => item.id).slice(0, 5).join(', ')),
          operating: this._b24.getHttpClient(this._apiVersion).getStats().operatingStats,
          duration: `${(duration / 1000).toFixed(2)} sec`
        })
      }

      return (new Result<TestResult>()).setData({
        requestId,
        duration,
        operating: 0
      })
    } catch (error) {
      console.error(error)
      return (new Result<TestResult>())
        .setData({
          requestId,
          duration: Date.now() - start,
          operating: 0
        })
        .addError(error)
    }
  }

  protected override async _makeRequestBatchByChunk(requestId: string, iterator: number): Promise<Result<TestResult>> {
    const start = Date.now()
    try {
      const batchCalls = Array.from({ length: 60 }, () => [
        this._params.method,
        this._params.params
      ])

      const response = await this._b24.actions.v3.batchByChunk.make({
        calls: batchCalls as BatchCommandsArrayUniversal | BatchCommandsObjectUniversal,
        options: { isHaltOnError: true, requestId }
      })

      if (!response.isSuccess) {
        throw new SdkError({
          code: `JSSDK_TEST_UNDER_LOAD_API_${this._apiVersion}_SOME_ERROR`,
          description: response.getErrorMessages().join('; '),
          status: 500
        })
      }

      const duration = Date.now() - start
      const resultData = (response as Result<{ item: { id: number, title: string } }[]>).getData()
      if (iterator % 1 === 0) {
        this._b24.getLogger().warning('response', {
          requestId,
          apiVersion: this._apiVersion,
          method: this._method,
          result: resultData.slice(0, 2).map(row => typeof row.item === 'undefined' ? row : row.item.title).slice(0, 5).join(', '),
          operating: this._b24.getHttpClient(this._apiVersion).getStats().operatingStats,
          duration: `${(duration / 1000).toFixed(2)} sec`
        })
      }

      return (new Result<TestResult>()).setData({
        requestId,
        duration,
        operating: 0
      })
    } catch (error) {
      return (new Result<TestResult>())
        .setData({
          requestId,
          duration: Date.now() - start,
          operating: 0
        })
        .addError(error)
    }
  }
}

export const processTests = (
  tester: AbstractLoadTester,
  config: {
    parallel: number
    ttlCall: number
  }
) => {
  Array.from({ length: config.parallel }, (_, i) =>
    test.concurrent(`Load test ${i + 1}`, async () => {
      const results = await tester.runLotOfTests(
        `${i + 1}`,
        config.ttlCall
      )

      const successResults = results.filter(result => result.isSuccess)
      // We check that the successful requests are > 90%
      const successRate = successResults.length / results.length
      expect(successRate).toBeGreaterThan(0.9)

      // Check the average response time
      const avgDuration = results.reduce(
        (sum, result) => sum + result.getData().duration, 0
      ) / results.length

      expect(avgDuration).toBeLessThan(5_000) // Must be less than 5 seconds

      const avgOperating = successResults.reduce(
        (sum, result) => sum + result.getData().operating, 0
      ) / successResults.length

      console.info({
        successRate: `${successRate * 100}%`,
        avgDuration: `${(avgDuration / 1000).toFixed(2)} sec`,
        avgOperating: `${(avgOperating / 1000).toFixed(2)} sec`,
        stats: tester.stats
      })
    }, 2400_000) // 40 min
  )
}
