import type { AjaxResult } from '@bitrix24/b24jssdk'
import { B24Hook, EnumCrmEntityTypeId, LoggerBrowser } from '@bitrix24/b24jssdk'

type CrmItem = {
  id: number
  title: string
  [key: string]: any
}

const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)
const $logger = LoggerBrowser.build('Example:getCrmItem', devMode)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

async function getCrmItem(entityTypeId: number, itemId: number): Promise<CrmItem> {
  const response: AjaxResult<{ item: CrmItem }> = await $b24.callMethod('crm.item.get', {
    entityTypeId: entityTypeId,
    id: itemId
  })

  if (!response.isSuccess) {
    throw new Error(`Failed to fetch item: ${response.getErrorMessages().join('; ')}`)
  }

  return response.getData().result.item
}

// Use for the company
try {
  const company = await getCrmItem(EnumCrmEntityTypeId.company, 5284)
  $logger.info(`Company: ${company?.title}`)
} catch (error) {
  $logger.error(error)
}
