import { B24Hook, LoggerFactory, AjaxError } from '@bitrix24/b24jssdk'

type Task = {
  id: number
  title: string
}

const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)
const $logger = LoggerFactory.createForBrowser('Example:taskGet', devMode)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

const loggerForDebugB24 = LoggerFactory.createForBrowser('b24', false)
$b24.setLogger(loggerForDebugB24)

async function getTask(id: number, requestId: string): Promise<Task | null> {
  const response = await $b24.actions.v3.call.make<{ item: Task }>({
    method: 'tasks.task.get',
    params: {
      id,
      select: ['id', 'title']
    },
    requestId
  })

  if (!response.isSuccess) {
    throw new Error(`Failed to get task: ${response.getErrorMessages().join('; ')}`)
  }

  return response.getData()!.result.item
}

// Usage
const requestId = 'test-task-v3'
try {
  const task = await getTask(2, requestId)
  $logger.info(`Task: ${task?.title}`, {
    requestId,
    task
  })
} catch (error) {
  if (error instanceof AjaxError) {
    $logger.critical(error.message, {
      requestId,
      code: error.code
    })
  } else {
    $logger.alert('some error', {
      requestId,
      error
    })
  }
}
