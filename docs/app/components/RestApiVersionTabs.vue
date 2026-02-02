<script setup lang="ts">
const { restApiVersion, restApiVersions } = useRestApiVersions()
const { track } = useAnalytics()

const value = ref<string | undefined>(undefined)

onMounted(() => {
  value.value = restApiVersion.value
})
watch(restApiVersion, () => {
  value.value = restApiVersion.value
})

function onRestApiVersionChange(newRestApiVersion: string) {
  restApiVersion.value = newRestApiVersion
  track('RestApiVersion Tab Switched', { restapiVersion: newRestApiVersion })
}
</script>

<template>
  <div class="ps-[20px] pe-xs rtl:ps-xs rtl:pe-[20px] pb-[12px] flex flex-row flex-nowrap items-center justify-start gap-[6px]">
    <B24RadioGroup
      v-model="restApiVersion"
      :items="restApiVersions"
      orientation="horizontal"
      color="air-primary-copilot"
      variant="table"
      indicator="hidden"
      size="xs"
      @update:model-value="onRestApiVersionChange($event as string)"
    />
  </div>
</template>
