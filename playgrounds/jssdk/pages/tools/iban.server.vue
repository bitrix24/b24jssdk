<script setup lang="ts">
import { useFormatter } from "@bitrix24/b24jssdk";

definePageMeta({
	layout: "page"
})

const { formatterIban } = useFormatter()
</script>

<template>
	<Info><strong>IBAN</strong></Info>
	<ul>
		<li>{{ formatterIban.printFormat('IE29AIBK93115212345678', ' ') }}</li>
		<li>{{ formatterIban.printFormat('ES9121000418450200051332', ' ') }}</li>
		<li>{{ formatterIban.printFormat('GB29NWBK60161331926819', ' ') }}</li>
		<li>{{ formatterIban.printFormat('PL61109010140000071219812874', ' ') }}</li>
		<li>{{ formatterIban.printFormat('FR1420041010050500013M02606', ' ') }}</li>
		<li>{{ formatterIban.printFormat('IT60X0542811101000000123456', ' ') }}</li>
		<li>{{ formatterIban.printFormat('PT50000201231234567890154', ' ') }}</li>
		<li>{{ formatterIban.printFormat('NL91ABNA0417164300', ' ') }}</li>
		<li>{{ formatterIban.printFormat('IR710570029971601460641001', ' ') }}</li>
		<li>{{ formatterIban.printFormat('AZ77VTBA00000000001234567890', ' ') }}</li>
		<li>{{ formatterIban.printFormat('GE60NB0000000123456789', ' ') }}</li>
		<li>{{ formatterIban.printFormat('JO71CBJO0000000000001234567890', ' ') }}</li>
		<li>{{ formatterIban.printFormat('BY09ALFA30132120160130270000', ' ') }}</li>
	</ul>
</template>