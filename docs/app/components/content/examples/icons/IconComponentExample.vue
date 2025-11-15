<script setup>
import { B24Icon } from '@bitrix24/b24icons-vue'
</script>

<template>
  <B24PageColumns>
    <B24Card
      class="shadow-md"
      :b24ui="{ body: 'flex flex-row flex-nowrap items-center justify-center' }"
    >
      <template #header>
        <ProseP small class="mb-0">
          Button::TariffIcon
        </ProseP>
      </template>
      <B24Icon name="Button::TariffIcon" class="size-25 text-blue-500 dark:text-blue-900" />
    </B24Card>
    <B24Card
      class="shadow-md"
      :b24ui="{ body: 'flex flex-row flex-nowrap items-center justify-center' }"
    >
      <template #header>
        <ProseP small class="mb-0">
          Main::CopilotAiIcon
        </ProseP>
      </template>
      <B24Icon name="Main::CopilotAiIcon" class="size-25 text-blue-500 dark:text-blue-900" />
    </B24Card>
    <B24Card
      class="shadow-md"
      :b24ui="{ body: 'flex flex-row flex-nowrap items-center justify-center' }"
    >
      <template #header>
        <ProseP small class="mb-0">
          Main::AiIcon
        </ProseP>
      </template>
      <B24Icon name="Main::AiIcon" class="size-25 text-blue-500 dark:text-blue-900" />
    </B24Card>
  </B24PageColumns>
</template>
