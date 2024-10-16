<script lang="ts">
import { ref, watch, onMounted, defineComponent, nextTick } from 'vue'
import type { PropType } from 'vue'
import { TabGroup as HTabGroup, TabList as HTabList, Tab as HTab, TabPanels as HTabPanels, TabPanel as HTabPanel, provideUseId } from '@headlessui/vue'
import { useResizeObserver } from '@vueuse/core'

interface TabItem {
	label: string
	icon?: string
	slot?: string
	disabled?: boolean
	content?: string
	[key: string]: any
}

export default defineComponent({
	components: {
		HTabGroup,
		HTabList,
		HTab,
		HTabPanels,
		HTabPanel
	},
	inheritAttrs: false,
	props: {
		modelValue: {
			type: Number,
			default: undefined
		},
		orientation: {
			type: String as PropType<'horizontal' | 'vertical'>,
			default: 'horizontal',
			validator: (value: string) => ['horizontal', 'vertical'].includes(value)
		},
		defaultIndex: {
			type: Number,
			default: 0
		},
		items: {
			type: Array as PropType<TabItem[]>,
			default: () => []
		},
		unmount: {
			type: Boolean,
			default: false
		},
		content: {
			type: Boolean,
			default: true
		},
		class: {
			type: [String, Object, Array] as PropType<any>,
			default: () => ''
		}
	},
	emits: ['update:modelValue', 'change'],
	setup (props, { emit }) {
		
		const ui = ref({
			wrapper: 'relative space-y-2',
			container: 'relative w-full',
			base: 'focus:outline-none',
			list: {
				base: 'relative',
				background: 'border-b border-b-1 border-base-400',
				rounded: '',
				shadow: '',
				padding: '',
				height: 'h-10',
				width: 'w-full',
				marker: {
					wrapper: 'absolute duration-200 ease-out focus:outline-none',
					base: 'w-full h-full',
					background: 'border-b border-b-2 border-info-background-on',
					rounded: '',
					shadow: '',
				},
				tab: {
					base: 'relative inline-flex items-center justify-center flex-shrink-0 w-full ui-focus-visible:outline-0 ui-focus-visible:ring-2 ui-focus-visible:ring-primary-500 dark:ui-focus-visible:ring-primary-400 ui-not-focus-visible:outline-none focus:outline-none disabled:cursor-not-allowed disabled:opacity-75 transition-colors duration-200 ease-out',
					background: 'hover:text-info-background-on',
					active: 'text-info-background-on',
					inactive: 'text-base-500',
					height: 'h-10',
					padding: 'px-3',
					size: 'text-lg',
					font: 'font-medium',
					rounded: 'rounded-md',
					shadow: '',
					icon: 'w-4 h-4 flex-shrink-0 me-2',
				},
			},
		});
		
		const listRef = ref<HTMLElement>()
		const itemRefs = ref<HTMLElement[]>([])
		const markerRef = ref<HTMLElement>()
		
		const selectedIndex = ref<number | undefined>(props.modelValue || props.defaultIndex)
		
		// Methods
		function calcMarkerSize (index: number | undefined) {
			// @ts-ignore
			const tab = itemRefs.value[index]?.$el
			if (!tab) {
				return
			}
			
			if (!markerRef.value) {
				return
			}
			
			markerRef.value.style.top = `${tab.offsetTop}px`
			markerRef.value.style.left = `${tab.offsetLeft}px`
			markerRef.value.style.width = `${tab.offsetWidth}px`
			markerRef.value.style.height = `${tab.offsetHeight}px`
		}
		
		function onChange (index: number) {
			selectedIndex.value = index
			
			emit('change', index)
			
			if (props.modelValue !== undefined) {
				emit('update:modelValue', selectedIndex.value)
			}
			
			calcMarkerSize(selectedIndex.value)
		}
		
		useResizeObserver(listRef, () => {
			calcMarkerSize(selectedIndex.value)
		})
		
		watch(() => props.modelValue, (value) => {
			selectedIndex.value = value
			
			calcMarkerSize(selectedIndex.value)
		})
		
		watch(() => props.items, async () => {
			await nextTick()
			calcMarkerSize(selectedIndex.value)
		}, { deep: true })
		
		onMounted(async () => {
			await nextTick()
			calcMarkerSize(selectedIndex.value)
		})
		
		provideUseId(() => useId())
		
		return {
			ui,
			listRef,
			itemRefs,
			markerRef,
			selectedIndex,
			onChange
		}
	}
})
</script>

<template>
	<HTabGroup
		:vertical="orientation === 'vertical'"
		:selected-index="selectedIndex"
		as="div"
		:class="ui.wrapper"
		v-bind="$attrs"
		@change="onChange"
	>
		<HTabList
			ref="listRef"
			:class="[ui.list.base, ui.list.background, ui.list.rounded, ui.list.shadow, ui.list.padding, ui.list.width, orientation === 'horizontal' && ui.list.height, orientation === 'horizontal' && 'inline-grid items-center']"
			:style="[orientation === 'horizontal' && `grid-template-columns: repeat(${items.length}, minmax(0, 1fr))`]"
		>
			<div ref="markerRef" :class="ui.list.marker.wrapper">
				<div :class="[ui.list.marker.base, ui.list.marker.background, ui.list.marker.rounded, ui.list.marker.shadow]" />
			</div>
			
			<HTab
				v-for="(item, index) of items"
				:key="index"
				ref="itemRefs"
				v-slot="{ selected, disabled }"
				:disabled="item.disabled"
				as="template"
			>
				<button :aria-label="item.ariaLabel" :class="[ui.list.tab.base, ui.list.tab.background, ui.list.tab.height, ui.list.tab.padding, ui.list.tab.size, ui.list.tab.font, ui.list.tab.rounded, ui.list.tab.shadow, selected ? ui.list.tab.active : ui.list.tab.inactive]">
					<slot
						name="icon"
						:item="item"
						:index="index"
						:selected="selected"
						:disabled="disabled"
					></slot>
					
					<slot :item="item" :index="index" :selected="selected" :disabled="disabled">
						<span class="truncate">{{ item.label }}</span>
					</slot>
				</button>
			</HTab>
		</HTabList>
		
		<HTabPanels v-if="content" :class="ui.container">
			<HTabPanel v-for="(item, index) of items" :key="index" v-slot="{ selected }" :class="ui.base" :unmount="unmount">
				<slot :name="item.slot || 'item'" :item="item" :index="index" :selected="selected">
					{{ item.content }}
				</slot>
			</HTabPanel>
		</HTabPanels>
	</HTabGroup>
</template>