import type { AjaxResult, Result } from '@bitrix24/b24jssdk'
import { B24Hook, LoggerBrowser } from '@bitrix24/b24jssdk'

type CatalogProduct = {
  xmlId: string
  id: number
  iblockId: number
  name: string
  quantity: string
  [key: string]: any
}

const $logger = LoggerBrowser.build('MyApp:catalog.product.list', true)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/k32t88gf3azpmwv3')

// Get iblockId from catalog.catalog.list
const responseCatalogList: Result<{
  id: number
  iblockId: number
  iblockTypeId: string
}[]> = await $b24.callListMethod(
  'catalog.catalog.list',
  {
    select: ['id', 'iblockId', 'iblockTypeId']
  },
  null,
  'catalogs'
)

if (!responseCatalogList.isSuccess) {
  throw new Error(responseCatalogList.getErrorMessages().join(';\n'))
}

// @memo we get first iblockId
const iblockId: number = ((responseCatalogList.getData() || []).map(row => row.iblockId))[0] || 0

// And now select some products
let list: CatalogProduct[] = []
let lastId = 0
let isFinish = false

while (!isFinish) {
  const response: AjaxResult<CatalogProduct[]> = await $b24.callMethod(
    'catalog.product.list',
    {
      order: { id: 'asc' },
      select: ['xmlId', 'id', 'iblockId', 'name', 'quantity'],
      filter: {
        'iblockId': iblockId,
        '>id': lastId,
        '%name': 'Prime' // There is no need to specify `Prime%`, this field searches for a substring
      }
    },
    -1 // This parameter will disable the count request and significantly speed up the data retrieval.
  )

  if (!response.isSuccess) {
    throw new Error(response.getErrorMessages().join(';\n'))
  }

  const resultData = response.getData().result.products

  if (resultData.length < 1) {
    isFinish = true
    continue
  }

  lastId = resultData[resultData.length - 1]!.id
  list = [...list, ...resultData]
}

$logger.info(`Products list (${list.length}):`, list)
