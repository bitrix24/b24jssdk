import type { NumberString } from '@bitrix24/b24jssdk'
import { B24Hook, LoggerFactory } from '@bitrix24/b24jssdk'

type Task = {
  id: NumberString
  title: string
  responsibleId: NumberString
}

const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)
const $logger = LoggerFactory.createForBrowser('Example:AllTasks', devMode)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

try {
  const response = await $b24.actions.v2.callList.make<Task>({
    method: 'tasks.task.list',
    params: {
      filter: { REAL_STATUS: [2, 3] }, // Tasks in progress and pending execution
      select: ['ID', 'TITLE', 'RESPONSIBLE_ID']
    },
    idKey: 'id',
    customKeyForResult: 'tasks' // The key under which the tasks are located in the response
  })

  if (!response.isSuccess) {
    throw new Error(`API Error: ${response.getErrorMessages().join('; ')}`)
  }

  const activeTasks = response.getData()
  $logger.debug(`Active tasks: ${activeTasks?.length}`)

  // Group by responsible
  const tasksByResponsible = (activeTasks || []).reduce((acc: Record<number, Task[]>, task) => {
    const responsibleId = Number.parseInt(task.responsibleId)
    if (!acc[responsibleId]) {
      acc[responsibleId] = []
    }

    acc[responsibleId].push(task)
    return acc
  }, {})

  $logger.info('Tasks by Responsible Person', { tasksByResponsible })
} catch (error) {
  $logger.error('some error', { error })
}
