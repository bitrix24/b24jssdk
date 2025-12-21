import { B24Hook, EnumCrmEntityTypeId, LoggerBrowser } from '@bitrix24/b24jssdk'

type Company = {
  id: string
  title: string
}

const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)
const $logger = LoggerBrowser.build('Example:getAllDeals', devMode)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

// Usage
try {
  const response = await $b24.callFastListMethod<Company>(
    'crm.item.list',
    {
      entityTypeId: EnumCrmEntityTypeId.company,
      filter: {
        // use some filter by title
        '=%title': 'Prime%'
      },
      order: { id: 'asc' },
      select: ['id', 'title']
    },
    'id',
    'items'
  )

  if (!response.isSuccess) {
    throw new Error(`API Error: ${response.getErrorMessages().join('; ')}`)
  }

  const list = response.getData()
  $logger.info(`Companies list (${list?.length}):`, list)
} catch (error) {
  $logger.error(error)
}
