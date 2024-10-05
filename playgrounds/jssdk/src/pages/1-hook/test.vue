<script setup lang="ts">
import { ref, reactive, computed, type Ref, onMounted } from 'vue'
import B24HookConfig from '../../config'
import { LoggerBrowser, Result, type IResult } from '@bitrix24/b24jssdk'
import { B24Hook } from '@bitrix24/b24jssdk/hook'
import type {GetPayload, ListPayload} from '@bitrix24/b24jssdk/types/payloads';
// import type { UserBrief } from '@bitrix24/b24jssdk/types/users/entities';
import { AjaxResult } from "@bitrix24/b24jssdk/core/http/ajaxResult";
import {EnumCrmEntityTypeId} from "@bitrix24/b24jssdk/types/crm";

import Info from "../../components/Info.vue";

// region init ////
const logger = LoggerBrowser.build('page:install');

const result: IResult = reactive(new Result());
const B24 = new B24Hook(
	B24HookConfig
)

const status = ref({
	title: 'Test',
	message: 'Test.Message'
});

onMounted(() => {
	console.clear();
	result.setData([]);
	/*/
	window.setTimeout(
		() => {
			result.addError(new Error('@todo Test App Install Error.v1'));
			result.addError(new Error('@todo Test App Install Error.v2'));
		},
		15_000
	);
	//*/
	
	status.value.message = `call >>  user.current`;
	
	return B24.callMethod(
		'user.current',
		{}
	)
	.then((response: AjaxResult) => {
		const user = (response.getData() as GetPayload<any>).result;
		// @todo fix this ///
		//const user = (response.getData() as GetPayload<UserBrief>).result;
		
		status.value.message = `call >>  user.current >> [${user.ID || ''}] ${user.LAST_NAME || ''} ${user.NAME || ''}  ${user.SECOND_NAME || ''}`;
		
		logger.log('user.current', user);
	})
	.catch((error: Error|string) => {
		result.addError(error);
	})
})
// endregion ////

let listCalToMax = ref(2);
let listCalToMaxAll = ref(10);
let listCrmEntity = ref(0);

const count = ref(0);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let crmEntityListAllLoader = ref('');
let fetchListLoader = ref('');

function Action()
{
	makeSomeActions()
	.then(() => {})
	.catch((error) => {
		alert('Error ' + error.message)
	})
	
}

async function makeSomeActions()
{
	listCrmEntity.value = listCalToMax.value;
	
	console.clear();
	console.log('>> ', listCrmEntity.value);
	
	while(listCrmEntity.value > 0)
	{
		listCrmEntity.value--;
		console.log('>> ', listCrmEntity.value);
		
		await B24.callMethod(
			'user.current',
			{}
		);
	}
	
	listCalToMax.value = listCalToMax.value * 2;
}

async function makeSomeActionsAll()
{
	const list = [];
	listCrmEntity.value = listCalToMaxAll.value;
	
	console.clear();
	console.log('>> ', listCrmEntity.value);
	
	while(listCrmEntity.value > 0)
	{
		listCrmEntity.value--;
		list.push(B24.callMethod(
			'user.current',
			{}
		))
	}
	
	await Promise.all(list);
	
	listCalToMaxAll.value = listCalToMaxAll.value * 2;
}

async function crmEntityListAll()
{
	console.clear();
	crmEntityListAllLoader.value = '0%';
	B24.callListMethod(
		'crm.item.list',
		{
			entityTypeId: EnumCrmEntityTypeId.company,
		},
		(progress: number) => {
			crmEntityListAllLoader.value = `${progress}%`;
		}
	)
		.then((response) => {
			crmEntityListAllLoader.value = `ttl: ${response.getData().length}`;
		});
}

async function fetchListAll()
{
	console.clear();
	
	fetchListLoader.value = '0';
	let generator = B24.fetchListMethod(
		'crm.item.list',
		{
			entityTypeId: EnumCrmEntityTypeId.company,
		},
		'id',
		'__items'
	);
	
	let ttl = 0;
	for await (let entities of generator)
	{
		for(let entity of entities)
		{
			ttl++;
			fetchListLoader.value = `ttl: ${ttl} ...`;
			console.log('Crm Entity:', entity);
			
			await sleep(10);
		}
	}
	
	fetchListLoader.value = `ttl: ${ttl}`;
}

async function callBatch()
{
	try {
		
		let calls = [
			[ 'crm.item.get', { id: 2880 } ],
			[ 'crm.item.get', { id: 8 } ],
			[ 'crm.item.get', { id: 6 } ]
		];
		
		// We send a request packet as an array
		let response = await B24.callBatch(
			calls,
			false
		);
		console.log('Response array:', response);
		alert('res1');
		
		// A batch of requests in the form of an object with a maximum number of commands in a request of 50
		let callsV2 = {
			get_lead: [ 'crm.lead.get', { id: 2 } ],
			get_company: [ 'crm.company.get', { id: '$result[get_lead][COMPANY_ID]' } ],
			get_contact: [ 'crm.contact.get', { id: '$result[get_lead][CONTACT_ID]' } ]
		};
		
		// We send a request packet as an object
		response = await B24.callBatch(
			callsV2,
			false
		);
		console.log('Response object:', response);
		alert('res2');
		
	}
	catch(error)
	{
		alert(`Error: ${error.message} -> ${error.linenumber}`);
		console.log(error.stack);
	}
	
}
</script>

<template>
	<h1 class="text-h1 mb-sm flex whitespace-pre-wrap">Test</h1>
	<Info>You need to set environment variables in the <code>.env.local</code> file</Info>
	
	<div v-if="result.isSuccess">
		<h3>{{ status.title }}</h3>
		<h4>{{ status.message }}</h4>
		<button type="button" class="px-5 py-3 bg-red-500 text-primary-background-on" @click="count++">{{ count }}</button>
		<button type="button" class="px-5 py-3 bg-red-500 text-primary-background-on" @click="Action">makeSomeActions {{listCrmEntity}} / {{listCalToMax}}</button>
		<button type="button" class="px-5 py-3 bg-primary text-primary-background-on" @click="makeSomeActionsAll">makeSomeActionsAll {{listCalToMaxAll}}</button>
		<button type="button" class="px-5 py-3 bg-warning text-warning-background-on" @click="crmEntityListAll">crmEntityListAll {{crmEntityListAllLoader}}</button>
		<button type="button" class="px-5 py-3 bg-warning text-warning-background-on" @click="fetchListAll">fetchListAll {{fetchListLoader}}</button>
		<button type="button" class="px-5 py-3 bg-warning text-warning-background-on" @click="callBatch">callBatch</button>
	</div>
	<div v-if="!result.isSuccess">
		<h3 class="text-red-500">error</h3>
		<pre>{{ result }}</pre>
	</div>
</template>