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

const components = {
  pre: ProseStreamPre as unknown as DefineComponent
}

const toast = useToast()

const messages = defineModel<UIMessage[]>('messages')
const input = ref('')

const chat = new Chat({
  messages: messages.value,
  transport: new DefaultChatTransport({
    api: `${config.public.baseUrl}/api/search`
  }),
  onError(error) {
    const { message } = typeof error.message === 'string' && error.message[0] === '{' ? JSON.parse(error.message) : error

    toast.add({
      description: message,
      icon: AlertIcon,
      color: 'air-primary-alert',
      duration: 0
    })
  }
})

function onSubmit() {
  if (!input.value.trim()) {
    return
  }

  chat.sendMessage({ text: input.value })

  input.value = ''
}

function upperName(name: string) {
  return splitByCase(name).map(p => upperFirst(p)).join('')
}

type State = UIToolInvocation<any>['state']

function getToolMessage(state: State, toolName: string, input: any) {
  const searchVerb = state === 'output-available' ? 'Searched' : 'Searching'
  const readVerb = state === 'output-available' ? 'Read' : 'Reading'

  return {
    list_components: `B24 UI ${searchVerb} components`,
    list_composables: `B24 UI ${searchVerb} composables`,
    get_component: `B24 UI ${readVerb} ${upperName(input.componentName)} component`,
    get_component_metadata: `B24 UI ${readVerb} metadata for component ${upperName(input.componentName)}`,
    list_templates: `B24 UI ${searchVerb} templates${input.category ? ` in ${input.category} category` : ''}`,
    get_template: `B24 UI ${readVerb} template ${upperName(input.templateName)}`,
    get_documentation_page: `B24 UI ${readVerb} ${input.path || ''} page`,
    list_documentation_pages: `B24 UI ${searchVerb} documentation pages`,
    list_getting_started_guides: `B24 UI ${searchVerb} documentation guides`,
    get_migration_guide: `B24 UI ${readVerb} migration guide${input.version ? ` for ${input.version}` : ''}`,
    list_examples: `B24 UI ${searchVerb} examples`,
    get_example: `B24 UI ${readVerb} ${upperName(input.exampleName)} example`,
    search_components_by_category: `B24 UI ${searchVerb} components${input.category ? ` in ${input.category} category` : ''}${input.search ? ` for "${input.search}"` : ''}`
  }[toolName] || `${searchVerb} ${toolName}`
}

const getCachedToolMessage = useMemoize((state: State, toolName: string, input: string) =>
  getToolMessage(state, toolName, JSON.parse(input))
)
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
          <B24Card
            class="edge-dark"
            :b24ui="{
              body: [
                'sm:pr-[6px]',
                'relative',
                'flex-1',
                'flex flex-col',
                'min-w-0',
                'h-[calc(100vh-var(--topbar-height)-200px)]',
                'bg-[url(/bg/pattern-1.png)]',
                'bg-cover bg-center bg-fixed bg-no-repeat',
                'bg-[#799fe1]/90'
              ].join(' ')
            }"
          >
            <div class="flex-1 overflow-y-auto p-1 flex flex-col justify-center items-center scrollbar-thin scrollbar-transparent">
              <div class="flex-1 flex flex-col gap-4 sm:gap-6 w-full mx-auto min-h-0">
                <B24ChatMessages
                  should-auto-scroll
                  :messages="chat.messages"
                  :status="chat.status"
                  :user="{ side: 'right', variant: 'message', icon: UserIcon }"
                  :assistant="{ icon: RobotIcon }"
                >
                  <template #content="{ message }">
                    <template v-for="(part, index) in message.parts" :key="`${message.id}-${part.type}-${index}${'state' in part ? `-${part.state}` : ''}`">
                      <MDCCached
                        v-if="part.type === 'text'"
                        :value="part.text"
                        :cache-key="`${message.id}-${index}`"
                        :components="components"
                        :parser-options="{ highlight: false }"
                        class="[&_.my-5]:my-2.5 *:first:!mt-0 *:last:!mb-0 [&_.leading-7]:!leading-6"
                      />

                      <p v-else-if="part.type === 'dynamic-tool'" class="text-muted text-sm leading-6 my-1.5">
                        {{ getCachedToolMessage(part.state, part.toolName, JSON.stringify(part.input || {})) }}
                      </p>
                    </template>
                  </template>
                </B24ChatMessages>
                <B24ChatPrompt
                  v-model="input"
                  variant="outline"
                  class="sticky bottom-0 light"
                  :error="chat.error"
                  :b24ui="{ trailing: 'items-center' }"
                  @submit="onSubmit"
                >
                  <B24ChatPromptSubmit :status="chat.status" @stop="chat.stop" @reload="chat.regenerate" />
                </B24ChatPrompt>
              </div>
            </div>
          </B24Card>
        </div>
      </div>
    </B24Card>

    <template #content-bottom>
      <Footer />
    </template>
  </B24SidebarLayout>
</template>
