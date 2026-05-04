<script setup lang="ts">
const menuList = [
  {
    label: 'b24ui',
    to: 'https://bitrix24.github.io/b24ui/',
    target: '_blank'
  },
  {
    label: 'b24icons',
    to: 'https://bitrix24.github.io/b24icons/',
    target: '_blank'
  }
]
</script>

<template>
  <B24PageLinks :links="menuList" class="mb-[12px]" />
</template>
