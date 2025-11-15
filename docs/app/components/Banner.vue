<script setup lang="ts">
import EnterpriseIcon from '@bitrix24/b24icons-vue/solid/EnterpriseIcon'
</script>

<template>
  <B24Banner
    id="new-icons-banner-v2"
    title="New solid icons!"
    to="/icons/?search=solid"
    :icon="EnterpriseIcon"
    close
    color="air-primary-copilot"
    class="light"
  />
</template>
