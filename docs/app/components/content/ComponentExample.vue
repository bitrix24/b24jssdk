<script setup lang="ts">
import { camelCase } from 'scule'
import { hash } from 'ohash'
import { useElementSize } from '@vueuse/core'
import { get, set } from '#b24ui/utils'
import type { Result } from '@bitrix24/b24jssdk'
import CloudSyncIcon from '@bitrix24/b24icons-vue/outline/CloudSyncIcon'
import CloudErrorIcon from '@bitrix24/b24icons-vue/main/CloudErrorIcon'
import TerminalIcon from '@bitrix24/b24icons-vue/file-type/TerminalIcon'

const props = withDefaults(defineProps<{
  name: string
  class?: any
  /**
   * Whether to render the component in an iframe
   * @defaultValue false
   */
  iframe?: boolean | { [key: string]: any }
  /**
   * Whether to display the component in a mobile-sized iframe viewport
   * @defaultValue false
   */
  iframeMobile?: boolean
  props?: { [key: string]: any }
  /**
   * Whether to format the code with Prettier
   * @defaultValue false
   */
  prettier?: boolean
  /**
   * Whether to collapse the code block
   * @defaultValue false
   */
  collapse?: boolean
  /**
   * Whether to show the preview
   * When `false`, the filename will be shown instead
   * @defaultValue true
   */
  preview?: boolean
  /**
   * Whether to show the source code
   * @defaultValue true
   */
  source?: boolean
  /**
   * Show border
   * @defaultValue true
   */
  border?: boolean
  /**
   * A list of variable props to link to the component.
   */
  options?: Array<{
    alias?: string
    name: string
    label: string
    items?: any[]
    default: any
    multiple?: boolean
  }>
  /**
   * A list of line numbers to highlight in the code block
   */
  highlights?: number[]
  /**
   * Whether to add overflow-hidden to wrapper
   */
  overflowHidden?: boolean
  /**
   * Whether to add background-elevated to wrapper
   */
  elevated?: boolean
  lang?: string
}>(), {
  preview: true,
  source: true,
  border: true,
  lang: 'vue'
})

const slots = defineSlots<{
  options(props?: {}): any
  code(props?: {}): any
}>()

const el = ref<HTMLElement | null>(null)

const { $prettier } = useNuxtApp()
const { width } = useElementSize(el)
const config = useRuntimeConfig()
const toast = useToast()

const b24Instance = useB24()
const userInput = ref('')
const isLoading = ref(true)

const camelName = camelCase(props.name)

const data = await fetchComponentExample(camelName)

const componentProps = reactive({ ...(props.props || {}) })

const code = computed(() => {
  let code = ''

  if (props.collapse) {
    code += `::code-collapse
`
  }

  code += `\`\`\`${props.lang} ${props.preview ? '' : ` [${data.pascalName}.${props.lang}]`}${props.highlights?.length ? `{${props.highlights.join('-')}}` : ''}
${data?.code ?? ''}
\`\`\``

  if (props.collapse) {
    code += `
::`
  }

  code = b24Instance.prepareCode(code)

  return code
})

const { data: ast } = await useAsyncData(`component-example-${camelName}${hash({ props: componentProps, collapse: props.collapse })}`, async () => {
  if (!props.prettier) {
    return parseMarkdown(code.value)
  }

  let formatted = ''
  try {
    formatted = await $prettier.format(code.value, {
      trailingComma: 'none',
      semi: false,
      singleQuote: true,
      printWidth: 100
    })
  } catch {
    formatted = code.value
  }

  return parseMarkdown(formatted)
}, { watch: [code] })

const optionsValues = ref(props.options?.reduce((acc, option) => {
  if (option.name) {
    acc[option.alias || option.name] = option.default
  }
  if (option.name.toLowerCase().endsWith('color') && option.items?.length) {
    option.items = option.items.map((item: any) => ({
      label: item,
      value: item,
      chip: { color: item }
    }))
  }
  return acc
}, {} as Record<string, any>) || {})

const urlSearchParams = computed(() => {
  const params = {
    ...optionsValues.value,
    ...componentProps
  }

  if (!props.iframeMobile) {
    params.width = Math.round(width.value).toString()
  }

  return new URLSearchParams(params).toString()
})

onMounted(async () => {
  const result: Result = await b24Instance.init()
  if (!result.isSuccess) {
    toast.add({
      title: 'Error',
      description: result.getErrorMessages().join('\n'),
      color: 'air-primary-alert',
      icon: CloudErrorIcon
    })
  }
  isLoading.value = false
})

const saveHook = () => {
  if (
    !b24Instance.isHookFromEnv()
    && userInput.value.length > 0
  ) {
    // now init b24Hook
    const result: Result = b24Instance.set(userInput.value)
    if (!result.isSuccess) {
      toast.add({
        title: 'Error',
        description: result.getErrorMessages().join('\n'),
        color: 'air-primary-alert',
        icon: CloudErrorIcon
      })
    }

    userInput.value = ''
  }
}

const clearHook = async () => {
  if (!b24Instance.isHookFromEnv()) {
    // now reset b24Hook
    const result: Result = b24Instance.set(undefined)
    if (!result.isSuccess) {
      toast.add({
        title: 'Error',
        description: result.getErrorMessages().join('\n'),
        color: 'air-primary-alert',
        icon: CloudErrorIcon
      })
    }

    userInput.value = ''
  }
}
</script>

