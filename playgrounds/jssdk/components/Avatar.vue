<script lang="ts">
import {defineComponent, ref, computed, toRef, watch} from 'vue'
import type {PropType} from 'vue'
import {twMerge, twJoin} from 'tailwind-merge'
import PersonLocationIcon from '@bitrix24/b24icons-vue/main/PersonLocationIcon'

export default defineComponent({
	components: {
		PersonLocationIcon
	},
	inheritAttrs: false,
	props: {
		as: {
			type: [String, Object],
			default: 'img'
		},
		src: {
			type: [String, Boolean],
			default: null
		},
		alt: {
			type: String,
			default: null
		},
		text: {
			type: String,
			default: null
		},
		chipText: {
			type: [String, Number],
			default: null
		},
		imgClass: {
			type: String,
			default: ''
		},
		class: {
			type: [String, Object, Array] as PropType<any>,
			default: () => ''
		},
	},
	setup(props)
	{
		const ui = ref({
			wrapper: 'relative inline-flex items-center justify-center flex-shrink-0',
			background: 'bg-gray-100 dark:bg-gray-800',
			rounded: 'rounded-full',
			text: 'font-medium leading-none text-gray-900 dark:text-white truncate',
			placeholder: 'font-medium leading-none text-gray-500 dark:text-gray-400 truncate',
			size: {
				'3xs': 'h-4 w-4 text-[8px]',
				'2xs': 'h-5 w-5 text-[10px]',
				xs: 'h-6 w-6 text-xs',
				sm: 'h-8 w-8 text-sm',
				md: 'h-10 w-10 text-base',
				lg: 'h-12 w-12 text-lg',
				xl: 'h-14 w-14 text-xl',
				'2xl': 'h-16 w-16 text-2xl',
				'3xl': 'h-20 w-20 text-3xl',
			},
			chip: {
				base: 'absolute rounded-full ring-1 ring-white dark:ring-gray-900 flex items-center justify-center text-white dark:text-gray-900 font-medium',
				background: 'bg-green-500 dark:bg-green-700',
				position: {
					'top-right': 'top-0 right-0',
					'bottom-right': 'bottom-0 right-0',
					'top-left': 'top-0 left-0',
					'bottom-left': 'bottom-0 left-0',
				},
				size: {
					'3xs': 'h-[4px] min-w-[4px] text-[4px] p-px',
					'2xs': 'h-[5px] min-w-[5px] text-[5px] p-px',
					xs: 'h-1.5 min-w-[0.375rem] text-[6px] p-px',
					sm: 'h-2 min-w-[0.5rem] text-[7px] p-0.5',
					md: 'h-2.5 min-w-[0.625rem] text-[8px] p-0.5',
					lg: 'h-3 min-w-[0.75rem] text-[10px] p-0.5',
					xl: 'h-3.5 min-w-[0.875rem] text-[11px] p-1',
					'2xl': 'h-4 min-w-[1rem] text-[12px] p-1',
					'3xl': 'h-5 min-w-[1.25rem] text-[14px] p-1',
				},
			},
			icon: {
				base: 'text-gray-500 dark:text-gray-400 flex-shrink-0',
				size: {
					'3xs': 'h-2 w-2',
					'2xs': 'h-2.5 w-2.5',
					xs: 'h-3 w-3',
					sm: 'h-4 w-4',
					md: 'h-5 w-5',
					lg: 'h-6 w-6',
					xl: 'h-7 w-7',
					'2xl': 'h-8 w-8',
					'3xl': 'h-10 w-10',
				},
			},
			default: {
				size: 'sm',
				icon: null,
				chipColor: null,
				chipPosition: 'top-right',
			},
		})
		
		const url = computed(() =>
		{
			if(typeof props.src === 'boolean')
			{
				return null
			}
			return props.src
		})
		
		const placeholder = computed(() =>
		{
			return (props.alt || '').split(' ').map(word => word.charAt(0)).join('').substring(0, 2)
		})
		
		const wrapperClass = computed(() =>
		{
			return twMerge(twJoin(
				ui.value.wrapper,
				(error.value || !url.value) && ui.value.background,
				ui.value.rounded,
				ui.value.size.md
			), props.class)
		})
		
		const imgClass = computed(() =>
		{
			return twMerge(twJoin(
				ui.value.rounded,
				ui.value.size.md,
				'bg-origin-padding bg-cover bg-no-repeat'
			), props.imgClass)
		})
		
		const iconClass = computed(() =>
		{
			return twJoin(
				ui.value.icon.base,
				ui.value.icon.size.md
			)
		})
		
		const chipClass = computed(() =>
		{
			return twJoin(
				ui.value.chip.base,
				ui.value.chip.size.md,
				ui.value.chip.position['top-right'],
				ui.value.chip.background
			)
		})
		
		const error = ref(false)
		
		watch(() => props.src, () =>
		{
			if(error.value)
			{
				error.value = false
			}
		})
		
		function onError()
		{
			error.value = true
		}
		
		return {
			// eslint-disable-next-line vue/no-dupe-keys
			ui,
			wrapperClass,
			// eslint-disable-next-line vue/no-dupe-keys
			imgClass,
			iconClass,
			chipClass,
			url,
			placeholder,
			error,
			onError
		}
	}
})
</script>

<template>
	<span :class="wrapperClass">
		<div
			v-if="url && !error"
			:class="imgClass"
			v-bind:style="{ backgroundImage: `url(${url})` }"
			v-bind="$attrs"
			@error="onError"
		></div>
		<span v-else-if="text" :class="ui.text">{{text}}</span>
		<PersonLocationIcon v-else class="size-4xl" />
		<span v-if="chipText" :class="chipClass">
			{{ chipText }}
		</span>
		<slot/>
	</span>
</template>