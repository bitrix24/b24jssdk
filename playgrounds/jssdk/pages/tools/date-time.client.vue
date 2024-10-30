<script setup lang="ts">
import { useFormatter, Text } from "@bitrix24/b24jssdk";

definePageMeta({
	layout: "page"
})

const { formatterIban } = useFormatter('en-US')
</script>

<template>
	<h2>DateTime ( Luxon )</h2>
	<p>{{ Text.getDateForLog() }}</p>
</template>