import { B24Hook, LoggerFactory, SdkError, AjaxError } from '@bitrix24/b24jssdk'

export async function Action_batchRestApiVer2DataStorageDelete() {
  // region: start ////
  type DataStorageParams = {
    ENTITY: string
    NAME: string
  }

  type DataStorage = {
    dataStorage: DataStorageParams
  }

  const _devMode = typeof import.meta !== 'undefined' && (import.meta.dev || import.meta.env?.DEV)
  const $logger = LoggerFactory.createForBrowser('Example:batchDataStorageDelete', true)
  const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

  async function removeDataStorageList(dataStorageMap: Map<string, DataStorage>, requestId: string): Promise<void> {
    for (const dataStorage of dataStorageMap.values()) {
      const response = await $b24.actions.v2.call.make({
        method: 'entity.delete',
        params: {
          ENTITY: dataStorage.dataStorage.ENTITY
        },
        requestId: `${requestId}/init:getCurrentList`
      })

      if (!response.isSuccess) {
        throw new SdkError({
          code: 'MY_APP_GET_PROBLEM',
          description: `Problem ${response.getErrorMessages().join('; ')}`,
          status: 404
        })
      }
    }
  }

  // Usage
  const requestId = 'batch/DataStorageRemove'
  try {
    const dataStorageMap: Map<string, DataStorage> = new Map([
      ['DataStorage1', {
        dataStorage: {
          ENTITY: 'DS1',
          NAME: 'Data Storage 1'
        }
      }],
      ['DataStorage2', {
        dataStorage: {
          ENTITY: 'DS2',
          NAME: 'Data Storage 2'
        }
      }],
      ['DataStorage3', {
        dataStorage: {
          ENTITY: 'DS3',
          NAME: 'Data Storage 3'
        }
      }]
    ])

    await removeDataStorageList(dataStorageMap, requestId)
  } catch (error) {
    if (error instanceof AjaxError) {
      $logger.critical(error.message, { requestId, code: error.code })
    } else {
      $logger.alert('Problem', { requestId, error })
    }
  }
  // endregion: start ////
}