<template>
  <div ref="el" class="my-5">
    <template v-if="preview">
      <div
        class="relative"
        :class="[{
          'border-(--ui-color-design-tinted-na-stroke) border': props.border || !b24Instance.isInit(),
          'border-b-0 rounded-t-md': props.source,
          'rounded-md': !props.source,
          'overflow-hidden': props.overflowHidden
        }]"
      >
        <div
          v-if="props.options?.length || !!slots.options"
          class="flex gap-4 p-4 border-b border-(--ui-color-design-tinted-na-stroke)"
        >
          <slot name="options" />

          <B24FormField
            v-for="option in props.options"
            :key="option.name"
            :label="option.label"
            :name="option.name"
          >
            <B24SelectMenu
              v-if="option.items?.length"
              :model-value="get(optionsValues, option.name)"
              :items="option.items"
              :search-input="false"
              :value-key="option.name.toLowerCase().endsWith('color') ? 'value' : undefined"
              class="min-w-[175px]"
              :multiple="option.multiple"
              :class="[option.name.toLowerCase().endsWith('color') && 'pl-6']"
              :content="{ align: 'start', side: 'bottom', sideOffset: 8 }"
              @update:model-value="set(optionsValues, option.name, $event)"
            />
            <B24Input
              v-else
              :model-value="get(optionsValues, option.name)"
              :b24ui="{ base: 'min-w-[20px]' }"
              @update:model-value="set(optionsValues, option.name, $event)"
            />
          </B24FormField>
        </div>
        <div v-if="isLoading" class="p-8">
          <div class="space-y-4">
            <B24Skeleton class="h-4 w-full" />
            <B24Skeleton class="h-4 w-full" />
            <B24Skeleton class="h-4 w-full" />
            <B24Skeleton class="h-4 w-3/4" />
          </div>
        </div>
        <template v-else>
          <template v-if="!b24Instance.isInit()">
            <div
              class="flex justify-center p-[16px] bg-grid-example [mask-image:linear-gradient(0deg,rgba(255,255,255,0.09),rgba(255,255,255,0.18))"
            >
              <B24Alert
                title="Connection to Bitrix24 not established"
                description="Specify an access hook or open the documentation through the app"
                color="air-secondary-accent-2"
                :icon="CloudSyncIcon"
              >
                <template #actions>
                  <B24FieldGroup class="mt-4 w-full lg:max-w-[500px]">
                    <B24Input
                      v-model.trim="userInput"
                      class="w-full"
                      color="air-primary"
                      highlight
                      placeholder="https://some.bitrix24.com/rest/user_id/secret/"
                      @keydown.enter="saveHook"
                    />

                    <B24Button
                      label="Save"
                      color="air-primary"
                      :disabled="userInput.length < 10"
                      @click="saveHook"
                    />
                  </B24FieldGroup>
                </template>
              </B24Alert>
            </div>
          </template>
          <template v-else>
            <B24Badge
              class="z-[2] absolute -top-[11px] right-[11px]"
              size="sm"
              :use-close="!b24Instance.isHookFromEnv() && !b24Instance.isFrame()"
              color="air-selection"
              :on-close-click="clearHook"
            >
              {{ b24Instance.targetOrigin() }}
            </B24Badge>
            <iframe
              v-if="iframe"
              v-bind="typeof iframe === 'object' ? iframe : {}"
              :src="`${config.public.baseUrl}/examples/${name}/?${urlSearchParams}`"
              class="relative w-full"
              :class="[props.class, { 'dark:bg-gray-950/50 rounded-t-md': props.elevated }, !iframeMobile && 'max-w-[1300px]']"
            />
            <div v-else-if="props.lang === 'ts'">
              <B24Alert
                :icon="TerminalIcon"
                color="air-secondary-accent"
                title="Result"
                description="The result of the script execution can be seen in the developer console."
                class="rounded-b-none"
                orientation="horizontal"
              >
                <template #actions>
                  <B24Kbd value="ctrl" size="sm" />
                  <B24Kbd value="shift" size="sm" />
                  <B24Kbd value="i" size="sm" />
                </template>
              </B24Alert>
              <ClientOnly>
                <component :is="camelName || 'div'" v-bind="{ ...componentProps, ...optionsValues }" />
              </ClientOnly>
            </div>
            <div
              v-else
              class="flex justify-center p-[16px] bg-grid-example [mask-image:linear-gradient(0deg,rgba(255,255,255,0.09),rgba(255,255,255,0.18))"
              :class="[props.class, { 'dark:bg-gray-950/50 rounded-t-md': props.elevated }]"
            >
              <ClientOnly>
                <component :is="camelName" v-bind="{ ...componentProps, ...optionsValues }" />
              </ClientOnly>
            </div>
          </template>
        </template>
      </div>
    </template>

    <template v-if="props.source">
      <div v-if="!!slots.code" class="[&_pre]:!rounded-t-none [&_div.my-5]:!mt-0 scrollbar-transparent">
        <slot name="code" />
      </div>
      <template v-else-if="ast">
        <ClientOnly>
          <MDCRenderer
            :body="ast.body"
            :data="ast.data"
            class="[&_pre]:!rounded-t-none [&_div.my-5]:!mt-0 scrollbar-transparent"
          />
          <template #fallback>
            <div class="[&_pre]:!rounded-t-none [&_div.my-5]:!mt-0 scrollbar-transparent">
              <ProsePre class="text-(length:--ui-font-size-xs)">{{ { wait: 'Loading client-side content...' } }}</ProsePre>
            </div>
          </template>
        </ClientOnly>
      </template>
    </template>
  </div>
</template>
