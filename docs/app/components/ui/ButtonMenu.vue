<script setup lang="ts">
import type { DropdownMenuItem, ButtonProps } from '@bitrix24/b24ui-nuxt'
import { computed, useId } from 'vue'
import { useStorage } from '@vueuse/core'
import ChevronDownIcon from '@bitrix24/b24icons-vue/actions/ChevronDownIcon'

interface MenuButtonProps {
  options?: DropdownMenuItem[]
  callOptionOnClick?: boolean
  buttonColor?: ButtonProps['color']
  id?: string
}

const props = withDefaults(defineProps<MenuButtonProps>(), {
  callOptionOnClick: false,
  popoverPosition: 'bottom'
})

const emit = defineEmits(['click', 'optionClick'])

const id = `${props.id || useId()}`

const options = computed<DropdownMenuItem[]>(() => {
  if (props.options) {
    return props.options
  }

  return []
})

const selectedOption = useStorage(id, options.value.length > 0 ? options.value[0]!.label : '')
const selectionOptionAction = computed(() => {
  return options.value.find(option => option.label === selectedOption.value)?.action
})

const optionsAction = computed<DropdownMenuItem[]>(() => options.value.map((option) => {
  return {
    label: option.label,
    onSelect: () => {
      selectedOption.value = option.label
      option.action()
    }
  }
}))

function onClick(event: Event) {
  selectionOptionAction.value()
  emit('click', event)
}
</script>

<template>
  <B24FieldGroup>
    <B24Button :color="buttonColor" :label="selectedOption" @click.stop="onClick" />
    <B24DropdownMenu :items="optionsAction" :content="{ align: 'end', side: 'bottom', sideOffset: 8 }">
      <B24Button :color="buttonColor" :icon="ChevronDownIcon" />
    </B24DropdownMenu>
  </B24FieldGroup>
</template>
