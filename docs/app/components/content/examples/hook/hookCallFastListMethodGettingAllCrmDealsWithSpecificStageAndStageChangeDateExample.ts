import type { ISODate } from '@bitrix24/b24jssdk'
import { B24Hook, EnumCrmEntityTypeId, LoggerBrowser } from '@bitrix24/b24jssdk'

type Deal = {
  id: number
  title: string
  opportunity: number
  stageId: string
  movedTime: ISODate
}

const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)
const $logger = LoggerBrowser.build('Example:AllDealsByStage', devMode)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

try {
  const sixMonthAgo = new Date()
  sixMonthAgo.setMonth((new Date()).getMonth() - 6)
  sixMonthAgo.setHours(0, 0, 0)
  const response = await $b24.callFastListMethod<Deal>(
    'crm.item.list',
    {
      entityTypeId: EnumCrmEntityTypeId.deal,
      filter: {
        '>=movedTime': sixMonthAgo, // Stage changed at least 6 months ago
        '=stageId': 'WON' // Only winning deals
      },
      select: ['id', 'title', 'opportunity', 'stageId', 'movedTime']
    },
    'id',
    'items'
  )

  if (!response.isSuccess) {
    throw new Error(`API Error: ${response.getErrorMessages().join('; ')}`)
  }

  const wonDeals = response.getData()
  const totalRevenue = (wonDeals || []).reduce((sum, deal) => sum + (deal.opportunity || 0), 0)

  $logger.info(`Won deals: ${wonDeals?.length}`)
  $logger.info(`Total amount: ${totalRevenue}`)
} catch (error) {
  $logger.error(error)
}
