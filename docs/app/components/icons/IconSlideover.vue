<script setup lang="ts">
import type { InfoIconRow } from '#shared/types/base'
import { useColorMode } from '#imports'
import { B24Icon } from '@bitrix24/b24icons-vue'
import CopyButton from './CopyButton.vue'

defineProps<{
  icon: InfoIconRow
}>()

const emit = defineEmits<{ close: [boolean] }>()

function toUpperFirstChar(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const colorMode = useColorMode()
const isDark = computed(() => {
  return colorMode.value === 'dark'
})
const isMounted = ref(false)
const cardColorContext = computed(() => {
  const b24ui = {
    wrapper: 'overflow-hidden max-w-[250px] sm:max-w-[400px] md:max-w-[100%]',
    title: 'text-pretty  line-clamp-2 wrap-break-word', // truncate line-clamp-2
    sidebarLayoutRoot: '',
    content: 'sm:max-w-[970px] lg:top-[368px] lg:max-h-[calc(100%-368px)]',
    body: ''
  }
  if (import.meta.server || !isMounted.value) {
    b24ui.sidebarLayoutRoot = 'edge-dark' // light | edge-dark
    b24ui.body = 'light'
    return b24ui
  }

  b24ui.sidebarLayoutRoot = isDark.value ? 'dark' : 'edge-dark' // light | edge-dark
  b24ui.body = isDark.value ? 'dark' : 'light'
  return b24ui
})

onMounted(() => {
  isMounted.value = true
})
</script>

<template>
  <B24Slideover
    :close="{ onClick: () => emit('close', false) }"
    :title="toUpperFirstChar(icon.code)"
    :description="[icon.data.category, ...(icon.data?.subCategories || [])].join(' • ')"
    :use-light-content="false"
    :b24ui="cardColorContext"
  >
    <template #body>
      <B24Card
        :b24ui="{
          body: 'lex-1 flex flex-col sm:flex-row items-start justify-start gap-6'
        }"
      >
        <B24Card
          variant="tinted-no-accent"
          :b24ui="{
            body: 'p-0 lg:px-0 lg:py-0 size-full sm:size-[200px] flex flex-col items-center justify-center gap-y-1'
          }"
        >
          <div :id="icon.code.replace('::', '_')">
            <B24Icon
              :name="icon.code"
              class="size-[100px]"
              :class="[
                icon.specialized?.animateSpin ? 'animate-spin-slow' : '',
                icon.specialized?.animateSpinNormal ? 'animate-spin' : '',
                icon.specialized?.stroke === 'stroke-bold' ? 'stroke-[6px]' : '',
                icon.specialized?.stroke === 'stroke-normal' ? 'stroke-2' : '',
                icon.specialized?.stroke === 'stroke-thin' ? 'stroke-1' : '',

                icon.specialized?.width === 'w-lg' ? 'w-lg' : '',
                icon.specialized?.height === 'h-lg' ? 'h-lg' : '',

                icon.specialized?.width === 'w-[21px]' ? 'w-[21px]' : '',
                icon.specialized?.height === 'h-[21px]' ? 'h-[21px]' : ''
              ]"
            />
          </div>
        </B24Card>
        <div>
          <CopyButton :icon="icon" />
        </div>
      </B24Card>
    </template>

    <!-- template #footer>
      <div class="flex gap-2">
        <B24Button
          label="Close"
          color="air-tertiary"
          @click="emit('close', false)"
        />
      </div>
    </template -->
  </B24Slideover>
</template>
