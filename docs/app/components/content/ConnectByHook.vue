<script setup lang="ts">
const props = withDefaults(defineProps<{
  requiredRights?: string[]
}>(), {})

const emit = defineEmits<{
  (e: 'saveHook', payload: { hook: string }): void
}>()

const userInput = ref('')

const saveHook = () => {
  if (userInput.value.length > 0) {
    emit('saveHook', { hook: userInput.value })
  }
}

const clearHook = () => {
  userInput.value = ''
}

defineExpose({
  clearHook
})
</script>

<template>
  <ProseP>Insert URL here <ProseCode>WebHook</ProseCode> to try out the code examples in action.</ProseP>
  <B24FieldGroup class="mb-4 w-full lg:max-w-[500px]" size="sm">
    <B24Input
      v-model.trim="userInput"
      class="w-full"
      color="air-primary"
      highlight
      placeholder="https://some.bitrix24.com/rest/user_id/secret/"
      @keydown.enter="saveHook"
    />

    <B24Button
      label="Save"
      color="air-primary"
      :disabled="userInput.length < 10"
      @click="saveHook"
    />
  </B24FieldGroup>
  <ProseUl>
    <ProseLi>
      <ProseStrong>Secure storage:</ProseStrong> <ProseCode>WebHook</ProseCode> is saved only in your browser's Session Storage and is deleted after you close all documentation tabs.
    </ProseLi>
    <ProseLi>
      <ProseStrong>Access in examples:</ProseStrong> All examples will access your portal through the <ProseCode>B24Hook</ProseCode> object.
    </ProseLi>
    <ProseLi>
      <div class="my-4 flex flex-row flex-wrap gap-1 items-center justify-start">
        <ProseP small class="mb-0">Required rights:</ProseP>
        <ConnectRight
          v-for="right in props.requiredRights"
          :key="right"
          :right="right"
        />
      </div>
    </ProseLi>
  </ProseUl>
</template>
