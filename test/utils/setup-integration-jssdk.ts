import { ParamsFactory, B24Hook, LoggerFactory } from '@bitrix24/b24jssdk'

declare global {
  // eslint-disable-next-line no-var
  var b24: B24Hook | undefined
  // eslint-disable-next-line no-var
  var testSetupComplete: boolean | undefined
}

/**
 * Initializes the B24 client for testing
 * @throws {Error} If the B24_HOOK environment variable is not set
 */
export function setupB24Client(): B24Hook {
  const hookPath = process.env.B24_HOOK

  if (!hookPath) {
    throw new Error(
      'B24_HOOK environment variable is not set! Please configure it in your .env.test file'
    )
  }

  const b24 = B24Hook.fromWebhookUrl(hookPath, {
    restrictionParams: ParamsFactory.getDefault()
    // restrictionParams: ParamsFactory.getBatchProcessing()
  })
  b24.setLogger(LoggerFactory.createForBrowserDevelopment('b24'))

  return b24
}

/**
 * Setting up global variables for tests
 * Called once before all tests
 */
export function setupTestGlobals(): void {
  if (globalThis.testSetupComplete) {
    return // Already configured
  }

  globalThis.b24 = setupB24Client()
  globalThis.testSetupComplete = true

  // console.log('B24 client initialized.')
}

/**
 * Obtaining the B24 client for use in tests
 * @throws {Error} If the client is not initialized
 */
export function getB24Client(): B24Hook {
  if (!globalThis.b24) {
    throw new Error('B24 client is not initialized. Call setupTestGlobals() first.')
  }
  return globalThis.b24
}

export default {
  setupB24Client,
  setupTestGlobals,
  getB24Client
}
