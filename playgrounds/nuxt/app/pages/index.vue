<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import type { B24Frame } from '@bitrix24/b24jssdk'
import { B24LangList, LoadDataType, LoggerBrowser, useB24Helper } from '@bitrix24/b24jssdk'
import SimpleProfile from '~/components/SimpleProfile.vue'
import SimpleAppInfo from '~/components/SimpleAppInfo.vue'

const route = useRoute()

console.log(route.path)
const { $initializeB24Frame } = useNuxtApp()

let $b24: B24Frame
const $logger = LoggerBrowser.build(
  '[playground: jssdk-nuxt] App',
  true
)
const b24CurrentLang = ref(B24LangList.en)
const { initB24Helper, destroyB24Helper, getB24Helper } = useB24Helper()
const isInit = ref(false)
const $isInitB24Helper = ref(false)
const stopInterval = ref(0)

onMounted(async () => {
  try {
    $logger.warn('onMounted >> ')
    $b24 = await $initializeB24Frame()
    $b24.setLogger($logger)
    b24CurrentLang.value = $b24.getLang()
    $logger.log('locale >>>', b24CurrentLang.value)
    await initB24Helper(
      $b24,
      [
        LoadDataType.AppOptions
      ]
    )

    $isInitB24Helper.value = true

    isInit.value = true

    await makeFitWindow()

    stopInterval.value = window.setInterval(() => {
      isShowComponent1.value = Math.floor(Math.random() * 10) > 6
      isShowComponent2.value = Math.floor(Math.random() * 10) > 6
      $logger.info({
        isShowComponent1: isShowComponent1.value,
        isShowComponent2: isShowComponent2.value
      })
    }, 5_000)
  } catch (error) {
    $logger.error(error)
    showError({
      statusCode: 404,
      statusMessage: (error instanceof Error) ? error.message : (error as string),
      cause: error,
      fatal: true
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

const isShowComponent1 = ref(true)
const isShowComponent2 = ref(true)
</script>

<template>
  <ClientOnly>
    <B24Alert
      v-if="!isInit"
      description="Connection to Bitrix24 ..."
    />
    <div v-else>
      <B24Alert
        :title="b24Helper?.hostName.replace('https://', '')"
        description="Everything is fine"
        color="success"
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
    </div>
  </ClientOnly>
</template>
