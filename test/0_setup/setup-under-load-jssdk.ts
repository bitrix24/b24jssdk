// LogLevel
import { ParamsFactory, B24Hook, LoggerFactory, LogLevel } from '../../packages/jssdk/src/index'

declare global {
  var b24UnderLoad: B24Hook | undefined
}

/**
 * Initializes the B24 client for under load testing
 * @throws {Error} If the B24_HOOK environment variable is not set
 */
export function setupUnderLoadB24Client(): B24Hook {
  const hookPath = process.env.B24_HOOK

  if (!hookPath) {
    throw new Error('B24_HOOK environment variable is not set! Please configure it in your .env.test file')
  }

  const b24 = B24Hook.fromWebhookUrl(hookPath, {
    // restrictionParams: ParamsFactory.getDefault()
    restrictionParams: ParamsFactory.getBatchProcessing()
  })
  b24.setLogger(LoggerFactory.createForBrowserDevelopment('b24', LogLevel.NOTICE))

  return b24
}

/**
 * Setting up global variables for tests
 * Called once before all tests
 */
export function setupTestGlobals(): void {
  if (
    typeof globalThis.b24UnderLoad === 'undefined'
    || !(globalThis.b24UnderLoad instanceof B24Hook)
  ) {
    globalThis.b24UnderLoad = setupUnderLoadB24Client()
    console.log(`The B24 client has been initialized for operation under load conditions. [${globalThis.b24UnderLoad.getTargetOrigin()}]`)
  }
}

/**
 * Obtaining the B24 client for use in tests
 * @throws {Error} If the client is not initialized
 */
export function getB24Client(): B24Hook {
  if (!globalThis.b24UnderLoad) {
    throw new Error('B24 client for under load is not initialized. Call setupTestGlobals() first.')
  }
  return globalThis.b24UnderLoad
}

export default {
  setupTestGlobals,
  getB24Client
}
