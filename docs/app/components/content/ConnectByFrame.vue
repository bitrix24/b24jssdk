<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import CopyIcon from '@bitrix24/b24icons-vue/outline/CopyIcon'
import CircleCheckIcon from '@bitrix24/b24icons-vue/outline/CircleCheckIcon'

const props = withDefaults(defineProps<{
  requiredRights?: string[]
}>(), {})

const config = useRuntimeConfig()

const docsUrl = ref(`${config.public.siteUrl}${config.public.baseUrl}/`)
const { copy, copied } = useClipboard()
</script>

<template>
  <ProseP>Add the documentation site as an application in Bitrix24.</ProseP>
  <ProseP>1. Create an application.</ProseP>
  <ProseUl>
    <ProseLi>
      Use the
      <B24Link is-action target="_blank" to="https://apidocs.bitrix24.com/local-integrations/serverside-local-app-with-ui.html">
        developer section.
      </B24Link> to create an embedded application.
    </ProseLi>
    <ProseLi>
      In the <ProseCode>Your handler path*</ProseCode> field, specify: <B24Input
        v-model="docsUrl"
        highlight
        size="sm"
        disabled
        class="mt-2 lg:mt-0 w-full lg:max-w-[270px]"
        :b24ui="{ base: 'disabled:opacity-90', trailing: 'pr-0.5' }"
      >
        <template v-if="docsUrl?.length" #trailing>
          <B24Tooltip text="Copy to clipboard" :content="{ side: 'top' }">
            <B24Button
              :b24ui="{ leadingIcon: [copied ? 'text-(--ui-color-accent-main-success)' : 'text-(--ui-btn-color)'] }"
              size="sm"
              color="air-tertiary-no-accent"
              :icon="copied ? CircleCheckIcon : CopyIcon"
              aria-label="Copy to clipboard"
              @click="copy(docsUrl)"
            />
          </B24Tooltip>
        </template>
      </B24Input>
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
  <ProseP>2. Open the application.</ProseP>
  <ProseUl>
    <ProseLi>Run the added application directly from your Bitrix24 menu.</ProseLi>
    <ProseLi>The application will open in embedded mode.</ProseLi>
    <ProseLi>
      All code samples on the page will automatically gain secure access to your portal's API via the
      <B24Link to="/docs/working-with-the-rest-api/frame/">
        <ProseCode>B24Frame</ProseCode>
      </B24Link> object.
    </ProseLi>
  </ProseUl>
</template>
