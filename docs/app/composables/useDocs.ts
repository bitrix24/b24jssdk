import type { ContentNavigationItem } from '@nuxt/content'

export function useDocs(navigation: Ref<ContentNavigationItem[] | undefined>) {
  const { navigationMenuByCategory } = useNavigation(navigation!)

  return {
    navigationMenuByCategory
  }
}
