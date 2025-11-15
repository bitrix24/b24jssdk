<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import type { B24Frame } from '@bitrix24/b24jssdk'
import { LoadDataType, LoggerBrowser, useB24Helper } from '@bitrix24/b24jssdk'

const { $initializeB24Frame } = useNuxtApp()

let $b24: B24Frame
const $logger = LoggerBrowser.build(
  '[playground: jssdk-nuxt] AppInfo',
  true
)
const { initB24Helper, getB24Helper } = useB24Helper()
const isInit = ref(false)
const $isInitB24Helper = ref(false)

onMounted(async () => {
  $logger.warn('onMounted >> ')

  try {
    $b24 = await $initializeB24Frame()

    await initB24Helper(
      $b24,
      [
        LoadDataType.App
      ]
    )

    $isInitB24Helper.value = true

    isInit.value = true
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
  $logger.warn('onUnmounted << ')
})

const b24Helper = computed(() => {
  if ($isInitB24Helper.value) {
    return getB24Helper()
  }
  return null
})
</script>

<template>
  <ClientOnly>
    <B24Alert
      v-if="!isInit"
      description="Connection to Bitrix24 ..."
    />
    <ProsePre v-else>
      {{ b24Helper?.appInfo.data }}
    </ProsePre>
  </ClientOnly>
</template>
