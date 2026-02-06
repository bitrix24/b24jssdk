import type { AjaxResult, Result, BatchCommandsArrayUniversal } from '@bitrix24/b24jssdk'
import { B24Hook, EnumCrmEntityTypeId, LoggerFactory, SdkError, AjaxError } from '@bitrix24/b24jssdk'

export async function Action_batchRestApiVer2() {
  // region: start ////
  type Company = {
    id: number
    title: string
    [key: string]: any
  }

  const _devMode = typeof import.meta !== 'undefined' && (import.meta.dev || import.meta.env?.DEV)
  const $logger = LoggerFactory.createForBrowser('Example:batchCrmItems', true)
  const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

  async function getMultipleItems(itemIds: number[], requestId: string): Promise<Company[]> {
    if (itemIds.length < 1 || itemIds.length > 50) {
      throw new SdkError({
        code: 'MY_APP_GET_PROBLEM',
        description: `The number of elements must be between 1 and 50`,
        status: 404
      })
    }

    const batchCalls: BatchCommandsArrayUniversal = itemIds.map(id => [
      'crm.item.get',
      {
        entityTypeId: EnumCrmEntityTypeId.company,
        id
      }
    ])

    const response = await $b24.actions.v2.batch.make<{ item: Company }>({
      calls: batchCalls,
      options: {
        isHaltOnError: true,
        returnAjaxResult: true,
        requestId
      }
    })

    if (!response.isSuccess) {
      throw new SdkError({
        code: 'MY_APP_GET_PROBLEM',
        description: `Problem ${response.getErrorMessages().join('; ')}`,
        status: 404
      })
    }

    const resultData = (response as Result<AjaxResult<{ item: Company }>[]>).getData()!
    const results: Company[] = []
    resultData.forEach((resultRow, _index) => {
      if (resultRow.isSuccess) {
        results.push(resultRow.getData()!.result.item)
      }
    })

    return results
  }

  // Usage
  const requestId = 'batch/crm.item.get'
  try {
    const itemIds = [2, 4]
    const items = await getMultipleItems(itemIds, requestId)

    $logger.info(`Retrieved ${items.length} items`, {
      expected: itemIds.length,
      retrieved: items.length,
      items: items.map(c => ({ id: c.id, title: c.title }))
    })
  } catch (error) {
    if (error instanceof AjaxError) {
      $logger.critical(error.message, { requestId, code: error.code })
    } else {
      $logger.alert('Problem', { requestId, error })
    }
  }
  // endregion: start ////
}
