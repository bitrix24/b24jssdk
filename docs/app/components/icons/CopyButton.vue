<script setup lang="ts">
import type { InfoIconRow } from '#shared/types/base'
import { computed, ref } from 'vue'
import ButtonMenu from '../ui/ButtonMenu.vue'
import getIcon from '../../utils/getIcon'

const props = defineProps<{
  icon: InfoIconRow
}>()

const isActionComplete = ref(false)

const componentName = computed(() => {
  return props.icon.code
})

function toUpperFirstChar(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// region Action ////
function success() {
  isActionComplete.value = true
  window.setTimeout(() => {
    isActionComplete.value = false
  }, 1_000)
}

function getIconFullName(): string {
  return `#type#::#icon#`
    .replace('#icon#', props.icon.icon)
    .replace('#type#', toUpperFirstChar(props.icon.type))
}

function copyComponentName() {
  const code = getIconFullName()

  navigator.clipboard.writeText(code)

  success()
}

function prepareBySpecializedClassNameList(): string[] {
  const className = []

  if (props.icon?.specialized?.animateSpin) {
    className.push('animate-spin-slow')
  }

  if (props.icon?.specialized?.animateSpinNormal) {
    className.push('animate-spin')
  }

  if (props.icon?.specialized?.stroke === 'stroke-bold') {
    className.push('stroke-[6px]')
  } else if (props.icon?.specialized?.stroke === 'stroke-normal') {
    className.push('stroke-2')
  } else if (props.icon?.specialized?.stroke === 'stroke-thin') {
    className.push('stroke-1')
  }

  if (props.icon?.specialized?.width === 'w-lg') {
    className.push('w-lg')
  } else if (props.icon?.specialized?.width === 'w-[21px]') {
    className.push('w-[21px]')
  } else {
    className.push('w-3')
  }

  if (props.icon?.specialized?.height === 'h-lg') {
    className.push('h-lg')
  } else if (props.icon?.specialized?.height === 'h-[21px]') {
    className.push('h-[21px]')
  } else {
    className.push('h-3')
  }

  return className
}

function copyVue() {
  const attrs = ['']
  attrs.push(`class="${prepareBySpecializedClassNameList().join(' ')}"`)

  const code = [
    `import #icon# from '@bitrix24/b24icons-vue/#type#/#icon#'`,
    ``,
    `<#icon#${attrs.join(' ')} />`
  ].join('\n')
    .replace('#icon#', props.icon.icon)
    .replace('#icon#', props.icon.icon)
    .replace('#icon#', props.icon.icon)
    .replace('#type#', props.icon.type)

  navigator.clipboard.writeText(code)

  success()
}

function copyVueB24Icon() {
  const attrs = ['']

  attrs.push(`name="${getIconFullName()}"`)
  attrs.push(`class="${prepareBySpecializedClassNameList().join(' ')}"`)

  const code = [
    `import { B24Icon } from '@bitrix24/b24icons-vue'`,
    ``,
    `<B24Icon${attrs.join(' ')} />`
  ].join('\n')

  navigator.clipboard.writeText(code)

  success()
}

function copySVG() {
  const svgString = getIcon(componentName.value)

  navigator.clipboard.writeText(svgString || '?')

  success()
}

function copyDataUrl() {
  const svgString = getIcon(componentName.value)

  // Create SVG data url
  const dataUrl = `data:image/svg+xml;base64,${btoa(svgString || '?')}`
  navigator.clipboard.writeText(dataUrl)

  success()
}

// endregion ////

const options = ref([
  { label: 'Copy via Vue Component', action: copyVue },
  { label: 'Copy via Vue B24Icon', action: copyVueB24Icon },
  { label: 'Copy Name', action: copyComponentName },
  { label: 'Copy SVG', action: copySVG },
  { label: 'Copy Data URL', action: copyDataUrl }
])
</script>

<template>
  <ButtonMenu
    id="action-button"
    :button-color="isActionComplete ? 'air-primary-success' : 'air-secondary-accent-2'"
    call-option-on-click
    :options="options"
  />
</template>
