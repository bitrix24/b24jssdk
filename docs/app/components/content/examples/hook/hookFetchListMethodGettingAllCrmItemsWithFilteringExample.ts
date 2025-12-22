import { B24Hook, EnumCrmEntityTypeId, LoggerBrowser } from '@bitrix24/b24jssdk'

type Company = {
  id: string
  title: string
}

const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)
const $logger = LoggerBrowser.build('Example:AllCrmItems', devMode)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

try {
  for await (const chunk of $b24.fetchListMethod<Company>(
    'crm.item.list',
    {
      entityTypeId: EnumCrmEntityTypeId.company,
      filter: {
        // use some filter by title
        '=%title': 'Prime%'
      },
      select: ['id', 'title']
    },
    'id',
    'items'
  )) {
    $logger.info(`Items received [${chunk.length}]`, chunk)
  }
} catch (error) {
  $logger.error(error)
}
