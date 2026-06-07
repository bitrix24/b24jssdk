<script setup lang="ts">
import type { TabsItem } from '@bitrix24/b24ui-nuxt'
import type { Result } from '@bitrix24/b24jssdk'
import { hash } from 'ohash'
import ConnectByHook from './ConnectByHook.vue'
import CloudSyncIcon from '@bitrix24/b24icons-vue/outline/CloudSyncIcon'
import CloudErrorIcon from '@bitrix24/b24icons-vue/main/CloudErrorIcon'
import TerminalIcon from '@bitrix24/b24icons-vue/file-type/TerminalIcon'

const props = withDefaults(defineProps<{
  name: string
  class?: any
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
   * Run examples only in the Bitrix24 frame
   * When `true`, a button to run the code is displayed in the frame;
   *     otherwise, we won't show anything, since it's not possible to run the code from Git Page.
   * @defaultValue false
   */
  b24FrameOnly?: boolean
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
  /**
   * Override the filename used for the code block
   */
  filename?: string
}>(), {
  preview: true,
  b24FrameOnly: false,
  source: true,
  border: true,
  lang: 'ts'
})

const slots = defineSlots<{
  options(props?: {}): any
  code(props?: {}): any
}>()

const config = useRuntimeConfig()

const el = ref<HTMLElement | null>(null)
const wrapperContainer = ref<HTMLElement | null>(null)

const { prepareTitle, isHasAction, runAction } = await useCodeExample()

const { $prettier } = useNuxtApp()
const toast = useToast()

const b24Instance = useB24()
const isLoading = ref(true)

const camelName = prepareTitle(props.name)
const data = await fetchCodeExample(props.name)

const isCanShowAction = computed<boolean>(() => {
  if (!props.preview) {
    return false
  }

  if (!isHasAction(camelName)) {
    return false
  }

  if (!b24Instance.isInit()) {
    if (props.b24FrameOnly) {
      return false
    }
  }

  return true
})

const code = computed(() => {
  let code = ''

  if (props.collapse) {
    code += `::code-collapse
`
  }

  const preparedCode = b24Instance.prepareCode(data?.content ?? '')
  code += `\`\`\`${props.lang} ${isCanShowAction.value ? '' : ` [${props.filename ?? data.name}.${props.lang}]`}${props.highlights?.length ? `{${props.highlights.join('-')}}` : ''}
${preparedCode}
\`\`\``

  if (props.collapse) {
    code += `
::`
  }

  return code
})

const { data: ast } = await useAsyncData(`code-example-${camelName}${hash({ collapse: props.collapse })}`, async () => {
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

const makeAction = async () => {
  return runAction(camelName)
}

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

const saveHook = (data: { hook: string }) => {
  if (
    !b24Instance.isHookFromEnv()
    && data.hook.length > 0
  ) {
    // now init b24Hook
    const result: Result = b24Instance.set(data.hook)
    if (!result.isSuccess) {
      toast.add({
        title: 'Error',
        description: result.getErrorMessages().join('\n'),
        color: 'air-primary-alert',
        icon: CloudErrorIcon
      })
    }

    connectByHookRef.value?.clearHook()
  }
}

const connectByHookRef = ref<InstanceType<typeof ConnectByHook> | null>(null)

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

    connectByHookRef.value?.clearHook()
  }
}

const tabs = computed<TabsItem[]>(() => {
  const items: TabsItem[] = [
    { label: 'B24Hook', slot: 'B24Hook' }
  ]

  if (config.public.useTabB24frame) {
    items.unshift({ label: 'B24Frame', slot: 'B24Frame' })
  }

  return items
})
</script>

<template>
  <div ref="el" class="my-5">
    <template v-if="isCanShowAction">
      <div
        ref="wrapperContainer"
        class="relative group/component"
      >
        <div
          class="relative z-[1]"
          :class="[{
            'border-(--ui-color-design-tinted-na-stroke) border': props.border || !b24Instance.isInit(),
            'border-b-0 rounded-t-md': props.source,
            'rounded-md': !props.source,
            'overflow-hidden': props.overflowHidden
          }]"
        >
          <ConnectLoader v-if="isLoading" />
          <template v-else>
            <template v-if="!b24Instance.isInit()">
              <B24Alert
                title="Want to test the example?"
                color="air-secondary-accent-2"
                :icon="CloudSyncIcon"
                :class="[{
                  'border-b-0 rounded-t-md rounded-b-none': props.source,
                  'rounded-md': !props.source,
                  'overflow-hidden': props.overflowHidden
                }]"
              >
                <template #description>
                  <B24Tabs size="sm" :items="tabs" class="w-full mb-4">
                    <template #B24Hook>
                      <ConnectByHook
                        ref="connectByHookRef"
                        :required-rights="b24Instance.getRequiredRights()"
                        @save-hook="saveHook"
                      />
                    </template>
                    <template #B24Frame>
                      <ConnectByFrame
                        :required-rights="b24Instance.getRequiredRights()"
                      />
                    </template>
                  </B24Tabs>
                </template>
              </B24Alert>
            </template>
            <template v-else>
              <B24Badge
                class="z-[2] absolute -top-[11px] right-[11px]"
                size="sm"
                :use-close="!b24Instance.isHookFromEnv() && !b24Instance.isFrame()"
                color="air-selection"
                :label="b24Instance.targetOrigin()"
                :on-close-click="clearHook"
              />
              <div v-if="props.lang === 'ts'">
                <B24Alert
                  :icon="TerminalIcon"
                  color="air-secondary-accent"
                  :title="`${props.filename ?? data.name}.${props.lang}`"
                  description="The result of the script execution can be seen in the developer console."
                  class="border-none rounded-b-none"
                  orientation="horizontal"
                  :actions="[
                    {
                      label: 'Run Action',
                      loadingAuto: true,
                      color: 'air-boost',
                      onClick: makeAction
                    }
                  ]"
                />
              </div>
            </template>
          </template>
        </div>
      </div>
    </template>
    <template v-if="props.source">
      <div v-if="!!slots.code" class="[&_pre]:!rounded-t-none [&_div.my-5]:!mt-0 scrollbar-transparent">
        <slot name="code" />
      </div>
      <MDCRenderer
        v-else-if="ast"
        :body="ast.body"
        :data="ast.data"
        class="[&_pre]:!rounded-t-none [&_div.my-5]:!mt-0 scrollbar-transparent"
      />
    </template>
  </div>
</template>
