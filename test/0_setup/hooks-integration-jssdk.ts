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

  return {
    getB24Client
  }
}

/**
 * Short alias for using hooks
 */
export const setupB24Tests = useB24TestHooks
