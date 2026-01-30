import type { Result } from '@bitrix24/b24jssdk'
import { B24Hook, EnumCrmEntityTypeId, LoggerFactory, ApiVersion } from '@bitrix24/b24jssdk'
import * as http from 'node:http'

type BatchResponse = {
  CompanyList?: { items: Record<string, any> }
  ContactList?: { items: Record<string, any> }
}

const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)
const $logger = LoggerFactory.createForBrowser('Example:BatchObject', devMode)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

try {
  const axiosClient = $b24.getHttpClient(ApiVersion.v2).ajaxClient
  axiosClient.default.httpAgent = new http.Agent({ keepAlive: false })
  axiosClient.default.httpsAgent = new http.Agent({ keepAlive: false })
  const response = await $b24.actions.v2.batch.make({
    calls: {
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
    options: { isHaltOnError: true }
  }) as Result<BatchResponse>

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
