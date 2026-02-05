import { beforeAll, afterAll } from 'vitest'
import { B24Frame } from '../../packages/jssdk/src/index'
import { setupTestGlobals, getB24Client, getB24Frame } from './setup-integration-jssdk'

/**
 * Hooks for integration tests with Bitrix24
 */
export const useB24TestHooks = () => {
  beforeAll(() => {
    // console.log('🚀 Setting up B24 integration tests...')
    setupTestGlobals()
  })

  afterAll(() => {
    const b24 = getB24Client()
    b24.destroy()
  })

  function getMapId(): Record<string, number> {
    return {
      taskSuccess: 1,
      taskFail: -1,
      taskWrong: 2,
      crmDealSuccessMin: 1,
      crmDealSuccessMax: 1,
      crmContactSuccessMin: 1,
      crmContactSuccessMax: 11,
      crmCompanySuccessMin: 1,
      crmCompanySuccessMax: 11,
      crmCompanyFail: -1,
      crmCompanyWrong: 1,
      // @memo get from `main.eventlog.list`
      eventLogMessageSuccessV1: 361,
      eventLogMessageSuccessV2: 359,
      // @memo this wrong value @see test/integration/core/callBatch-v3.spec.ts:483
      messageSuccessV1: 1,
      messageSuccessV2: 2
    }
  }

  return {
    getB24Client,
    getB24Frame,
    getMapId
  }
}

/**
 * Short alias for using hooks
 */
export const setupB24Tests = useB24TestHooks
