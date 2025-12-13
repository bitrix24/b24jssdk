import type { AjaxResult } from '@bitrix24/b24jssdk'
import { B24Hook, LoggerBrowser, EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'

type CrmEntityCompany = {
  id: number
  title: string
  [key: string]: any
}

const $logger = LoggerBrowser.build('MyApp:crm.item.get', true)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/xxxx/')

try {
  const response: AjaxResult<CrmEntityCompany[]> = await $b24.callMethod(
    'crm.item.get',
    {
      entityTypeId: EnumCrmEntityTypeId.company,
      id: 1
    }
  )

  if (!response.isSuccess) {
    throw new Error(response.getErrorMessages().join(';\n'))
  }

  const item = response.getData().result.item

  $logger.info(`Company id: ${item.id}, title: ${item.title}`, item)
} catch (error) {
  $logger.error(error)
}
