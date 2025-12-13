import type { AjaxResult, NumberString } from '@bitrix24/b24jssdk'
import { B24Hook, LoggerBrowser } from '@bitrix24/b24jssdk'

type Task = {
  id: NumberString
  title: string
  [key: string]: any
}

const $logger = LoggerBrowser.build('MyApp:tasks.task.list', true)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/k32t88gf3azpmwv3')

let list: Task[] = []

let lastId = 0
let isFinish = false

while (!isFinish) {
  const response: AjaxResult<Task[]> = await $b24.callMethod(
    'tasks.task.list',
    {
      order: { ID: 'ASC' },
      select: ['ID', 'TITLE'],
      filter: {
        '>ID': lastId,
        'TITLE': 'Prime' // There is no need to specify %, this field always searches for a substring
      }
    },
    -1 // This parameter will disable the count request and significantly speed up the data retrieval.
  )

  if (!response.isSuccess) {
    throw new Error(response.getErrorMessages().join(';\n'))
  }

  const resultData = response.getData().result.tasks

  if (resultData.length < 1) {
    isFinish = true
    continue
  }

  lastId = resultData[resultData.length - 1]!.id
  list = [...list, ...resultData]
}

$logger.info(`Tasks list (${list.length}):`, list)
