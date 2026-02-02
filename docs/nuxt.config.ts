import { createResolver } from '@nuxt/kit'
import pkg from '../package.json'
import { withoutTrailingSlash } from 'ufo'

const { resolve } = createResolver(import.meta.url)

/**
 * @memo need add pages for raw/***.md
 */
const pages = [
  // region getting-started ////
  '/docs/getting-started/',
  '/docs/getting-started/installation/vue/',
  '/docs/getting-started/installation/nuxt/',
  '/docs/getting-started/installation/react/',
  '/docs/getting-started/installation/nodejs/',
  '/docs/getting-started/installation/umd/',
  '/docs/getting-started/migration/v1/',
  '/docs/getting-started/ai/llms-txt/',
  // endregion ////
  // region examples ////
  '/docs/working-with-the-rest-api/',
  '/docs/working-with-the-rest-api/call-rest-api-ver2/',
  '/docs/working-with-the-rest-api/call-rest-api-ver3/',
  '/docs/working-with-the-rest-api/call-list-rest-api-ver2/',
  '/docs/working-with-the-rest-api/call-list-rest-api-ver3/',
  '/docs/working-with-the-rest-api/fetch-list-rest-api-ver2/',
  '/docs/working-with-the-rest-api/fetch-list-rest-api-ver3/',
  '/docs/working-with-the-rest-api/batch-rest-api-ver2/',
  '/docs/working-with-the-rest-api/batch-rest-api-ver3/',
  '/docs/working-with-the-rest-api/batch-by-chunk-rest-api-ver2/',
  '/docs/working-with-the-rest-api/batch-by-chunk-rest-api-ver3/',
  '/docs/working-with-the-rest-api/tools-health-check/',
  '/docs/working-with-the-rest-api/tools-ping/',
  '/docs/working-with-the-rest-api/logger/',
  '/docs/working-with-the-rest-api/logger-telegram/',
  '/docs/working-with-the-rest-api/limiters/',
  // endregion ////
  // region examples ////
  '/docs/examples/'
  // endregion ////
]

/**
 * @memo need add for iframe examples
 */
const pagesFrameExamples: string[] = [
  // '/examples/sidebar-layout-example/',
]

const pagesService = [
  '/404.html'
]

const extraAllowedHosts = (process?.env.NUXT_ALLOWED_HOSTS?.split(',').map((s: string) => s.trim()).filter(Boolean)) ?? []

const prodUrl = process?.env.NUXT_PUBLIC_SITE_URL ?? ''
const baseUrl = process?.env.NUXT_PUBLIC_BASE_URL ?? ''
const canonicalUrl = process?.env.NUXT_PUBLIC_CANONICAL_URL ?? ''
const gitUrl = process?.env.NUXT_PUBLIC_GIT_URL ?? ''

