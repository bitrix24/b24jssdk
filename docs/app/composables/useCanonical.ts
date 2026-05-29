import { withoutTrailingSlash, joinURL } from 'ufo'
import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'

export function useCanonical(markdownAlternate?: MaybeRefOrGetter<string | undefined>) {
  const route = useRoute()
  // const site = useSiteConfig()
  const config = useRuntimeConfig()

  useHead({
    link: computed(() => {
      const siteUrl = withoutTrailingSlash(`${config.public.canonicalUrl}${config.public.baseUrl}`)
      const pathNormal = withoutTrailingSlash(route.path)

      const links: Array<{ rel: string, href: string, type?: string }> = [
        { rel: 'canonical', href: joinURL(siteUrl, pathNormal) }
      ]

      const md = toValue(markdownAlternate)
      if (md) {
        const href = (md.startsWith('https://') || md.startsWith('http://')) ? md : joinURL(siteUrl, md)
        links.push({ rel: 'alternate', type: 'text/markdown', href })
      }

      return links
    })
  })
}
