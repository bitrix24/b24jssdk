import { B24Hook, LoggerFactory } from '@bitrix24/b24jssdk'

export async function Action_toolsPing() {
  // region: start ////
  const _devMode = typeof import.meta !== 'undefined' && (import.meta.dev || import.meta.env?.DEV)
  const $logger = LoggerFactory.createForBrowser('Example:ping', true)
  const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

  async function measureApiResponseTime(): Promise<number> {
    try {
      return await $b24.tools.ping.make({
        requestId: `unique-request-id`
      })
    } catch (error) {
      $logger.error('Ping failed unexpectedly', { error })
      return -1
    }
  }

  // Usage
  try {
    const responseTime = await measureApiResponseTime()

    if (responseTime >= 0) {
      // Response time classification
      let status = 'optimal'
      if (responseTime > 1000) status = 'slow'
      if (responseTime > 3000) status = 'very_slow'
      if (responseTime > 10000) status = 'critical'

      $logger.info(`API response time: ${responseTime}ms (${status})`, {
        responseTime,
        status,
        threshold: 'Optimal < 1000ms'
      })
    } else {
      $logger.error('Failed to measure API response time')
    }
  } catch (error) {
    $logger.error('Error measuring response time', { error })
  }
  // endregion: start ////
}
