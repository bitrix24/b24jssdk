<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import type { B24Frame, BatchNamedCommandsUniversal } from '@bitrix24/b24jssdk'
import { B24LangList, LoadDataType, LoggerFactory, useB24Helper, SdkError, AjaxError } from '@bitrix24/b24jssdk'
import SimpleProfile from '~/components/SimpleProfile.vue'
import SimpleAppInfo from '~/components/SimpleAppInfo.vue'

const { $initializeB24Frame } = useNuxtApp()

let $b24: B24Frame
const $logger = LoggerFactory.createForBrowserDevelopment('playground/nuxt App')
const b24CurrentLang = ref(B24LangList.en)
const { initB24Helper, destroyB24Helper, getB24Helper } = useB24Helper()
const isInit = ref(false)
const $isInitB24Helper = ref(false)
const stopInterval = ref(0)

const isShowComponent1 = ref(true)
const isShowComponent2 = ref(true)

onMounted(async () => {
  try {
    $logger.notice('onMounted')
    $b24 = await $initializeB24Frame()
    // @todo fix this
    // $b24.setLogger($logger)
    b24CurrentLang.value = $b24.getLang()
    $logger.debug('current lang', {
      locale: b24CurrentLang.value
    })
    await initB24Helper(
      $b24,
      [
        LoadDataType.AppOptions
      ]
    )

    $isInitB24Helper.value = true

    isInit.value = true

    await makeFitWindow()

    // stopInterval.value = window.setInterval(() => {
    //   isShowComponent1.value = Math.floor(Math.random() * 10) > 6
    //   isShowComponent2.value = Math.floor(Math.random() * 10) > 6
    //   $logger.info('interval', {
    //     isShowComponent1: isShowComponent1.value,
    //     isShowComponent2: isShowComponent2.value
    //   })
    // }, 5_000)
  } catch (error) {
    $logger.error('some error', { error })
    showError({
      status: 404,
      statusText: (error instanceof Error) ? error.message : (error as string),
      cause: error
    })
  }
})

onUnmounted(() => {
  $b24?.destroy()
  destroyB24Helper()
  if (stopInterval.value > 0) {
    window.clearInterval(stopInterval.value)
    stopInterval.value = 0
  }
})

const b24Helper = computed(() => {
  if ($isInitB24Helper.value) {
    return getB24Helper()
  }

  return null
})

const makeFitWindow = async () => {
  window.setTimeout(() => {
    $b24.parent.fitWindow()
  }, 200)
}

// region Test ////
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

