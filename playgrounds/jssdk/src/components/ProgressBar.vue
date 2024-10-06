<script lang="ts">
import { computed, defineComponent, ref } from 'vue'
import type { PropType } from 'vue'
import { twJoin } from 'tailwind-merge'

export default defineComponent({
	inheritAttrs: false,
	props: {
		value: {
			type: Number,
			default: null
		},
		max: {
			type: [Number, Array<any>],
			default: 100
		},
		indicator: {
			type: Boolean,
			default: false
		},
		class: {
			type: [String, Object, Array] as PropType<any>,
			default: () => ''
		}
	},
	setup (props) {
		const ui = ref({
			wrapper: 'w-full flex flex-col gap-2',
			indicator: {
				container: {
					base: 'flex flex-row justify-end',
					width: 'min-w-fit',
					transition: 'transition-all',
				},
				align: 'text-end',
				width: 'w-fit',
				color: 'text-gray-400 dark:text-gray-500',
				size: {
					'2xs': 'text-xs',
					xs: 'text-xs',
					sm: 'text-sm',
					md: 'text-sm',
					lg: 'text-sm',
					xl: 'text-base',
					'2xl': 'text-base',
				},
			},
			progress: {
				base: 'block appearance-none border-none overflow-hidden',
				width: 'w-full [&::-webkit-progress-bar]:w-full',
				size: {
					'2xs': 'h-px',
					xs: 'h-0.5',
					sm: 'h-1',
					md: 'h-2',
					lg: 'h-3',
					xl: 'h-4',
					'2xl': 'h-5',
				},
				rounded: 'rounded-full [&::-webkit-progress-bar]:rounded-full',
				track: '[&::-webkit-progress-bar]:bg-gray-200 [&::-webkit-progress-bar]:dark:bg-gray-700 [@supports(selector(&::-moz-progress-bar))]:bg-gray-200 [@supports(selector(&::-moz-progress-bar))]:dark:bg-gray-700',
				bar: '[&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:transition-all [&::-webkit-progress-value]:ease-in-out [&::-moz-progress-bar]:rounded-full',
				color: 'text-blue-500 dark:text-blue-400',
				background: '[&::-webkit-progress-value]:bg-current [&::-moz-progress-bar]:bg-current',
				indeterminate: {
					base: 'indeterminate:relative',
					rounded: 'indeterminate:after:rounded-full [&:indeterminate::-webkit-progress-value]:rounded-full [&:indeterminate::-moz-progress-bar]:rounded-full',
				},
			},
			steps: {
				base: 'grid grid-cols-1',
				color: 'text-{color}-500 dark:text-{color}-400',
				size: {
					'2xs': 'text-xs',
					xs: 'text-xs',
					sm: 'text-sm',
					md: 'text-sm',
					lg: 'text-sm',
					xl: 'text-base',
					'2xl': 'text-base',
				},
			},
			step: {
				base: 'transition-all opacity-0 truncate row-start-1 col-start-1',
				align: 'text-end',
				active: 'opacity-100',
				first: 'text-gray-500 dark:text-gray-400',
			},
			default: {
				color: 'primary',
				size: 'md'
			},
		});
		
		const indicatorContainerClass = computed(() => {
			return twJoin(
				ui.value.indicator.container.base,
				ui.value.indicator.container.width,
				ui.value.indicator.container.transition
			)
		})
		
		const indicatorClass = computed(() => {
			return twJoin(
				ui.value.indicator.align,
				ui.value.indicator.width,
				ui.value.indicator.color,
				ui.value.indicator.size.md
			)
		})
		
		const progressClass = computed(() => {
			const classes = [
				ui.value.progress.base,
				ui.value.progress.width,
				ui.value.progress.size.md,
				ui.value.progress.rounded,
				ui.value.progress.track,
				ui.value.progress.bar,
				// Intermediate class to allow thumb ring or background color (set to `current`) as it's impossible to safelist with arbitrary values
				ui.value.progress.color,
				ui.value.progress.background,
				ui.value.progress.indeterminate.base,
				ui.value.progress.indeterminate.rounded
			]
			
			return twJoin(...classes)
		})
		
		const stepsClass = computed(() => {
			return twJoin(
				ui.value.steps.base,
				ui.value.steps.color,
				ui.value.steps.size.md
			)
		})
		
		const stepClass = computed(() => {
			return twJoin(
				ui.value.step.base,
				ui.value.step.align
			)
		})
		
		const stepActiveClass = computed(() => {
			return twJoin(
				ui.value.step.active
			)
		})
		
		const stepFirstClass = computed(() => {
			return twJoin(
				ui.value.step.first
			)
		})
		
		function isActive (index: number) {
			return index === Number(props.value)
		}
		
		function isFirst (index: number) {
			return index === 0
		}
		
		function stepClasses (index: string | number) {
			index = Number(index)
			
			const classes = [stepClass.value]
			
			if (isFirst(index)) {
				classes.push(stepFirstClass.value)
			}
			
			if (isActive(index)) {
				classes.push(stepActiveClass.value)
			}
			
			return classes.join(' ')
		}
		
		const isIndeterminate = computed(() => props.value === undefined || props.value === null)
		const isSteps = computed(() => Array.isArray(props.max))
		
		const realMax = computed(() => {
			if (isIndeterminate.value) {
				return null
			}
			
			if (Array.isArray(props.max)) {
				return props.max.length - 1
			}
			
			return Number(props.max)
		})
		
		const percent = computed(() => {
			if (isIndeterminate.value) {
				return undefined
			}
			
			switch (true) {
				case props.value < 0: return 0
				case props.value > (realMax.value as number): return 100
				default: return (props.value / (realMax.value as number)) * 100
			}
		})
		
		return {
			// eslint-disable-next-line vue/no-dupe-keys
			ui,
			indicatorContainerClass,
			indicatorClass,
			progressClass,
			stepsClass,
			stepClasses,
			isIndeterminate,
			isSteps,
			realMax,
			percent
		}
	}
})
</script>

<template>
	<div :class="ui.wrapper" role="progressbar">
		<slot v-if="indicator || $slots.indicator" name="indicator" v-bind="{ percent }">
			<div v-if="!isSteps" :class="indicatorContainerClass" :style="{ width: `${percent}%` }">
				<div :class="indicatorClass">
					{{ Math.round(percent) }}%
				</div>
			</div>
		</slot>
		
		<progress
			:aria-valuemax="realMax"
			:aria-valuenow="value"
			:class="progressClass"
			v-bind="{ value, max: realMax }"
		>
			{{ percent !== undefined ? `${Math.round(percent)}%` : undefined }}
		</progress>
		
		<div v-if="isSteps" :class="stepsClass">
			<div v-for="(step, index) in max" :key="index" :class="stepClasses(index)">
				<slot :name="`step-${index}`" v-bind="{ step }">
					{{ step }}
				</slot>
			</div>
		</div>
	</div>
</template>