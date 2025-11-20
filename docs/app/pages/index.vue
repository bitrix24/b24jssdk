<script setup lang="ts">
// import { joinURL } from 'ufo'
import type { DefineComponent } from 'vue'
import { navigateTo, useColorMode } from '#imports'
import { Chat } from '@ai-sdk/vue'
import type { UIMessage, UIToolInvocation } from 'ai'
import { DefaultChatTransport } from 'ai'
import AlertIcon from '@bitrix24/b24icons-vue/outline/AlertIcon'
import RobotIcon from '@bitrix24/b24icons-vue/outline/RobotIcon'
import EncloseTextInCodeTagIcon from '@bitrix24/b24icons-vue/editor/EncloseTextInCodeTagIcon'
import InfoCircleIcon from '@bitrix24/b24icons-vue/outline/InfoCircleIcon'
import DemonstrationOnIcon from '@bitrix24/b24icons-vue/outline/DemonstrationOnIcon'
import { splitByCase, upperFirst } from 'scule'
import { useMemoize } from '@vueuse/core'
import ProseStreamPre from '../components/prose/PreStream.vue'
import UserIcon from '@bitrix24/b24icons-vue/common-b24/UserIcon'
import Maximize2Icon from '@bitrix24/b24icons-vue/outline/Maximize2Icon'
import Minimize2Icon from '@bitrix24/b24icons-vue/outline/Minimize2Icon'

const { data: page } = await useAsyncData('index', () => queryCollection('index').first())
if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

const config = useRuntimeConfig()

useSeoMeta({
  titleTemplate: '%s',
  title: page.value.title,
  description: page.value.description,
  ogTitle: `${page.value.title}`,
  ogDescription: page.value.description
  // ogImage: joinURL(config.public.siteUrl, `${config.public.baseUrl}/og-image.png`)
})

const iconFromIconName = (iconName?: string) => {
  if (!iconName) {
    return undefined
  }

  switch (iconName) {
    case 'EncloseTextInCodeTagIcon': return EncloseTextInCodeTagIcon
    case 'InfoCircleIcon': return InfoCircleIcon
    case 'DemonstrationOnIcon': return DemonstrationOnIcon
  }

  return undefined
}

const colorMode = useColorMode()
const isDark = computed(() => {
  return colorMode.value === 'dark'
})
const isMounted = ref(false)
const cardColorContext = computed(() => {
  if (import.meta.server || !isMounted.value) {
    return 'light'
  }
  return isDark.value ? 'dark' : 'light'
})

onMounted(() => {
  isMounted.value = true
})

const { mobileLinks } = useHeader()
</script>

<template>
  <B24SidebarLayout
    :use-light-content="false"
  >
    <template #sidebar>
      <B24SidebarHeader>
        <LogoWithVersion />
      </B24SidebarHeader>
      <B24SidebarBody>
        <B24NavigationMenu
          :items="mobileLinks"
          orientation="vertical"
        />
      </B24SidebarBody>
      <B24SidebarFooter>
        <B24SidebarSection>
          <ExtLinks />
        </B24SidebarSection>
      </B24SidebarFooter>
    </template>
    <template #navbar>
      <Header />
    </template>

    <B24Card
      v-if="page"
      class="mt-[22px]"
      :class="cardColorContext"
    >
      <div class="pt-[88px] h-auto lg:h-[calc(100vh-200px)] lg:pt-[12px] grid content-center lg:grid-cols-12 gap-y-[54px] lg:gap-[22px] items-center justify-between">
        <div class="col-span-12 lg:col-start-2 lg:col-span-4 flex flex-col gap-[12px] text-center lg:text-right">
          <ProseH1 class="mb-0 leading-(--ui-font-line-height-3xs)">
            <span class="text-(--ui-color-accent-main-primary)">@bitrix24/b24jssdk</span> <br>Bitrix24 JS SDK
          </ProseH1>
          <ProseP>
            {{ page.hero.description }}
          </ProseP>
          <B24Separator class="my-4" type="dashed" />
          <div class="flex flex-col sm:flex-row items-center justify-center lg:justify-end gap-[6px]">
            <B24Button
              v-for="link of page.hero.links"
              :key="link.label"
              v-bind="link"
              size="md"
              :icon="iconFromIconName(link?.iconName)"
            />
          </div>
        </div>
        <div class="relative col-span-12 lg:col-end-13 lg:col-span-7 mb-6 lg:mb-0">
          <B24Card>
            @todo add Chat
          </B24Card>
        </div>
      </div>
    </B24Card>

    <template #content-bottom>
      <Footer />
    </template>
  </B24SidebarLayout>
</template>
