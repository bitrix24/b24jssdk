import { queryCollection } from '@nuxt/content/server'

export default defineCachedEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const DOMAIN = `${config.public.canonicalUrl}${config.public.baseUrl}`

  const page = await queryCollection(event, 'index').first() as { title?: string, description?: string } | null

  const title = page?.title || 'Bitrix24 JS SDK'
  const description = page?.description
    || 'Bitrix24 JS SDK for using the Bitrix24 REST API in local, production applications or via webhooks.'

  const frontmatter = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    `canonical_url: ${JSON.stringify(DOMAIN)}`,
    `last_updated: ${JSON.stringify(new Date().toISOString().split('T')[0])}`,
    '---',
    ''
  ].join('\n')

  const body = `# ${title}

> ${description}

## About

The Bitrix24 JS SDK (\`@bitrix24/b24jssdk\`) is a free and open-source JavaScript/TypeScript library for the Bitrix24 REST API. It runs in the browser inside Bitrix24 applications (B24Frame), on the server through inbound webhooks (B24Hook) or OAuth server apps (B24OAuth), and in any modern JavaScript runtime.

- Three authentication modes: B24Frame (embedded apps), B24Hook (webhooks), B24OAuth (server apps)
- REST API v2 and v3: single calls, list iteration, and batch requests
- Built-in request batching, rate-limit handling, and automatic retries
- Helper managers for profile, application, payment, license, currency and options data
- Pluggable logging (including Telegram) and structured error codes
- First-class TypeScript types with full auto-completion
- Works with Nuxt, Vue, React, Node.js and UMD builds

## Installation

- Nuxt: <${DOMAIN}/raw/docs/getting-started/installation/nuxt.md>
- Vue: <${DOMAIN}/raw/docs/getting-started/installation/vue.md>
- React: <${DOMAIN}/raw/docs/getting-started/installation/react.md>
- Node.js: <${DOMAIN}/raw/docs/getting-started/installation/nodejs.md>
- UMD (browser): <${DOMAIN}/raw/docs/getting-started/installation/umd.md>

## Explore

- Getting started: <${DOMAIN}/raw/docs/getting-started.md>
- Working with the REST API: <${DOMAIN}/raw/docs/working-with-the-rest-api.md>
- B24Frame (embedded apps): <${DOMAIN}/raw/docs/working-with-the-rest-api/frame.md>
- B24Hook (webhooks): <${DOMAIN}/raw/docs/working-with-the-rest-api/hook.md>
- B24OAuth (server apps): <${DOMAIN}/raw/docs/working-with-the-rest-api/oauth.md>
- Sitemap: <${DOMAIN}/sitemap.md>
- LLMs index: <${DOMAIN}/llms.txt>
- Full LLMs documentation: <${DOMAIN}/llms-full.txt>

## Links

- Website: <${DOMAIN}>
- GitHub: <https://github.com/bitrix24/b24jssdk>
- Community (EN): <https://t.me/b24_dev>
- Community (RU): <https://t.me/bitrix24apps>
`

  setResponseHeader(event, 'Content-Type', 'text/markdown; charset=utf-8')
  setResponseHeader(event, 'Link', `<${DOMAIN}>; rel="canonical", <${DOMAIN}>; rel="alternate"; type="text/html"`)
  return frontmatter + body
}, {
  swr: true,
  maxAge: 60 * 60
})
