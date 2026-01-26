import { ParamsFactory, B24Hook, LoggerFactory, LogLevel } from '../../packages/jssdk/src/index'
// import { ParamsFactory, B24Hook } from '../../packages/jssdk/src/index'

declare global {
  var b24Integration: B24Hook | undefined
}

/**
 * Initializes the B24 client for testing
 * @throws {Error} If the B24_HOOK environment variable is not set
 */
export function setupB24Client(): B24Hook {
  const hookPath = process.env.B24_HOOK

  if (!hookPath) {
    throw new Error('B24_HOOK environment variable is not set! Please configure it in your .env.test file')
  }

  const b24 = B24Hook.fromWebhookUrl(hookPath, { restrictionParams: ParamsFactory.getDefault() })
  b24.setLogger(LoggerFactory.createForBrowserDevelopment('b24', LogLevel.INFO))

  return b24
}

/**
 * Setting up global variables for tests
 * Called once before all tests
 */
export function setupTestGlobals(): void {
  if (
    typeof globalThis.b24Integration === 'undefined'
    || !(globalThis.b24Integration instanceof B24Hook)
  ) {
    globalThis.b24Integration = setupB24Client()
    // console.log(`B24 client initialized [${globalThis.b24Integration.getTargetOrigin()}]`)
  }
}

/**
 * Obtaining the B24 client for use in tests
 * @throws {Error} If the client is not initialized
 */
export function getB24Client(): B24Hook {
  if (!globalThis.b24Integration) {
    throw new Error('B24 client is not initialized. Call setupTestGlobals() first.')
  }
  return globalThis.b24Integration
}

export default {
  setupTestGlobals,
  getB24Client
}
