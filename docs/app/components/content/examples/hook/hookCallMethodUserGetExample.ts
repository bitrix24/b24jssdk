import type { AjaxResult } from '@bitrix24/b24jssdk'
import { B24Hook, LoggerFactory } from '@bitrix24/b24jssdk'

type User = {
  ID: number
  NAME: string
}

const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)
const $logger = LoggerFactory.createForBrowser('Example:getUser', devMode)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')
async function getUser(id: number): Promise<User | null> {
  const response: AjaxResult<User[]> = await $b24.actions.v2.call.make({
    method: 'user.get',
    params: { ID: id }
  })

  if (!response.isSuccess) {
    throw new Error(`Failed to get user: ${response.getErrorMessages().join('; ')}`)
  }

  const users = response.getData()!.result
  return users.length > 0 ? users[0] : null
}

// Usage
try {
  const user = await getUser(1)
  $logger.info(`User: ${user?.NAME}`, { user })
} catch (error) {
  $logger.error('some error', { error })
}
