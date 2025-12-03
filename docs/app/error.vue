<script setup lang="ts">
import type { NuxtError } from '#app'
import { clearError, useColorMode } from '#imports'
import CloudErrorIcon from '@bitrix24/b24icons-vue/main/CloudErrorIcon'

const props = defineProps<{
  error: NuxtError
}>()

const route = useRoute()
const config = useRuntimeConfig()

const { data: navigation } = await useAsyncData('navigation', () => queryCollectionNavigation('docs', []))
const { data: files } = useLazyAsyncData(
  'search-error',
  async () => {
    const data = await queryCollectionSearchSections('docs', {
      ignoredTags: ['style']
    })

    return data.map((file) => {
      return {
        ...file,
        id: file.id.replace(/([^/])(#.*)?$/, (_, char, hash = '') => `${char}/${hash}`)
      }
    })
  },
  {
    server: false
  }
)

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [],
  htmlAttrs: { lang: 'en' }
})

useSeoMeta({
  titleTemplate: '%s - Bitrix24 JS SDK',
  title: String(props.error.statusCode)
})

useServerSeoMeta({
  ogSiteName: 'Bitrix24 JS SDK',
  twitterCard: 'summary_large_image'
})

const { rootNavigation } = useNavigation(navigation)

provide('navigation', rootNavigation)

const colorMode = useColorMode()
const isDark = computed(() => {
  return colorMode.value === 'dark'
})
const isMounted = ref(false)
const cardColorContext = computed(() => {
  if (import.meta.server || !isMounted.value) {
    return 'edge-dark'
  }
  return isDark.value ? 'dark' : 'edge-dark'
})

onMounted(() => {
  isMounted.value = true
})

const b24Instance = useB24()

const isFromB24Ajax = computed(() => {
  return (props.error.cause as any)?.name === 'AjaxError' && !b24Instance.isHookFromEnv() && !b24Instance.isFrame()
})

function resetHook() {
  b24Instance.removeHookFromSessionStorage()
  clearError()
}
</script>

<template>
  <B24App>
    <NuxtLoadingIndicator color="var(--ui-color-accent-main-primary)" :height="2" />

    <B24SidebarLayout :use-light-content="false" :class="[route.path.startsWith('/docs/') && 'root']">
      <template #navbar>
        <Header show-logo-all-time />
      </template>

      <B24Error
        :error="error"
        :class="cardColorContext"
        :b24ui="{
          root: 'mt-[22px] min-h-[calc(100vh-200px)] bg-(--ui-color-design-outline-na-bg) h-[calc(100vh-200px)] p-[12px] rounded-[24px]'
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
      <template #content-bottom>
        <Footer />
      </template>
    </B24SidebarLayout>

    <ClientOnly>
      <Search :files="files" :navigation="rootNavigation" />
      <AIChatSlideover v-if="config.public.useAI" />
    </ClientOnly>
  </B24App>
</template>
