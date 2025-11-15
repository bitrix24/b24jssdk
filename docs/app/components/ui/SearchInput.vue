<script setup lang="ts">
import { computed } from 'vue'
import Search2Icon from '@bitrix24/b24icons-vue/main/Search2Icon'

defineOptions({
  inheritAttrs: false
})

interface Props {
  modelValue: string
}

const props = defineProps<Props>()
const emit = defineEmits(['update:modelValue'])

const value = computed({
  get: () => props.modelValue,
  set: (val: string) => emit('update:modelValue', val)
})
</script>

<template>
  <B24Input
    v-model="value"
    class="w-full"
    v-bind="$attrs"
    :icon="Search2Icon"
    placeholder="Search icons..."
    name="searchInput"
    size="lg"
    highlight
    @keyup.esc="value = ''"
  >
    <template #trailing>
      <div class="flex flex-row items-center justify-between gap-[2px] pe-[5px]">
        <B24Kbd
          v-if="value.length > 0"
          value="esc"
          class="cursor-pointer"
          @click.stop="value = ''"
        />
      </div>
    </template>
  </B24Input>
</template>