async function initDs() {
  const requestId = 'batch/DataStorage'
  try {
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
}

async function removeDs() {
  const requestId = 'batch/DataStorageRemove'
  try {
    await removeDataStorageList(dataStorageMap, requestId)
  } catch (error) {
    if (error instanceof AjaxError) {
      $logger.critical(error.message, { requestId, code: error.code })
    } else {
      $logger.alert('Problem', { requestId, error })
    }
  }
}

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

// region v2 ///
const options = {
  PASS_HISTORY_CONTACT_ENTITY: 'DS1',
  PASS_HISTORY_CONTACT_ENTITY_NAME: 'Data Storage 1',
  PASS_HISTORY_CONTACT_FIELDS: [
    {
      PROPERTY: 'PropertyN',
      NAME: 'Property N',
      TYPE: 'N'
    }
  ],
  PASS_HISTORY_USER_ENTITY: 'DS2',
  PASS_HISTORY_USER_ENTITY_NAME: 'Data Storage 2',
  PASS_HISTORY_USER_FIELDS: [
    {
      PROPERTY: 'PropertyS',
      NAME: 'Property S',
      TYPE: 'S'
    }
  ]
}

type StorageInfoV2 = {
  ENTITY: string
  NAME: string
}
type PropertyInfoV2 = {
  PROPERTY: string
}

async function initDsV2() {
  const response = await $b24.actions.v2.call.make({
    method: 'entity.get',
    params: {},
    requestId: `initDsV2`
  })
  const arStoragesList = response.getData()!.result as StorageInfoV2[]
  await checkContactPassHistoryStorage(arStoragesList)
  // sleep(1); // fix ??
  await checkUserPassHistoryStorage(arStoragesList)
}

async function checkContactPassHistoryStorage(arStoragesList: StorageInfoV2[]) {
  for (const storageCurrent of arStoragesList) {
    if (storageCurrent.ENTITY === options.PASS_HISTORY_CONTACT_ENTITY) {
      const response = await $b24.actions.v2.call.make({
        method: 'entity.item.property.get',
        params: {
          ENTITY: options.PASS_HISTORY_CONTACT_ENTITY
        },
        requestId: `initDsV2/${options.PASS_HISTORY_CONTACT_ENTITY}/props`
      })
      const arPropertiesList = response.getData()!.result as PropertyInfoV2[]
      const arPropertiesIdList = []

      for (const property of arPropertiesList) {
        arPropertiesIdList.push(property.PROPERTY)
      }

      const callBatch: BatchNamedCommandsUniversal = {}
      let isNeedCall = false

      for (const field of options.PASS_HISTORY_CONTACT_FIELDS) {
        if (!arPropertiesIdList.includes(field.PROPERTY)) {
          isNeedCall = true
          callBatch[`${options.PASS_HISTORY_CONTACT_ENTITY}_${field.PROPERTY}`] = {
            method: 'entity.item.property.add',
            params: {
              ENTITY: options.PASS_HISTORY_CONTACT_ENTITY,
              PROPERTY: field.PROPERTY,
              NAME: field.NAME,
              TYPE: field.TYPE
            }
          }
        }
      }

      if (isNeedCall) {
        await $b24.actions.v2.batch.make({
          calls: callBatch,
          options: {
            isHaltOnError: true,
            returnAjaxResult: false,
            requestId: `initDsV2/${options.PASS_HISTORY_CONTACT_ENTITY}/props/addNew`
          }
        })
      }

      return
    }
  }

  {
    await $b24.actions.v2.call.make({
      method: 'entity.add',
      params: {
        ENTITY: options.PASS_HISTORY_CONTACT_ENTITY,
        NAME: options.PASS_HISTORY_CONTACT_ENTITY_NAME,
        ACCESS: {
          // U1: 'X',
          AU: 'X' // 'R'
        }
      },
      requestId: `initDsV2/${options.PASS_HISTORY_CONTACT_ENTITY}/new`
    })

    const callBatch: BatchNamedCommandsUniversal = {}
    let isNeedCall = false

    for (const field of options.PASS_HISTORY_CONTACT_FIELDS) {
      isNeedCall = true
      callBatch[`${options.PASS_HISTORY_CONTACT_ENTITY}_${field.PROPERTY}`] = {
        method: 'entity.item.property.add',
        params: {
          ENTITY: options.PASS_HISTORY_CONTACT_ENTITY,
          PROPERTY: field.PROPERTY,
          NAME: field.NAME,
          TYPE: field.TYPE
        }
      }
    }

    if (isNeedCall) {
      await $b24.actions.v2.batch.make({
        calls: callBatch,
        options: {
          isHaltOnError: true,
          returnAjaxResult: false,
          requestId: `initDsV2/${options.PASS_HISTORY_CONTACT_ENTITY}/new/props/addNew`
        }
      })
    }
  }
}

async function checkUserPassHistoryStorage(arStoragesList: StorageInfoV2[]) {
  for (const storageCurrent of arStoragesList) {
    if (storageCurrent.ENTITY === options.PASS_HISTORY_USER_ENTITY) {
      const response = await $b24.actions.v2.call.make({
        method: 'entity.item.property.get',
        params: {
          ENTITY: options.PASS_HISTORY_USER_ENTITY
        },
        requestId: `initDsV2/${options.PASS_HISTORY_USER_ENTITY}/props`
      })
      const arPropertiesList = response.getData()!.result as PropertyInfoV2[]
      const arPropertiesIdList = []

      for (const property of arPropertiesList) {
        arPropertiesIdList.push(property.PROPERTY)
      }

      const callBatch: BatchNamedCommandsUniversal = {}
      let isNeedCall = false

      for (const field of options.PASS_HISTORY_USER_FIELDS) {
        if (!arPropertiesIdList.includes(field.PROPERTY)) {
          isNeedCall = true
          callBatch[`${options.PASS_HISTORY_USER_ENTITY}_${field.PROPERTY}`] = {
            method: 'entity.item.property.add',
            params: {
              ENTITY: options.PASS_HISTORY_USER_ENTITY,
              PROPERTY: field.PROPERTY,
              NAME: field.NAME,
              TYPE: field.TYPE
            }
          }
        }
      }

      if (isNeedCall) {
        await $b24.actions.v2.batch.make({
          calls: callBatch,
          options: {
            isHaltOnError: true,
            returnAjaxResult: false,
            requestId: `initDsV2/${options.PASS_HISTORY_USER_ENTITY}/props/addNew`
          }
        })
      }

      return
    }
  }

  {
    await $b24.actions.v2.call.make({
      method: 'entity.add',
      params: {
        ENTITY: options.PASS_HISTORY_USER_ENTITY,
        NAME: options.PASS_HISTORY_USER_ENTITY_NAME,
        ACCESS: {
          // U1: 'X',
          AU: 'X' // 'R'
        }
      },
      requestId: `initDsV2/${options.PASS_HISTORY_USER_ENTITY}/new`
    })

    const callBatch: BatchNamedCommandsUniversal = {}
    let isNeedCall = false

    for (const field of options.PASS_HISTORY_USER_FIELDS) {
      isNeedCall = true
      callBatch[`${options.PASS_HISTORY_USER_ENTITY}_${field.PROPERTY}`] = {
        method: 'entity.item.property.add',
        params: {
          ENTITY: options.PASS_HISTORY_USER_ENTITY,
          PROPERTY: field.PROPERTY,
          NAME: field.NAME,
          TYPE: field.TYPE
        }
      }
    }

    if (isNeedCall) {
      await $b24.actions.v2.batch.make({
        calls: callBatch,
        options: {
          isHaltOnError: true,
          returnAjaxResult: false,
          requestId: `initDsV2/${options.PASS_HISTORY_USER_ENTITY}/new/props/addNew`
        }
      })
    }
  }
}
// endregion ////
// endregion ////
</script>

<template>
  <ClientOnly>
    <template #fallback>
      <B24Skeleton class="h-4 w-[500px]" />

      <div class="flex items-center gap-4">
        <B24Skeleton class="h-4 w-[250px]" />
        <B24Skeleton class="h-4 w-[250px]" />
      </div>
    </template>

    <template v-if="!isInit">
      <B24Alert description="Connection to Bitrix24 ..." />

      <div class="flex items-center gap-4">
        <B24Skeleton class="h-4 w-[250px]" />
        <B24Skeleton class="h-4 w-[250px]" />
      </div>
    </template>
    <template v-else>
      <div class="flex flex-row items-start gap-2">
        <B24Button label="init storage" color="air-boost" loading-auto @click="initDs" />
        <B24Button label="init storage v2" color="air-secondary-no-accent" loading-auto @click="initDsV2" />
        <B24Button label="remove storage" color="air-secondary-alert" loading-auto @click="removeDs" />
      </div>

      <B24Alert
        :title="b24Helper?.hostName.replace('https://', '')"
        description="Everything is fine"
        color="air-primary-success"
      />
      <div class="mt-4 flex flex-row gap-2 items-start justify-between">
        <div class="w-1/2">
          <ProseH3 class="mb-0">
            Profile
            <ProseCode :color="isShowComponent1 ? 'success' : 'default'">
              {{ isShowComponent1 ? 'On' : 'Off' }}
            </ProseCode>
          </ProseH3>
          <SimpleProfile v-if="isShowComponent1" />
        </div>
        <div class="w-1/2">
          <ProseH3 class="mb-0">
            AppInfo
            <ProseCode :color="isShowComponent2 ? 'success' : 'default'">
              {{ isShowComponent2 ? 'On' : 'Off' }}
            </ProseCode>
          </ProseH3>
          <SimpleAppInfo v-if="isShowComponent2" />
        </div>
      </div>
    </template>
  </ClientOnly>
</template>
