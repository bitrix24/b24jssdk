import type { AjaxResult, ListPayload } from '@bitrix24/b24jssdk'
import { B24Hook, EnumCrmEntityTypeId, LoggerBrowser } from '@bitrix24/b24jssdk'

type Deal = {
  id: string
  title: string
}

const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)
const $logger = LoggerBrowser.build('Example:getAllDeals', devMode)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

async function getAllDeals(): Promise<Deal[]> {
  let allDeals: Deal[] = []
  let start = 0
  let hasMore = true

  while (hasMore) {
    const response: AjaxResult<{ items: Deal[] }> = await $b24.callMethod(
      'crm.item.list',
      {
        entityTypeId: EnumCrmEntityTypeId.deal,
        filter: {
          // use some filter by title
          '=%title': 'Prime%'
        },
        order: { id: 'asc' },
        select: ['id', 'title']
      },
      start
    )

    if (!response.isSuccess) {
      throw new Error(`Failed to fetch deals: ${response.getErrorMessages().join('; ')}`)
    }

    const pageDeals = response.getData().result.items
    allDeals = allDeals.concat(pageDeals)

    // Check if there is more data
    hasMore = response.isMore()
    start += Number((response.getData() as ListPayload<Deal[]>).next) // Increase the offset for the next page
  }

  return allDeals
}

// Usage
try {
  const list = await getAllDeals()
  $logger.info(`Deals list (${list.length}):`, list)
} catch (error) {
  $logger.error(error)
}
