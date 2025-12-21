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
  for await (const chunk of $b24.fetchListMethod(
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
  )) {
    console.log('chunk size', chunk.length)
  }
} catch (error) {
  $logger.error(error)
}
