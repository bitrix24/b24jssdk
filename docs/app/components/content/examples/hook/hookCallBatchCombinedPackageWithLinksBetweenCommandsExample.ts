import { B24Hook, EnumCrmEntityTypeId, LoggerBrowser } from '@bitrix24/b24jssdk'

const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)
const $logger = LoggerBrowser.build('Example:BatchWithReferences', devMode)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

const dealId = 1

try {
  const response = await $b24.callBatch({
    // 1. We receive a transaction by ID
    Deal: {
      method: 'crm.item.get',
      params: {
        entityTypeId: EnumCrmEntityTypeId.deal,
        id: dealId
      }
    },

    // 2. We get the contact from the deal (using the result of the first command)
    DealContact: {
      method: 'crm.item.get',
      params: {
        entityTypeId: EnumCrmEntityTypeId.contact,
        id: '$result[Deal][item][contactId]'
      }
    },

    // 3. We receive the last 50 tasks for this contact.
    ContactTasks: {
      method: 'tasks.task.list',
      params: {
        filter: {
          UF_CRM_TASK: 'C_$result[DealContact][item][id]'
        },
        select: ['ID', 'TITLE', 'DEADLINE'],
        order: { ID: 'DESC' }
      }
    }
  })

  if (!response.isSuccess) {
    throw new Error(`API Error: ${response.getErrorMessages().join('; ')}`)
  }

  const data = response.getData()
  $logger.info({
    Deal: data.Deal?.item,
    Contact: data.DealContact?.item,
    Tasks: data.ContactTasks?.tasks || []
  })
} catch (error) {
  $logger.error(error)
}
