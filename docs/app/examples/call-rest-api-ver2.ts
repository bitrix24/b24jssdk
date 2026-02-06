import { B24Hook, EnumCrmEntityTypeId, LoggerFactory, SdkError, AjaxError } from '@bitrix24/b24jssdk'

export async function Action_callRestApiVer2() {
  // region: start ////
  type Company = {
    id: number
    title: string
    [key: string]: any
  }

  const _devMode = typeof import.meta !== 'undefined' && (import.meta.dev || import.meta.env?.DEV)
  const $logger = LoggerFactory.createForBrowser('Example:getCrmItem', true)
  const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

  async function getCrmItem(entityTypeId: number, itemId: number, requestId: string): Promise<Company | null> {
    const response = await $b24.actions.v2.call.make<{ item: Company }>({
      method: 'crm.item.get',
      params: {
        entityTypeId: entityTypeId,
        id: itemId
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

    return response.getData()!.result?.item
  }

  // Usage
  const itemId = 528
  const requestId = `crm-item-${itemId}`
  try {
    const entity = await getCrmItem(EnumCrmEntityTypeId.company, itemId, requestId)
    $logger.info(`Entity [${entity?.id}]`, { entity })
  } catch (error) {
    if (error instanceof AjaxError) {
      $logger.critical(error.message, { requestId, code: error.code })
    } else {
      $logger.alert('Problem', { requestId, error })
    }
  }
  // endregion: start ////
}
