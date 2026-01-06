import { B24Hook, LoggerBrowser, ApiVersion, ParamsFactory } from '@bitrix24/b24jssdk'

type Task = {
  id: number
  title: string
}

const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)
const $logger = LoggerBrowser.build('Example:taskGet', devMode)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl(
  'https://your_domain.bitrix24.com/rest/1/webhook_code/',
  {
    version: ApiVersion.v3,
    restrictionParams: ParamsFactory.getDefault()
  }
)

async function getTask(id: number): Promise<Task | null> {
  const response = await $b24.call<{ item: Task }>(
    'tasks.task.get',
    {
      id,
      select: ['id', 'title']
    }
  )

  if (!response.isSuccess) {
    throw new Error(`Failed to get task: ${response.getErrorMessages().join('; ')}`)
  }

  return response.getData().result.item
}

// Usage
try {
  const task = await getTask(1)
  $logger.info(`Task: ${task?.title} (ID: ${task?.id})`)
} catch (error) {
  $logger.error(error)
}
