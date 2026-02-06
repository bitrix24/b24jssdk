import { B24Hook, LoggerFactory } from '@bitrix24/b24jssdk'

export async function Action_toolsHealthCheck() {
  // region: start ////
  const _devMode = typeof import.meta !== 'undefined' && (import.meta.dev || import.meta.env?.DEV)
  const $logger = LoggerFactory.createForBrowser('Example:healthCheck', true)
  const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

  async function checkRestApiHealth(): Promise<boolean> {
    try {
      return await $b24.tools.healthCheck.make({
        requestId: `unique-request-id`
      })
    } catch (error) {
      $logger.error('Health check failed unexpectedly', { error })
      return false
    }
  }

  // Usage
  try {
    const apiAvailable = await checkRestApiHealth()

    if (apiAvailable) {
      $logger.info('Bitrix24 API is available and responding')
    } else {
      $logger.error('Bitrix24 API is unavailable. Check:\n1. Correctness of webhook URL\n2. Bitrix24 availability from your network')
    }
  } catch (error) {
    $logger.error('Failed to perform health check', { error })
  }
  // endregion: start ////
}
