import { B24Hook, EnumCrmEntityTypeId, LoggerFactory } from '@bitrix24/b24jssdk'

type Company = {
  id: number
  title: string
}

const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)
const $logger = LoggerFactory.createForBrowser('Example:AllCrmItems', devMode)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

try {
  const response = await $b24.actions.v2.callList.make<Company>({
    method: 'crm.item.list',
    params: {
      entityTypeId: EnumCrmEntityTypeId.company,
      filter: {
        // use some filter by title
        '=%title': 'Prime%'
      },
      select: ['id', 'title']
    },
    idKey: 'id', // ID field in the response
    customKeyForResult: 'items' // The key under which the data is located (for methods like crm.item.list)
  })

  if (!response.isSuccess) {
    throw new Error(`API Error: ${response.getErrorMessages().join('; ')}`)
  }

  const list = response.getData()
  $logger.info(`Companies list (${list?.length})`, { list })
} catch (error) {
  $logger.error('some error', { error })
}
