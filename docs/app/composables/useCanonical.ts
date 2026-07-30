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

      const md = toValue(markdownAlternate)
      const alternateHref = md
        ? ((md.startsWith('https://') || md.startsWith('http://')) ? md : joinURL(siteUrl, md))
        : undefined

      // Built as one array literal on purpose. unhead's `ResolvableLink` is a union
      // discriminated on `rel` (`CanonicalLink` | `AlternateLink` | …), so the entries
      // have to stay contextually typed — an explicit `Array<{ rel: string, … }>`
      // annotation widens `rel` and then matches no branch of the union.
      return [
        { rel: 'canonical', href: joinURL(siteUrl, pathNormal) },
        ...(alternateHref ? [{ rel: 'alternate' as const, type: 'text/markdown', href: alternateHref }] : [])
      ]
    })
  })
}
