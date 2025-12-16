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
  '/docs/getting-started/installation/nodejs/',
  '/docs/getting-started/installation/umd/',
  '/docs/getting-started/ai/mcp/',
  '/docs/getting-started/ai/llms-txt/',
  '/docs/templates/entity-list/', // @memo we remove this
  '/docs/templates/app-page-installation-wizard/', // @memo we remove this
  // endregion ////
  // region B24Frame ////
  '/docs/frame/',
  // '/docs/frame/getters/auth/',
  // '/docs/frame/getters/is-init/',
  // '/docs/frame/methods/call-method/',
  // '/docs/frame/methods/call-batch/',
  // '/docs/frame/methods/call-batch-by-chunk/',
  // '/docs/frame/methods/call-list-method/',
  // '/docs/frame/methods/fetch-list-method/',
  // '/docs/frame/methods/get-target-origin/',
  // '/docs/frame/methods/get-target-origin-with-path/',
  // '/docs/frame/methods/set-logger/',
  // '/docs/frame/methods/get-logger/',
  // '/docs/frame/methods/off-client-side-warning/',
  // '/docs/frame/methods/get-http-client/',
  // '/docs/frame/methods/destroy/',
  // endregion ////
  // region B24OAuth ////
  '/docs/oauth/',
  // '/docs/oauth/getters/auth/',
  // '/docs/oauth/getters/is-init/',
  // '/docs/oauth/methods/call-method/',
  // '/docs/oauth/methods/call-batch/',
  // '/docs/oauth/methods/call-batch-by-chunk/',
  // '/docs/oauth/methods/call-list-method/',
  // '/docs/oauth/methods/fetch-list-method/',
  // '/docs/oauth/methods/get-target-origin/',
  // '/docs/oauth/methods/get-target-origin-with-path/',
  // '/docs/oauth/methods/set-logger/',
  // '/docs/oauth/methods/get-logger/',
  // '/docs/oauth/methods/off-client-side-warning/',
  // '/docs/oauth/methods/get-http-client/',
  // '/docs/oauth/methods/destroy/',
  // endregion ////
  // region B24Hook ////
  '/docs/hook/',
  '/docs/hook/getters/auth/',
  '/docs/hook/getters/is-init/',
  '/docs/hook/methods/call-method/',
  // '/docs/hook/methods/call-batch/',
  // '/docs/hook/methods/call-batch-by-chunk/',
  // '/docs/hook/methods/call-list-method/',
  // '/docs/hook/methods/fetch-list-method/',
  '/docs/hook/methods/get-target-origin/',
  '/docs/hook/methods/get-target-origin-with-path/',
  '/docs/hook/methods/set-logger/',
  '/docs/hook/methods/get-logger/',
  '/docs/hook/methods/off-client-side-warning/',
  '/docs/hook/methods/get-http-client/',
  '/docs/hook/methods/destroy/',
  // endregion ////
  // region Core ////
  '/docs/core/logger-browser/',
  '/docs/core/result/',
  '/docs/core/ajax-result/'
  // endregion ////
]

/**
 * @memo need add for iframe examples
 */
const pagesFrameExamples = [
  '/examples/sidebar-layout-example/',
  '/examples/sidebar-layout-inner-example/',
  '/examples/banner-example/',
  '/examples/banner-with-title-example/',
  '/examples/content-search-example/'
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
    '@bitrix24/b24icons-nuxt',
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
    // v4 redirects - default root pages
    '/docs': { redirect: '/docs/getting-started/', prerender: false },
    '/docs/getting-started/installation': { redirect: '/docs/getting-started/installation/nuxt/', prerender: false }
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
      allowedHosts: [...extraAllowedHosts],
      cors: true
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
        title: 'B24Frame',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '/docs/frame%' }
        ]
      },
      {
        title: 'B24Hook',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '/docs/hook%' }
        ]
      },
      {
        title: 'B24OAuth',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '/docs/oauth%' }
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
