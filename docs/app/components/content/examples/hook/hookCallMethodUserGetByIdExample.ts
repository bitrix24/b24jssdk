import type { AjaxResult } from '@bitrix24/b24jssdk'
import { B24Hook, LoggerBrowser } from '@bitrix24/b24jssdk'

type User = {
  ID: number
  NAME: string
  [key: string]: any
}

const $logger = LoggerBrowser.build('MyApp:user.get', true)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/xxxx/')

try {
  const response: AjaxResult<User[]> = await $b24.callMethod(
    'user.get',
    { ID: 1 }
  )

  if (!response.isSuccess) {
    throw new Error(response.getErrorMessages().join(';\n'))
  }

  const data = response.getData().result

  if (data.length < 1) {
    throw new Error('Empty result')
  }

  const user = data[0]

  $logger.info(`User id: ${user.ID}, name: ${user.NAME}`, user)
} catch (error) {
  $logger.error(error)
}
