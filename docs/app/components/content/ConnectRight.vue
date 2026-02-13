<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import CopyIcon from '@bitrix24/b24icons-vue/outline/CopyIcon'
import CircleCheckIcon from '@bitrix24/b24icons-vue/outline/CircleCheckIcon'

const props = withDefaults(defineProps<{
  right: string
}>(), {})

const { copy, copied } = useClipboard()
</script>

<template>
  <B24Badge
    size="sm"
    color="air-secondary-accent-2"
    :label="props.right"
  >
    <template #trailing>
      <B24Tooltip text="Copy to clipboard" :content="{ side: 'top' }">
        <B24Button
          :b24ui="{
            base: 'size-[14px]',
            baseLine: 'p-0 size-[14px]',
            leadingIcon: [copied ? 'text-(--ui-color-accent-main-success)' : 'text-(--ui-btn-color)']
          }"
          size="xs"
          color="air-tertiary-no-accent"
          :icon="copied ? CircleCheckIcon : CopyIcon"
          aria-label="Copy to clipboard"
          @click="copy(props.right)"
        />
      </B24Tooltip>
    </template>
  </B24Badge>
</template>
