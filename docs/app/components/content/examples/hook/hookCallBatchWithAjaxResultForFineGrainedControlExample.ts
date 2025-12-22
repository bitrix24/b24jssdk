import type { AjaxResult } from '@bitrix24/b24jssdk'
import { B24Hook, EnumCrmEntityTypeId, LoggerBrowser } from '@bitrix24/b24jssdk'

const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)
const $logger = LoggerBrowser.build('Example:BatchWithAjaxResult', devMode)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

try {
  // `return AjaxResult = true` returns an AjaxResult for each command
  const response = await $b24.callBatch({
    ServerTime: { method: 'server.time' },
    UserProfile: { method: 'user.current' },
    DealCount: { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.deal, select: ['id'] } }
  }, false, true) // isHaltOnError = false, returnAjaxResult = true

  if (!response.isSuccess) {
    throw new Error(`API Error: ${response.getErrorMessages().join('; ')}`)
  }

  const data: Record<string, AjaxResult> = response.getData()

  // We check each command separately
  if (data.ServerTime?.isSuccess) {
    $logger.info('Server time:', data.ServerTime.getData().result)
  }

  if (data.UserProfile?.isSuccess) {
    $logger.info('Current user:', (data.UserProfile.getData().result as unknown as { NAME: string }).NAME)
  }

  if (data.DealCount?.isSuccess) {
    $logger.info(`Total deals: ${data.DealCount?.getTotal()}`)
  }
} catch (error) {
  $logger.error(error)
}
