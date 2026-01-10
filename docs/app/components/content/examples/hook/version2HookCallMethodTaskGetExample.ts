import { B24Hook, LoggerFactory } from '@bitrix24/b24jssdk'

type Task = {
  ID: number
  TITLE: string
}

const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)
const $logger = LoggerFactory.createForBrowser('Example:taskGet', devMode)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

const loggerForDebugB24 = LoggerFactory.createForBrowser('b24', false)
$b24.setLogger(loggerForDebugB24)

async function getTask(id: number, requestId: string): Promise<Task | null> {
  const response = await $b24.callV2<{ item: Task }>(
    'tasks.task.get',
    {
      taskId: id,
      select: ['ID', 'TITLE']
    },
    requestId
  )

  if (!response.isSuccess) {
    throw new Error(`Failed to get task: ${response.getErrorMessages().join('; ')}`)
  }

  return response.getData().result.item
}

// Usage
const requestId = 'test-task-v2'
try {
  const task = await getTask(2, requestId)
  $logger.info(`Task: ${task?.TITLE}`, {
    requestId,
    task
  })
} catch (error) {
  $logger.alert('some error', {
    requestId,
    error
  })
}
