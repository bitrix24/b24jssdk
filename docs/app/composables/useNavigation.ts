import type { ContentNavigationItem } from '@nuxt/content'
import type { NavigationMenuItem } from '@bitrix24/b24ui-nuxt'
import { findPageChildren } from '@nuxt/content/utils'
import { mapContentNavigation } from '@bitrix24/b24ui-nuxt/utils/content'
import { withTrailingSlash } from 'ufo' // withoutTrailingSlash

function groupChildrenByCategory(items: ContentNavigationItem[], slug: string): ContentNavigationItem[] {
  if (!items.length) {
    return []
  }

  const groups: ContentNavigationItem[] = []

  const categorized: Record<string, ContentNavigationItem[]> = {}
  const uncategorized: ContentNavigationItem[] = []

  // Remove icons while grouping
  for (const item of items) {
    item.path = withTrailingSlash(item.path)
    if (item.category) {
      categorized[item.category as string] = categorized[item.category as string] || []
      categorized[item.category as string]?.push(item)
    } else {
      uncategorized.push(item)
    }
  }

  if (uncategorized.length) {
    const withChildren = uncategorized.filter(item => item.children?.length)
      ?.map(item => ({ ...item, children: item.children?.map(child => ({ ...child, path: withTrailingSlash(child.path), icon: undefined })) }))
    const withoutChildren = uncategorized.filter(item => !item.children?.length)

    if (withoutChildren.length) {
      groups.push({
        title: 'Overview',
        type: 'trigger' as const,
        /** @memo this path */
        path: `/docs/${slug}/`,
        children: withoutChildren?.map(item => ({ ...item, icon: undefined }))
      })
    }

    groups.push(...withChildren)
  }

  return groups
}

function processNavigationItem(item: ContentNavigationItem, parent?: ContentNavigationItem): ContentNavigationItem | ContentNavigationItem[] {
  if (item.shadow) {
    return item.children?.flatMap(child => processNavigationItem(child, item)) || []
  }

  return {
    ...item,
    title: parent?.title ? parent.title : item.title,
    badge: parent?.badge || item.badge,
    class: '',
    // @memo Visibility control
    b24ui: {
      childItem: ''
    },
    children: item.children?.length ? item.children?.flatMap(child => processNavigationItem(child)) : undefined
  }
}

export const useNavigation = (navigation: Ref<ContentNavigationItem[] | undefined>) => {
  const rootNavigation = computed(() =>
    navigation.value?.[0]?.children?.map(item => processNavigationItem(item)) as ContentNavigationItem[]
  )

  const navigationByCategory = computed(() => {
    const route = useRoute()

    const slug = route.params.slug?.[0] as string
    const children = findPageChildren(navigation?.value, `/docs/${slug}`, { indexAsChild: true })

    return groupChildrenByCategory(children, slug)
  })

  /**
   * @memo this path
   */
  function findSurround(path: string): [ContentNavigationItem | undefined, ContentNavigationItem | undefined] {
    const pathFormatted = withTrailingSlash(path)
    const flattenNavigation = navigationByCategory.value
      ?.flatMap(item => item?.children) ?? []

    const index = flattenNavigation.findIndex(item => item?.path === pathFormatted)

    if (index === -1) {
      return [undefined, undefined]
    }

    const surround: [ContentNavigationItem | undefined, ContentNavigationItem | undefined] = [flattenNavigation[index - 1], flattenNavigation[index + 1]]

    if (surround[0]) {
      surround[0].path = withTrailingSlash(surround[0].path)
    }
    if (surround[1]) {
      surround[1].path = withTrailingSlash(surround[1].path)
    }

    return surround
  }

  const navigationMenuByCategory = computed(() => {
    const route = useRoute()

    const data = mapContentNavigation(
      navigationByCategory?.value ?? []
    )?.map((item) => {
      return {
        ...item,
        open: true,
        children: [
          ...(((item?.children || []) as NavigationMenuItem[]).map(link => ({ ...link, to: withTrailingSlash(link.to as string), active: withTrailingSlash(link.to as string) === route.path })))
        ]
      }
    })

    const result = []
    for (const row of data) {
      result.push({
        ...row,
        type: 'label' as const,
        open: undefined,
        children: undefined
      })

      for (const child of row.children) {
        result.push({
          ...child,
          icon: row?.icon
        })
      }
    }

    return result
  })

  return {
    rootNavigation,
    navigationByCategory,
    navigationMenuByCategory,
    findSurround
  }
}
