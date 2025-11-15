<script setup lang="ts">
import AttentionIIcon from '@bitrix24/b24icons-vue/main/AttentionIIcon'

defineProps<{
  searchQuery: string
}>()

defineEmits(['clear'])
</script>

<template>
  <B24Empty
    :icon="AttentionIIcon"
    :title="`No icons found ford ${searchQuery}`"
    description="Clear your search and try again"
    size="xl"
    :actions="[
      {
        label: 'Clear',
        color: 'air-primary',
        onClick() {
          $emit('clear')
        }
      }
    ]"
  />
</template>
