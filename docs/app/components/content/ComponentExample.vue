<script setup lang="ts">
import { camelCase } from 'scule'
import { hash } from 'ohash'
import { useElementSize } from '@vueuse/core'
import { get, set } from '#b24ui/utils'
import { B24Hook, LoggerBrowser } from '@bitrix24/b24jssdk'
import type { B24Frame, B24FrameQueryParams } from '@bitrix24/b24jssdk'
import CloudSyncIcon from '@bitrix24/b24icons-vue/outline/CloudSyncIcon'

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
}>(), {
  preview: true,
  source: true,
  border: true
})

const slots = defineSlots<{
  options(props?: {}): any
  code(props?: {}): any
}>()

const el = ref<HTMLElement | null>(null)

const { $prettier } = useNuxtApp()
const { width } = useElementSize(el)
const config = useRuntimeConfig()

const camelName = camelCase(props.name)

const data = await fetchComponentExample(camelName)

const componentProps = reactive({ ...(props.props || {}) })

const code = computed(() => {
  let code = ''

  if (props.collapse) {
    code += `::code-collapse
`
  }

  code += `\`\`\`vue ${props.preview ? '' : ` [${data.pascalName}.vue]`}${props.highlights?.length ? `{${props.highlights.join('-')}}` : ''}
${data?.code ?? ''}
\`\`\``

  if (props.collapse) {
    code += `
::`
  }

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

let $b24: B24Frame | B24Hook | undefined = undefined
const $b24Type = ref<'undefined' | 'B24Frame' | 'B24Hook'>('undefined')

const b24Hook = ref<string>('')
const userInput = ref<string>('')

onMounted(async () => {
  // region Init B24
  try {
    const queryParams: B24FrameQueryParams = {
      DOMAIN: null,
      PROTOCOL: false,
      APP_SID: null,
      LANG: null
    }

    if (window.name) {
      const [domain, appSid] = window.name.split('|')
      queryParams.DOMAIN = domain
      queryParams.APP_SID = appSid
    }

    if (!queryParams.DOMAIN || !queryParams.APP_SID) {
      throw new Error('Unable to initialize Bitrix24Frame library!')
    }

    const { $initializeB24Frame } = useNuxtApp()
    $b24 = await $initializeB24Frame()
    $b24Type.value = 'B24Frame'

    provideB24()
  } catch {
    $b24 = undefined
    $b24Type.value = 'undefined'
  }

  if (typeof $b24 === 'undefined') {
    // Check the env variable
    if (config.public?.b24Hook) {
      b24Hook.value = config.public.b24Hook
      sessionStorage.setItem('b24Hook', b24Hook.value)
    }

    // Checking sessionStorage when loading a component
    const storedHook = sessionStorage.getItem('b24Hook')
    if (storedHook) {
      b24Hook.value = storedHook
      initB24Hook()
    }
  }
})

const saveHook = () => {
  if (userInput.value.trim()) {
    b24Hook.value = userInput.value.trim()
    sessionStorage.setItem('b24Hook', b24Hook.value)
    userInput.value = ''

    initB24Hook()
  }
}

const clearHook = async () => {
  userInput.value = ''
  b24Hook.value = ''
  sessionStorage.setItem('b24Hook', b24Hook.value)
  $b24Type.value = 'undefined'

  provideB24()
}

function initB24Hook() {
  if (
    typeof $b24 === 'undefined'
    && b24Hook.value.length > 0
  ) {
    $b24 = B24Hook.fromWebhookUrl(b24Hook.value)
    $b24Type.value = 'B24Hook'

    provideB24()
  }
}

const b24TargetOrigin = computed(() => {
  return $b24?.getTargetOrigin() || '?'
})

function provideB24() {
  provide('propsWithB24', {
    logger: LoggerBrowser.build(`JsSdk Docs use ${$b24Type.value}`, true),
    b24: $b24
  })
}

// if (typeof $b24 === 'undefined') {
//   $b24 = undefined
//   $b24Type.value = 'undefined'
//   const appError = createError({
//     statusCode: 404,
//     statusMessage: 'B24 not init',
//     data: {
//       description: 'Problem in middleware',
//       homePageIsHide: true,
//       isShowClearError: false
//     },
//     fatal: true
//   })
//
//   showError(appError)
// }
</script>

<template>
  <div ref="el" class="my-5">
    <template v-if="preview">
      <div
        class="relative"
        :class="[{
          'border-(--ui-color-design-tinted-na-stroke) border': props.border || $b24Type === 'undefined',
          'border-b-0 rounded-t-md': props.source,
          'rounded-md': !props.source,
          'overflow-hidden': props.overflowHidden
        }]"
      >
        <B24Badge
          v-if="$b24Type !== 'undefined'"
          class="z-[2] absolute -top-[11px] right-[11px]"
          size="sm"
          use-close
          color="air-tertiary"
          :on-close-click="clearHook"
        >
          {{ b24TargetOrigin }}
        </B24Badge>
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
        <template v-if="$b24Type === 'undefined'">
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
                    v-model="userInput"
                    class="w-full"
                    color="air-primary"
                    highlight
                    placeholder="https://some.bitrix24.com/rest/user_id/secret/"
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
          <iframe
            v-if="iframe"
            v-bind="typeof iframe === 'object' ? iframe : {}"
            :src="`${config.public.baseUrl}/examples/${name}/?${urlSearchParams}`"
            class="relative w-full"
            :class="[props.class, !iframeMobile && 'max-w-[1300px]']"
          />
          <div
            v-else
            class="flex justify-center p-[16px] bg-grid-example [mask-image:linear-gradient(0deg,rgba(255,255,255,0.09),rgba(255,255,255,0.18))"
            :class="props.class"
          >
            <ClientOnly>
              <component :is="camelName" v-bind="{ ...componentProps, ...optionsValues }" />
            </ClientOnly>
          </div>
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
