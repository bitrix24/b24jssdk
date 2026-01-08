import type { Result } from '@bitrix24/b24jssdk'
import { B24Hook, EnumCrmEntityTypeId, LoggerFactory } from '@bitrix24/b24jssdk'

type BatchResponse = {
  CompanyList?: { items: Record<string, any> }
  ContactList?: { items: Record<string, any> }
}

const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)
const $logger = LoggerFactory.createForBrowser('Example:BatchObject', devMode)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

try {
  const response = await $b24.callBatch<BatchResponse>(
    {
      CompanyList: {
        method: 'crm.item.list',
        params: {
          entityTypeId: EnumCrmEntityTypeId.company,
          order: { id: 'desc' },
          select: ['id', 'title', 'createdTime']
        }
      },
      ContactList: {
        method: 'crm.item.list',
        params: {
          entityTypeId: EnumCrmEntityTypeId.contact,
          order: { id: 'desc' },
          select: ['id', 'name', 'lastName', 'createdTime']
        }
      }
    },
    { isHaltOnError: true }
  ) as Result<BatchResponse>

  if (!response.isSuccess) {
    throw new Error(`API Error: ${response.getErrorMessages().join('; ')}`)
  }

  const data = response.getData()!
  const dataCompanyList = (data.CompanyList?.items || []).map((item: any) => ({
    id: Number(item.id),
    title: item.title,
    createdTime: new Date(item.createdTime)
  }))

  const dataContactList = (data.ContactList?.items || []).map((item: any) => ({
    id: Number(item.id),
    name: item.name,
    lastName: item.lastName,
    createdTime: new Date(item.createdTime)
  }))

  $logger.info('response', {
    dataCompanyList,
    dataContactList
  })
} catch (error) {
  $logger.error('some error', { error })
}
