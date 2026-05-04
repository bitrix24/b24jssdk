<script setup lang="ts">
import type { NuxtError } from '#app'
import CloudErrorIcon from '@bitrix24/b24icons-vue/main/CloudErrorIcon'

const props = defineProps<{
  error: NuxtError
}>()

const route = useRoute()
const { style, link } = useTheme()

const { data: navigation } = await useAsyncData('navigationInError', () => queryCollectionNavigation('docs', ['restApiVersion']))

useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link,
  style,
  htmlAttrs: { lang: 'en' }
})

useSeoMeta({
  titleTemplate: '%s - Bitrix24 JS SDK',
  title: props.error.status
})

if (import.meta.server) {
  useSeoMeta({
    ogSiteName: 'Bitrix24 JS SDK',
    twitterCard: 'summary_large_image'
  })
}
const { rootNavigation } = useNavigation(navigation)

provide('navigation', rootNavigation)

const b24Instance = useB24()

const isFromB24Ajax = computed(() => {
  return ((props.error as any).cause as any)?.name === 'AjaxError' && !b24Instance.isHookFromEnv() && !b24Instance.isFrame()
})

function resetHook() {
  b24Instance.removeHookFromSessionStorage()
  clearError()
}
</script>

<template>
  <B24App>
    <NuxtLoadingIndicator color="var(--ui-color-accent-main-primary)" :height="2" />

    <div :class="[route.path.startsWith('/docs/') && 'root']">
      <!-- <Banner /> -->

      <Header />

      <B24Error
        :error="error"
        :b24ui="{
          root: 'min-h-[calc(100vh-var(--topbar-height)-var(--topbar-height))]'
        }"
      >
        <template v-if="isFromB24Ajax" #links>
          <B24Alert
            class="text-left"
            title="Problem with request to Bitrix24"
            description="It might be worth clearing the Bitrix24 connection hook and specifying a different one."
            color="air-primary-warning"
            :icon="CloudErrorIcon"
          >
            <template #actions>
              <B24Button
                label="Clear"
                color="air-secondary-alert"
                @click="resetHook"
              />
            </template>
          </B24Alert>
        </template>
      </B24Error>
      <Footer />
    </div>
  </B24App>
</template>
