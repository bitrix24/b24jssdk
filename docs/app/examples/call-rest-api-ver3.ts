import { B24Hook, LoggerFactory, SdkError, AjaxError } from '@bitrix24/b24jssdk'

export async function Action_callRestApiVer3() {
  // region: start ////
  type Task = {
    id: number
    title: string
    autocompleteSubTasks: boolean
  }

  const _devMode = typeof import.meta !== 'undefined' && (import.meta.dev || import.meta.env?.DEV)
  const $logger = LoggerFactory.createForBrowser('Example:taskGet', true)
  const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

  async function getTask(itemId: number, requestId: string): Promise<Task> {
    const response = await $b24.actions.v3.call.make<{ item: Task }>({
      method: 'tasks.task.get',
      params: {
        id: itemId,
        select: ['id', 'title', 'autocompleteSubTasks']
      },
      requestId
    })

    if (!response.isSuccess) {
      throw new SdkError({
        code: 'MY_APP_GET_PROBLEM',
        description: `Problem ${response.getErrorMessages().join('; ')}`,
        status: 404
      })
    }

    return response.getData()!.result.item
  }

  // Usage
  const itemId = 2
  const requestId = `task-${itemId}`
  try {
    const entity = await getTask(itemId, requestId)
    $logger.info(`Entity [${entity.id}]`, { entity })
  } catch (error) {
    if (error instanceof AjaxError) {
      $logger.critical(error.message, { requestId, code: error.code })
    } else {
      $logger.alert('Problem', { requestId, error })
    }
  }
  // endregion: start ////
}
