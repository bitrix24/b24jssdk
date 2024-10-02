<script lang="ts">
import { computed, defineComponent, ref } from 'vue'
import type { PropType } from 'vue'
import { Switch as HSwitch, provideUseId } from '@headlessui/vue'

export default defineComponent({
	components: {
		HSwitch,
	},
	inheritAttrs: false,
	props: {
		modelValue: {
			type: Boolean as PropType<boolean | null>,
			default: false
		},
		disabled: {
			type: Boolean,
			default: false
		},
	},
	emits: ['update:modelValue', 'change'],
	setup (props, { emit }) {
		const active = computed({
			get () {
				return props.modelValue
			},
			set (value) {
				emit('update:modelValue', value)
				emit('change', value)
			}
		})
		
		const switchClass = computed(() => {
			return [
				'relative',
				'inline-flex',
				'h-6',
				'w-11',
				'items-center',
				'rounded-full',
				active.value ? 'bg-blue-600' : 'bg-gray-200'
			]
		})
		
		const containerClass = computed(() => {
			return [
				'inline-block      ',
				'h-4',
				'w-4',
				'transform',
				'rounded-full',
				'bg-white',
				'transition',
				active.value ? 'translate-x-6' : 'translate-x-1'
			]
		})
		
		return {
			active,
			switchClass,
			containerClass
		}
	}
})
</script>

<template>
	<HSwitch
		v-model="active"
		:disabled="disabled"
		:class="switchClass"
	>
		<span :class="containerClass" />
	</HSwitch>
</template>