export default defineNuxtConfig({
  modules: [
    // '@bitrix24/b24jssdk-nuxt',
    '../packages/jssdk-nuxt/src/module',
    '@bitrix24/b24ui-nuxt',
    '@nuxt/content',
    // '@nuxt/image',
    '@nuxtjs/plausible',
    '@nuxtjs/mcp-toolkit',
    'nuxt-og-image',
    'motion-v/nuxt',
    (_, nuxt) => {
      nuxt.hook('components:dirs', (dirs) => {
        dirs.unshift({
          path: resolve('./app/components/content/examples'),
          pathPrefix: false,
          prefix: '',
          global: true
        })
      })
    },
    'nuxt-llms'
  ],

  ssr: true,

  devtools: {
    enabled: false
  },

  app: {
    baseURL: `${baseUrl}/`,
    buildAssetsDir: '/_nuxt/',
    head: {
      link: [
        { rel: 'icon', type: 'image/x-icon', href: `${baseUrl}/favicon.ico` }
      ],
      htmlAttrs: { class: 'edge-dark' }
    },
    rootAttrs: { 'data-vaul-drawer-wrapper': '' }
  },

  css: ['~/assets/css/main.css'],

  content: {
    build: {
      markdown: {
        highlight: {
          langs: ['bash', 'ts', 'typescript', 'diff', 'vue', 'json', 'yml', 'css', 'mdc', 'blade', 'edge']
        }
      }
    }
  },

  mdc: {
    highlight: {
      noApiRoute: false
    }
  },

  /**
   * @memo this will be overwritten from .env or Docker_*
   * @see https://nuxt.com/docs/guide/going-further/runtime-config#example
   */
  runtimeConfig: {
    public: {
      useAI: false,
      version: pkg.version,
      siteUrl: prodUrl,
      baseUrl,
      canonicalUrl,
      gitUrl
    }
  },

  // @todo add more redirects
  routeRules: {
    // redirects - default root pages
    '/docs': { redirect: '/docs/getting-started/', prerender: false },
    '/docs/getting-started/installation': { redirect: '/docs/getting-started/installation/vue/', prerender: false },
    '/docs/getting-started/migration': { redirect: '/docs/getting-started/migration/v1/', prerender: false },
    '/docs/getting-started/ai': { redirect: '/docs/getting-started/ai/llms-txt/', prerender: false }
  },

  compatibilityDate: '2024-07-09',

  nitro: {
    prerender: {
      routes: [
        ...pages.map((page: string) => `${withoutTrailingSlash(`/raw${page}`)}.md`),
        ...pagesFrameExamples,
        ...pagesService
      ],
      crawlLinks: true,
      autoSubfolderIndex: false
    }
  },

  vite: {
    optimizeDeps: {
      // prevents reloading page when navigating between components
      include: ['@ai-sdk/vue', '@internationalized/date', '@nuxt/content/utils', '@tanstack/vue-table', '@vue/devtools-core', '@vue/devtools-kit', '@vueuse/integrations/useFuse', '@vueuse/shared', 'ai', 'colortranslator', 'embla-carousel-auto-height', 'embla-carousel-auto-scroll', 'embla-carousel-autoplay', 'embla-carousel-class-names', 'embla-carousel-fade', 'embla-carousel-vue', 'embla-carousel-wheel-gestures', 'json5', 'motion-v', 'ohash', 'ohash/utils', 'prettier', 'reka-ui', 'reka-ui/namespaced', 'scule', 'shiki', 'shiki-stream/vue', 'shiki-transformer-color-highlight', 'shiki/engine-javascript.mjs', 'tailwind-variants', 'tailwindcss/colors', 'ufo', 'vaul-vue', 'zod']
    },
    server: {
      // Fix: "Blocked request. This host is not allowed" when using tunnels like ngrok
      allowedHosts: [...extraAllowedHosts]
    }
  },

  // @memo not use this
  // image: {
  //   format: ['webp', 'jpeg', 'jpg', 'png', 'svg'],
  //   provider: 'ipx'
  // },

  // @todo fix sections
  llms: {
    domain: `${prodUrl}${baseUrl}`,
    title: 'Bitrix24 JS SDK',
    description: 'A comprehensive JavaScript library integrated with Bitrix24, providing a powerful and convenient toolkit for interacting with the Bitrix24 REST API, enabling secure and efficient management of data and processes in web application development.',
    full: {
      title: 'Bitrix24 JS SDK Full Documentation',
      description: 'This is the full documentation for Bitrix24 JS SDK. It includes all the Markdown files written with the MDC syntax.'
    },
    sections: [
      {
        title: 'Getting Started',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '/docs/getting-started%' }
        ]
      },
      {
        title: 'Working',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '/docs/working-with-the-rest-api%' }
        ]
      },
      {
        title: 'Examples',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '/docs/examples%' }
        ]
      }
    ],
    notes: [
      'The content is automatically generated from the same source as the official documentation.'
    ]
  },
  mcp: {
    /** @memo fix if you need */
    enabled: true,
    name: 'Bitrix24 JS SDK',
    version: '1.0.0',
    route: `/mcp/`, // ${baseUrl}
    browserRedirect: '/docs/getting-started/ai/mcp/'
  },

  // @memo off for generate
  ogImage: { enabled: false }
})
