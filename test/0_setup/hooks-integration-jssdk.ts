import { beforeAll, afterAll } from 'vitest'
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
      taskSuccess: 2,
      taskFail: -1,
      taskWrong: 3,
      crmDealSuccessMin: 1,
      crmDealSuccessMax: 1,
      crmContactSuccessMin: 2,
      crmContactSuccessMax: 12,
      crmCompanySuccessMin: 2,
      crmCompanySuccessMax: 12,
      crmCompanyFail: -1,
      crmCompanyWrong: 3,
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
