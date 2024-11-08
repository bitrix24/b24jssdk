<script setup lang="ts">
showError({
	statusCode: 404,
	statusMessage: 'CustomError',
	data: {
		homePageIsHide: false,
	},
	cause: new Error(),
	fatal: true
})
</script>
<template></template>