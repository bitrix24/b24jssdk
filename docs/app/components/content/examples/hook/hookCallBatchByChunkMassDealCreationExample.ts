import type { BatchCommandsArrayUniversal } from '@bitrix24/b24jssdk'
import { B24Hook, EnumCrmEntityTypeId, LoggerFactory } from '@bitrix24/b24jssdk'

type Deal = {
  id: number
  title: string
  stageId: string
  opportunity: number
  assignedById: number
}

const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)
const $logger = LoggerFactory.createForBrowser('Example:MassDealCreation', devMode)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

try {
  // We create an array of commands to create 120 trades.
  const dealCreationCalls: BatchCommandsArrayUniversal<string, Record<string, any>> = Array.from({ length: 120 }, (_, i) => [
    'crm.item.add',
    {
      entityTypeId: EnumCrmEntityTypeId.deal,
      fields: {
        title: `Automatic deal #${i + 1}`,
        stageId: 'NEW',
        opportunity: Math.floor(Math.random() * 10000) + 1000,
        assignedById: 1 // ID of the responsible person
      }
    }
  ])

  $logger.info(`Creating ${dealCreationCalls.length} deals...`)

  const response = await $b24.callBatchByChunk<{ item: Deal }>(dealCreationCalls, { isHaltOnError: true })

  if (!response.isSuccess) {
    throw new Error(`API Error: ${response.getErrorMessages().join('; ')}`)
  }

  const data = response.getData()!

  // Collect the IDs of all created transactions
  const createdDealIds: number[] = []
  data.forEach((chunkRow) => {
    createdDealIds.push(chunkRow.item.id)
  })

  $logger.info('Created deals with ID', {
    createdDealIds
  })
} catch (error) {
  $logger.error('some error', { error })
}
