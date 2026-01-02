import type { AjaxResult } from '@bitrix24/b24jssdk'
import { B24Hook, EnumCrmEntityTypeId, LoggerBrowser } from '@bitrix24/b24jssdk'

type Company = {
  id: number
  title: string
}

const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)
const $logger = LoggerBrowser.build('Example:getAllCompaniesFast', devMode)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

async function getAllCompaniesFast(): Promise<Company[]> {
  let allCompanies: Company[] = []
  let lastId = 0
  let batch: Company[]

  do {
    const response: AjaxResult<{ items: Company[] }> = await $b24.callMethod(
      'crm.item.list',
      {
        entityTypeId: EnumCrmEntityTypeId.company,
        filter: {
          '>id': lastId, // Important filter: select data by ID
          // use some filter by title
          '=%title': 'Prime%'
        },
        order: { id: 'asc' },
        select: ['id', 'title'],
        start: -1 // Important parameter: disable pagination and counting
      }
    )

    if (!response.isSuccess) {
      throw new Error(`Failed to fetch Companies: ${response.getErrorMessages().join('; ')}`)
    }

    batch = response.getData().result.items
    if (batch.length > 0) {
      allCompanies = allCompanies.concat(batch)
      lastId = Number(batch[batch.length - 1]!.id) // Update the last ID for the filter
    }
  } while (batch.length > 0) // We query until we get an empty batch

  return allCompanies
}

// Usage
try {
  const list = await getAllCompaniesFast()
  $logger.info(`Companies list (${list.length}):`, list)
} catch (error) {
  $logger.error(error)
}
