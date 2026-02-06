import type { BatchNamedCommandsUniversal } from '@bitrix24/b24jssdk'
import { B24Hook, LoggerFactory, SdkError, AjaxError } from '@bitrix24/b24jssdk'

export async function Action_batchRestApiVer2DataStorage() {
  // region: start ////
  type DataStorageParams = {
    ENTITY: string
    NAME: string
    ACCESS: Record<string, 'R' | 'W' | 'X'>
  }

  type PropertyParams = {
    PROPERTY: string
    NAME: string
    TYPE: 'S' | 'N' | 'F'
  }

  type DataStorage = {
    isInit: boolean
    dataStorage: DataStorageParams
    props: PropertyParams[]
  }

  const _devMode = typeof import.meta !== 'undefined' && (import.meta.dev || import.meta.env?.DEV)
  const $logger = LoggerFactory.createForBrowser('Example:batchDataStorage', true)
  const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

  async function initDataStorageList(dataStorageMap: Map<string, DataStorage>, requestId: string): Promise<void> {
    // get current list
    const response = await $b24.actions.v2.call.make<{ ENTITY: string, NAME: string }[]>({
      method: 'entity.get',
      params: {},
      requestId: `${requestId}/init:getCurrentList`
    })

    if (!response.isSuccess) {
      throw new SdkError({
        code: 'MY_APP_GET_PROBLEM',
        description: `Problem ${response.getErrorMessages().join('; ')}`,
        status: 404
      })
    }

    const currentDataStorageList = response.getData()!.result as { ENTITY: string, NAME: string }[]

    for (const dataStorage of dataStorageMap.values()) {
      const isInit = currentDataStorageList.some(row => row.ENTITY === dataStorage.dataStorage.ENTITY)
      if (isInit) {
        dataStorage.isInit = true
      } else {
        await initDataStorage(dataStorage, requestId)
        dataStorage.isInit = true
      }
    }
  }

  async function initDataStorage(dataStorage: DataStorage, requestId: string): Promise<void> {
    const callBatch: BatchNamedCommandsUniversal = {
      AddEntity: {
        method: 'entity.add',
        params: dataStorage.dataStorage
      }
    }

    for (const property of dataStorage.props) {
      callBatch[`prop${property.PROPERTY}`] = {
        method: 'entity.item.property.add',
        params: {
          ...property,
          ENTITY: dataStorage.dataStorage.ENTITY
        }
      }
    }

    const response = await $b24.actions.v2.batch.make({
      calls: callBatch,
      options: {
        isHaltOnError: true,
        returnAjaxResult: false,
        requestId: `${requestId}/init:${dataStorage.dataStorage.ENTITY}`
      }
    })

    if (!response.isSuccess) {
      throw new SdkError({
        code: 'MY_APP_GET_PROBLEM',
        description: `Problem ${response.getErrorMessages().join('; ')}`,
        status: 404
      })
    }
  }

  // Usage
  const requestId = 'batch/DataStorage'
  try {
    const dataStorageMap: Map<string, DataStorage> = new Map([
      ['DataStorage1', {
        isInit: false,
        dataStorage: {
          ENTITY: 'DS1',
          NAME: 'Data Storage 1',
          ACCESS: {
            U1: 'X',
            AU: 'R'
          }
        },
        props: [
          {
            PROPERTY: 'PropertyN',
            NAME: 'Property N',
            TYPE: 'N'
          }
        ]
      }],
      ['DataStorage2', {
        isInit: false,
        dataStorage: {
          ENTITY: 'DS2',
          NAME: 'Data Storage 2',
          ACCESS: {
            U1: 'X',
            AU: 'R'
          }
        },
        props: [
          {
            PROPERTY: 'PropertyS',
            NAME: 'Property S',
            TYPE: 'S'
          }
        ]
      }],
      ['DataStorage3', {
        isInit: false,
        dataStorage: {
          ENTITY: 'DS3',
          NAME: 'Data Storage 3',
          ACCESS: {
            U1: 'X',
            AU: 'R'
          }
        },
        props: [
          {
            PROPERTY: 'PropertyF',
            NAME: 'Property F',
            TYPE: 'F'
          }
        ]
      }]
    ])

    await initDataStorageList(dataStorageMap, requestId)

    $logger.info(`dataStorageList`, {
      items: [...dataStorageMap.values()].map(c => ({
        entity: c.dataStorage.ENTITY,
        isInit: c.isInit,
        title: c.dataStorage.NAME,
        props: c.props
      }))
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
