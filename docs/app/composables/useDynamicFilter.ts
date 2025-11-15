import type { IFuseOptions, FuseOptionKeyObject } from 'fuse.js'
import Fuse from 'fuse.js'
import type { Ref } from 'vue'
import { computed, shallowRef } from 'vue'

function useDynamicFilter<T>(
  filterText: Ref<string>,
  items: Ref<T[]>,
  attributes: FuseOptionKeyObject<T>[] = [],
  config: IFuseOptions<T> = {}
) {
  const searchEngine = shallowRef(
    new Fuse(items.value, {
      threshold: 0.2,
      keys: attributes,
      ...config
    })
  )

  const results = computed(() => {
    if (filterText.value) {
      return searchEngine.value.search(filterText.value).map(res => res.item)
    }

    if (attributes.length > 0) {
      const primaryAttribute = attributes[0]?.name || ''

      return items.value.slice().sort((first, second) => {
        const firstStr = first[primaryAttribute as keyof T] as string
        const secondStr = second[primaryAttribute as keyof T] as string
        return firstStr.localeCompare(secondStr)
      })
    }

    return items.value
  })

  return results
}

export default useDynamicFilter
