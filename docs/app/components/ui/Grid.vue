<script setup lang="ts">
import type { InfoIconRow } from '#shared/types/base'
import IconView from '../icons/IconView.vue'

defineProps<{
  icons: InfoIconRow[]
}>()
</script>

<template>
  <div
    class="flex flex-row flex-wrap items-center justify-center gap-[24px] mb-[24px]"
  >
    <template v-for="icon in icons" :key="icon.code">
      <IconView :icon="icon" />
    </template>
  </div>
</template>
