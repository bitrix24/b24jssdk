import type { AjaxResult } from '@bitrix24/b24jssdk'
import { B24Hook, LoggerBrowser } from '@bitrix24/b24jssdk'

const $logger = LoggerBrowser.build('MyApp:user.list', true)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/xxxx/')

let list: any[] = []

try {
  const response = await $b24.callMethod(
    'user.get',
    { sort: 'ID', order: 'ASC', select: ['ID', 'NAME'] },
    0
  )

  if (!response.isSuccess) {
    throw new Error(response.getErrorMessages().join(';\n'))
  }

  const resultData = response.getData().result

  list = [...list, ...resultData]

  if (response.isMore()) {
    let responseLoop: false | AjaxResult = response

    while (true) {
      responseLoop = await responseLoop.getNext($b24.getHttpClient())

      if (responseLoop === false) {
        break
      }

      if (!responseLoop.isSuccess) {
        throw new Error(responseLoop.getErrorMessages().join(';\n'))
      }

      const resultData = responseLoop.getData().result
      list = [...list, ...resultData]
    }
  }

  $logger.info('User list:', list)
} catch (error) {
  $logger.error(error)
}
