<script setup>
import Bitrix24Icon from '@bitrix24/b24icons-vue/common-service/Bitrix24Icon'
</script>

<template>
  <B24Card
    class="shadow-md"
    :b24ui="{ body: 'flex flex-row flex-nowrap items-center justify-center' }"
  >
    <template #header>
      <ProseP small class="mb-0">
        Common-service::Bitrix24Icon
      </ProseP>
    </template>
    <Bitrix24Icon class="size-25 text-blue-500 dark:text-blue-900" />
  </B24Card>
</template>
