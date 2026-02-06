import type { ContentNavigationItem } from '@nuxt/content'
import type { NavigationMenuItem } from '@bitrix24/b24ui-nuxt'
import { findPageChildren, findPageBreadcrumb } from '@nuxt/content/utils'
import { mapContentNavigation } from '@bitrix24/b24ui-nuxt/utils/content'
import { withTrailingSlash } from 'ufo' // withoutTrailingSlash
import LayersIcon from '@bitrix24/b24icons-vue/outline/LayersIcon'
import ItemIcon from '@bitrix24/b24icons-vue/crm/ItemIcon'

const categories = {
  'working-with-the-rest-api': [
    {
      id: 'actions',
      title: 'Actions',
      // @todo ! insert icon
      icon: LayersIcon
    },
    {
      id: 'tools',
      title: 'Tools',
      // @todo ! insert icon
      icon: ItemIcon
    },
    {
      id: 'logger',
      title: 'Logger',
      // @todo ! insert icon
      icon: ItemIcon
    },
    {
      id: 'limiters',
      title: 'Limiters',
      // @todo ! insert icon
      icon: ItemIcon
    },
    {
      id: 'B24Frame',
      title: 'B24Frame',
      // @todo ! insert icon
      icon: ItemIcon
    },
    {
      id: 'B24Hook',
      title: 'B24Hook',
      // @todo ! insert icon
      icon: ItemIcon
    },
    {
      id: 'B24OAuth',
      title: 'B24OAuth',
      // @todo ! insert icon
      icon: ItemIcon
    }
  ],
  'getting-started': [
    {
      id: 'integrations',
      title: 'Integrations',
      icon: undefined
    },
    {
      id: 'aiTools',
      title: 'AI Tools',
      icon: undefined
    }
  ]
}

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

  for (const category of categories[slug as keyof typeof categories] || []) {
    if (categorized[category.id]?.length) {
      groups.push({
        title: category.title,
        type: 'trigger' as const,
        icon: category?.icon,
        /**
         * @memo this path
         */
        path: `/docs/${slug}/`,
        class: 'restApiVersion' in category ? [`${category.restApiVersion}-only`] : undefined,
        children: categorized[category.id]
      })
    }
  }

  return groups
}

function resolveNavigationIcon(item: ContentNavigationItem) {
  return item
}

function filterChildrenByRestapiVersion(item: ContentNavigationItem, restApiVersion: string): ContentNavigationItem {
  const filteredChildren = item.children?.filter((child) => {
    if (child.path.startsWith('/docs/components')) {
      return true
    }

    if (child.restApiVersion && child.restApiVersion !== restApiVersion) {
      return false
    }
    return true
  })?.map(child => filterChildrenByRestapiVersion(resolveNavigationIcon(child), restApiVersion))

  return {
    ...item,
    children: filteredChildren?.length ? filteredChildren : undefined
  }
}

function processNavigationItem(item: ContentNavigationItem, parent?: ContentNavigationItem): ContentNavigationItem | ContentNavigationItem[] {
  if (item.shadow) {
    return item.children?.flatMap(child => processNavigationItem(child, item)) || []
  }

  return {
    ...item,
    title: parent?.title ? parent.title : item.title,
    badge: parent?.badge || item.badge,
    class: [item.restApiVersion && `${item.restApiVersion}-only`].filter(Boolean),
    // @memo Visibility control
    b24ui: {
      childItem: [item.restApiVersion && `${item.restApiVersion}-only`].filter(Boolean).join(' ')
    },
    children: item.children?.length ? item.children?.flatMap(child => processNavigationItem(child)) : undefined
  }
}

export const useNavigation = (navigation: Ref<ContentNavigationItem[] | undefined>) => {
  const { restApiVersion } = useRestApiVersions()

  const rootNavigation = computed(() =>
    navigation.value?.[0]?.children?.map(item => processNavigationItem(item)) as ContentNavigationItem[]
  )

  const navigationByRestApiVersion = computed(() =>
    rootNavigation.value?.map(item => filterChildrenByRestapiVersion(item, restApiVersion.value)).map((item) => {
      return {
        ...item,
        path: withTrailingSlash(item.path),
        children: (item?.children || []).map((child) => {
          return { ...child, path: withTrailingSlash(child.path) }
        })
      }
    })
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
      // @memo: while remove filterChildrenByFramework -> ?.flatMap(item => item?.children) ?? []
      ?.flatMap(item => filterChildrenByRestapiVersion(item, restApiVersion.value)?.children) ?? []

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

  function findBreadcrumb(path: string) {
    const breadcrumb = findPageBreadcrumb(navigation?.value, path, { indexAsChild: true })

    return mapContentNavigation(breadcrumb).map(({ icon, ...link }) => link)
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
          ...(((item?.children || []) as (NavigationMenuItem & { description?: string })[]).map(link => ({ ...link, to: withTrailingSlash(link.to as string), active: withTrailingSlash(link.to as string) === route.path })))
        ]
      }
    })

    const result = []
    for (const row of data) {
      result.push({
        ...row,
        type: 'label' as const,
        open: undefined,
        description: undefined,
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
    navigationByRestApiVersion,
    findSurround,
    findBreadcrumb
  }
}
