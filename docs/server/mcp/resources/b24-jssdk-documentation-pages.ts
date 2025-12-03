import { queryCollection } from '@nuxt/content/server'
import { withTrailingSlash } from 'ufo'

export default defineMcpResource({
  title: 'Bitrix24 JS SDK Documentation Pages',
  uri: 'resource://bitrix24-jssdk/documentation-pages',
  description: 'Complete list of available Bitrix24 JS SDK documentation pages',
  cache: '1h',
  async handler(uri: URL) {
    const event = useEvent()

    const pages = await queryCollection(event, 'docs').all()
    const config = useRuntimeConfig()

    const result = pages.map(page => ({
      title: page.title,
      description: page.description,
      path: `${config.public.baseUrl}${withTrailingSlash(page.path)}`,
      url: `${config.public.canonicalUrl}${config.public.baseUrl}${withTrailingSlash(page.path)}`
    }))

    return {
      contents: [{
        uri: uri.toString(),
        mimeType: 'application/json',
        text: JSON.stringify(result, null, 2)
      }]
    }
  }
})
