<script setup lang="ts">
import { hash } from 'ohash'
import type { Result } from '@bitrix24/b24jssdk'
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

const el = ref<HTMLElement | null>(null)
const wrapperContainer = ref<HTMLElement | null>(null)

const { prepareTitle, isHasAction, runAction } = await useCodeExample()

const { $prettier } = useNuxtApp()
const toast = useToast()

const b24Instance = useB24()
const userInput = ref('')
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
          <div v-if="isLoading" class="p-8">
            <div class="space-y-4">
              <B24Skeleton class="h-4 w-full" />
              <B24Skeleton class="h-4 w-full" />
              <B24Skeleton class="h-4 w-3/4" />
            </div>
          </div>
          <template v-else>
            <template v-if="!b24Instance.isInit()">
              <div
                class="flex justify-center p-[8px] bg-grid-example [mask-image:linear-gradient(0deg,rgba(255,255,255,0.09),rgba(255,255,255,0.18))"
              >
                <B24Alert
                  size="sm"
                  title="Want to test the example?"
                  color="air-secondary-accent-2"
                  :icon="CloudSyncIcon"
                >
                  <template #description>
                    <div class="my-4 flex flex-row flex-wrap gap-1 items-center justify-start">
                      <ProseP small class="mb-0">Required rights:</ProseP>
                      <B24Badge size="sm" color="air-secondary-accent-2" label="user_brief" />
                      <B24Badge size="sm" color="air-secondary-accent-2" label="crm" />
                      <B24Badge size="sm" color="air-secondary-accent-2" label="tasks" />
                      <B24Badge size="sm" color="air-secondary-accent-2" label="entity" />
                    </div>

                    <B24Tabs size="sm" :items="[{ label: 'B24Hook', slot: 'B24Hook' as const }]" class="w-full mb-4">
                      <template #B24Hook>
                        <ProseP>Insert URL here <ProseCode>WebHook</ProseCode> to try out the code examples in action.</ProseP>
                        <B24FieldGroup class="mb-4 w-full lg:max-w-[500px]">
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
                        <ProseUl>
                          <ProseLi>
                            <ProseStrong>Secure storage:</ProseStrong> <ProseCode>WebHook</ProseCode> is saved only in your browser's Session Storage and is deleted after you close all documentation tabs.
                          </ProseLi>
                          <ProseLi>
                            <ProseStrong>Access in examples:</ProseStrong> All examples will access your portal through the <ProseCode>B24Hook</ProseCode> object.
                          </ProseLi>
                        </ProseUl>
                      </template>
                    </B24Tabs>
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
              <div v-if="props.lang === 'ts'">
                <B24Alert
                  :icon="TerminalIcon"
                  color="air-secondary-accent"
                  :title="`${props.filename ?? data.name}.${props.lang}`"
                  description="The result of the script execution can be seen in the developer console."
                  class="rounded-b-none"
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
