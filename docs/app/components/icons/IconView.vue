<script setup lang="ts">
import type { InfoIconRow } from '#shared/types/base'
import { B24Icon } from '@bitrix24/b24icons-vue'
import IconSlideover from './IconSlideover.vue'

const props = defineProps<{
  icon: InfoIconRow
}>()

const overlay = useOverlay()
const slideOver = overlay.create(IconSlideover, {})

function openSlideOver() {
  slideOver.open({
    icon: props.icon
  })
}
</script>

<template>
  <div class="flex flex-col items-start justify-start">
    <B24PageCard
      class="group/block w-[220px] mx-auto cursor-pointer border-1 "
      :description="icon.name"
      reverse
      :b24ui="{
        description: 'h-10 line-clamp-2',
        container: 'pb-0 sm:pb-0'
      }"
      @click="openSlideOver"
    >
      <div class="mx-auto w-[172px] h-[120px] flex items-center justify-center">
        <KeepAlive>
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
        </KeepAlive>
      </div>
    </B24PageCard>
  </div>
</template>
