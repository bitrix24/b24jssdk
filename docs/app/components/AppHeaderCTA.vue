<script setup lang="ts">
/**
 * @see https://github.com/nuxt-modules/mcp-toolkit/blob/main/apps/docs/app/components/AppHeaderCTA.vue
 */
const route = useRoute()
</script>

<template>
  <div class="hidden lg:block">
    <AiChat v-if="route.path !== '/'" />
  </div>
</template>
