<script setup lang="ts">
import { Result } from '@bitrix24/b24jssdk/core/result'
import { LoggerBrowser } from '@bitrix24/b24jssdk/logger/browser';
import CodeIcon from "@bitrix24/b24icons-vue/common-service/CodeIcon"

const logger = LoggerBrowser.build(
	'Demo: Result',
	true
);

// This function contains errors ////
function proc1(): Result
{
	const result = new Result()
	if(1 > 0)
	{
		return result.addError(new Error('Some error 1'));
	}
	
	return result.setData({someKey1: 'This data will not be used'});
}

// This function does not contain an error ////
function proc2(): Result
{
	const result = new Result()
	if(1 > 2)
	{
		return result.addError(new Error('Some error 2'));
	}
	
	return result.setData({someKey2: 'This data will be used'});
}

const result = new Result()
result.setData({
	someKey0: 'SomeData'
})

if(result.isSuccess)
{
	// proc1 returns a non-successful response ////
	const response = proc1()
	if(!response.isSuccess)
	{
		// this code works ////
		result.addErrors([
			...response.getErrors()
		])
	}
	else
	{
		result.setData(Object.assign(
			result.getData(),
			response.getData()
		))
	}
}

if(result.isSuccess)
{
	// this code does not work ////
	const response = proc2()
	if(!response.isSuccess)
	{
		result.addErrors([
			...response.getErrors()
		])
	}
	else
	{
		result.setData(Object.assign(
			result.getData(),
			response.getData()
		))
	}
}

if(!result.isSuccess)
{
	// this code works ////
	logger.error(result.getErrorMessages());
}
else
{
	logger.log(result.getData());
}
</script>

<template>
	<h1 class="text-h1 mb-sm flex whitespace-pre-wrap">Result</h1>
	
	<div class="mt-2 py-2 rounded text-warning-background-on border-l-2 border-l-warning-link bg-warning-background pl-2 flex flex-row flex-nowrap gap-4 items-center justify-self-auto">
		<CodeIcon class="w-8 h-8" />
		<div class="">To view the result, open the developer console.</div>
	</div>
	
</template>