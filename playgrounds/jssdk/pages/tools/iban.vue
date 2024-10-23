<script setup lang="ts">
import { useFormatter } from "@bitrix24/b24jssdk";

definePageMeta({
	layout: "page"
})

const { formatterIban } = useFormatter('en-US')
</script>

<template>
	<Info><strong>IBAN</strong>
		<br>{{ formatterIban.printFormat('BY09ALFA30132120160130270000', ' ') }}
		<br>{{ formatterIban.printFormat('RU0204452560040702810412345678901', ' ') }}
		<br>{{ formatterIban.printFormat('IR710570029971601460641001', ' ') }}
		<br>{{ formatterIban.printFormat('AZ77VTBA00000000001234567890', ' ') }}
		<br>{{ formatterIban.printFormat('GE60NB0000000123456789', ' ') }}
		<br>{{ formatterIban.printFormat('JO71CBJO0000000000001234567890', ' ') }}
	</Info>
</template>