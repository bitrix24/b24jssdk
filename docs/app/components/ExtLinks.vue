<script setup lang="ts">
const menuList = [
  {
    label: 'b24ui',
    to: 'https://bitrix24.github.io/b24ui/',
    target: '_blank'
  },
  {
    label: 'b24jssdk',
    to: 'https://bitrix24.github.io/b24jssdk/',
    target: '_blank'
  }
]
</script>

<template>
  <B24PageLinks :links="menuList" class="mb-[12px]" />
</template>
