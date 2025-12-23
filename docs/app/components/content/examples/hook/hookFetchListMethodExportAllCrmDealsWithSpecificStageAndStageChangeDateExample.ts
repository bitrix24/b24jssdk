import type { ISODate } from '@bitrix24/b24jssdk'
import { B24Hook, EnumCrmEntityTypeId, LoggerBrowser } from '@bitrix24/b24jssdk'
import { createWriteStream } from 'node:fs'

type Deal = {
  id: number
  title: string
  opportunity: number
  stageId: string
  createdTime: ISODate
}

const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)
const $logger = LoggerBrowser.build('Example:ExportAllDealsByStage', devMode)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

const outputFile = createWriteStream('deals_export.jsonl', { flags: 'a' })

let totalExported = 0

try {
  const sixMonthAgo = new Date()
  sixMonthAgo.setMonth((new Date()).getMonth() - 6)
  sixMonthAgo.setHours(0, 0, 0)

  for await (const chunk of $b24.fetchListMethod<Deal>(
    'crm.item.list',
    {
      entityTypeId: EnumCrmEntityTypeId.company,
      filter: {
        '>createdTime': sixMonthAgo.toISOString(), // Created at least 6 months ago
        '=stageId': 'WON' // Only winning deals
      },
      select: ['id', 'title', 'stageId', 'opportunity', 'createdTime']
    },
    'id',
    'items'
  )) {
    // Write each transaction to the file line by line
    for (const deal of chunk) {
      outputFile.write(JSON.stringify(deal) + '\n')
    }

    totalExported += chunk.length
    $logger.log(`Exported deals: ${totalExported}`)
  }

  $logger.info(`Export complete. Total exported: ${totalExported}.`)
} catch (error) {
  $logger.error(error)
} finally {
  outputFile.end()
}
