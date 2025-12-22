import type { NumberString, ISODate } from '@bitrix24/b24jssdk'
import { B24Hook, LoggerBrowser } from '@bitrix24/b24jssdk'

type Task = {
  id: NumberString
  title: string
  responsibleId: NumberString
  deadline: null | ISODate
}

const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)
const $logger = LoggerBrowser.build('Example:ProcessAllTasks', devMode)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

const overdueTasks: any[] = []
const today = new Date()

try {
  for await (const chunk of $b24.fetchListMethod<Task>(
    'tasks.task.list',
    {
      filter: {
        REAL_STATUS: [2, 3] // Tasks in progress and pending execution
      },
      select: ['ID', 'TITLE', 'DEADLINE', 'RESPONSIBLE_ID']
    },
    'ID',
    'tasks' // The key under which the tasks are located in the response
  )) {
    // Filter overdue tasks
    const overdueInChunk = chunk.filter((task) => {
      if (!task.deadline) {
        return false
      }
      const deadline = new Date(task.deadline)
      return deadline < today
    })

    overdueTasks.push(...overdueInChunk)

    $logger.info(`Processed tasks ${chunk.length}, expired found: ${overdueInChunk.length}`)

    // You can perform intermediate actions on the overdue tasks found
    if (overdueInChunk.length > 0) {
      // For example, send notifications or update status
      await processOverdueTasks(overdueInChunk)
    }
  }

  $logger.info(`Total number of overdue tasks found: ${overdueTasks.length}`)
} catch (error) {
  $logger.error(error)
}

async function processOverdueTasks(overdue: Task[]) {
  // some process
  $logger.info('Process overdue:', overdue)
}
