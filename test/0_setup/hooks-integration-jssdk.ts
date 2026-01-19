import { beforeAll, afterAll } from 'vitest'
import { setupTestGlobals, getB24Client } from './setup-integration-jssdk'

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
    // destroy b24 - this stop AuthRefresh
    b24.destroy()
  })

  function getMapId(): Record<string, number> {
    return {
      taskSuccess: 1,
      taskFail: -1,
      taskWrong: 2,
      crmCompanySuccessMin: 2,
      crmCompanySuccessMax: 11,
      crmCompanyFail: -1,
      crmCompanyWrong: 1
    }
  }

  return {
    getB24Client,
    getMapId
  }
}

/**
 * Short alias for using hooks
 */
export const setupB24Tests = useB24TestHooks
