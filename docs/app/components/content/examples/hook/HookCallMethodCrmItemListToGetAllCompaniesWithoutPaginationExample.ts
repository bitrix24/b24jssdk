import type { AjaxResult } from '@bitrix24/b24jssdk'
import { B24Hook, LoggerBrowser, EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'

type CrmEntityCompany = {
  id: number
  title: string
  [key: string]: any
}

const $logger = LoggerBrowser.build('MyApp:crm.item.list', true)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/k32t88gf3azpmwv3')

let list: CrmEntityCompany[] = []

let lastId = 0
let isFinish = false

while (!isFinish) {
  const response: AjaxResult<CrmEntityCompany[]> = await $b24.callMethod(
    'crm.item.list',
    {
      entityTypeId: EnumCrmEntityTypeId.company,
      order: { id: 'asc' },
      select: ['id', 'title'],
      filter: {
        '>id': lastId,
        '=%title': 'Prime%'
      }
    },
    -1 // This parameter will disable the count request and significantly speed up the data retrieval.
  )

  if (!response.isSuccess) {
    throw new Error(response.getErrorMessages().join(';\n'))
  }

  const resultData = response.getData().result.items

  if (resultData.length < 1) {
    isFinish = true
    continue
  }

  lastId = resultData[resultData.length - 1]!.id
  list = [...list, ...resultData]
}

$logger.info(`Companies list (${list.length}):`, list)
