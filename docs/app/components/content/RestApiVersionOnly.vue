<script setup lang="ts">
import { Slot } from 'reka-ui'
</script>

<template>
  <Slot class="rest-api-ver2-only">
    <slot name="rest-api-ver2" />
  </Slot>
  <Slot class="rest-api-ver3-only">
    <slot name="rest-api-ver3" />
  </Slot>
</template>
