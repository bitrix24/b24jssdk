<script setup lang="ts">
import { computed, onMounted, shallowRef, onBeforeUnmount } from 'vue'
import { random } from 'lodash-es'
import { B24Icon } from '@bitrix24/b24icons-vue'

const time = 2000
const maxItemsToShow = 40

const { data } = await useAsyncData(
  'hero-icons',
  async () => {
    function getRandomItem(items: string[]) {
      return items[Math.floor(Math.random() * items.length)]
    }

    const { data: list } = await useFetch<string[]>('/api/icons.json')

    const icons = (list.value || [])
      .filter(item => item.includes('::'))
      /** @memo exclude icon.specialized */
      .filter(item => !item.includes('specialized'))
      /** @memo get new icons */
      .filter(item => (
        item.includes('solid::')
        || item.includes('outline::')
        || item.includes('file-type::Icon')
      ))

    const randomIcons = Array.from({ length: 100 }, () => getRandomItem(icons))

    return {
      icons: randomIcons
    }
  }
)

const icons = computed(() => {
  return data.value?.icons || []
})

function getRandomNewIcon(): string {
  const randomIndex = random(0, maxItems.value)
  const newRandomIcon = icons.value[randomIndex]

  if (items.value.includes(newRandomIcon)) {
    return getRandomNewIcon()
  }

  return newRandomIcon as string
}

const maxItems = computed(() => {
  return icons.value.length - 1
})

const initedList = ref(icons.value.slice(0, maxItemsToShow))
const items = computed({
  get() {
    return initedList.value
  },
  set(newIcons: string[]) {
    if (newIcons.length < 1) {
      return
    }

    const replaceIndex = random(0, maxItemsToShow - 1)
    initedList.value[replaceIndex] = newIcons[0]
  }
})

const intervalTime = shallowRef()

function isMark() {
  return random(0, 100) > 90
}

function insert() {
  if (maxItems.value < 1) {
    return
  }
  items.value = [getRandomNewIcon()]
}

function startInterval() {
  if (Number.parseInt(intervalTime.value) > 0) {
    return
  }
  console.log('>> start randomize icons')
  intervalTime.value = setInterval(() => {
    insert()
    insert()
    insert()
  }, time)
}

function stopInterval() {
  clearInterval(intervalTime.value)
  intervalTime.value = 0
}

onMounted(() => {
  window.addEventListener('mousemove', startInterval, { once: true })
  if (document.visibilityState !== 'hidden') {
    startInterval()
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopInterval()
      console.log('>> stop randomize icons: visibilitychange')
    } else {
      startInterval()
    }
  })
})

onBeforeUnmount(() => {
  stopInterval()
  console.log('>> stop randomize icons: onBeforeUnmount')
})
</script>

<template>
  <ClientOnly>
    <div class="my-5 mx-auto relative w-full h-full max-w-[560px] max-h-[220px]">
      <div class="grid gap-4 grid-cols-[repeat(auto-fill,minmax(38px,1fr))] grid-rows-[repeat(auto-fill,minmax(38px,1fr))] w-full h-full max-h-[196px] relative overflow-hidden">
        <div
          v-for="(icon, index) in items"
          :key="index"
          class="inline-flex justify-center items-center"
        >
          <B24Icon
            v-if="icon"
            :name="icon"
            class="size-8"
            :class="[
              isMark()
                ? 'text-ai-700 dark:text-blue-450'
                : 'text-base-master dark:text-base-200'
            ]"
          />
        </div>
      </div>
    </div>
  </ClientOnly>
</template>
