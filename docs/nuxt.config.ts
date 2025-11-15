import { createResolver } from '@nuxt/kit'
import pkg from '../package.json'
// import { withoutTrailingSlash } from 'ufo'

const { resolve } = createResolver(import.meta.url)

/**
 * @memo need add pages for raw/***.md
 */
const pages = [
  // region getting-started ////
  '/docs/getting-started/',
  '/docs/getting-started/installation/vue/',
  '/docs/getting-started/installation/nuxt/',
  '/icons/'
  // endregion ////
]

const pagesService = [
  '/api/icons.json',
  '/404.html'
]

export default defineNuxtConfig({
  modules: [
    '@bitrix24/b24ui-nuxt',
    '@nuxt/content',
    '@nuxtjs/plausible',
    '@vueuse/nuxt',
    (_, nuxt) => {
      nuxt.hook('components:dirs', (dirs) => {
        dirs.unshift({
          path: resolve('./app/components/content/examples'),
          pathPrefix: false,
          prefix: '',
          global: true
        })
      })
    }
  ],

  ssr: true,

  devtools: {
    enabled: false
  },

  app: {
    baseURL: '/b24icons/',
    buildAssetsDir: '/_nuxt/',
    head: {
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/b24icons/favicon.ico' }
      ],
      htmlAttrs: {
        class: 'edge-dark'
      }
    },
    rootAttrs: {
      'data-vaul-drawer-wrapper': ''
    }
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

  runtimeConfig: {
    public: {
      version: pkg.version
    }
  },

  routeRules: {},

  compatibilityDate: '2024-07-09',

  nitro: {
    prerender: {
      routes: [
        ...pages.map((page: string) => `${page}`),
        ...pagesService
      ],
      crawlLinks: true,
      autoSubfolderIndex: false
    }
  },

  vite: {
    optimizeDeps: {
      // prevents reloading page when navigating between components
      include: ['@internationalized/date', '@nuxt/content/utils', '@tanstack/vue-table', '@vue/devtools-core', '@vue/devtools-kit', '@vueuse/integrations/useFuse', '@vueuse/shared', 'ai', 'colortranslator', 'embla-carousel-auto-height', 'embla-carousel-auto-scroll', 'embla-carousel-autoplay', 'embla-carousel-class-names', 'embla-carousel-fade', 'embla-carousel-vue', 'embla-carousel-wheel-gestures', 'json5', 'motion-v', 'ohash', 'ohash/utils', 'prettier', 'reka-ui', 'reka-ui/namespaced', 'scule', 'shiki', 'shiki-stream/vue', 'shiki-transformer-color-highlight', 'shiki/engine-javascript.mjs', 'tailwind-variants', 'tailwindcss/colors', 'ufo', 'vaul-vue', 'zod']
    }
    // server: {
    //   allowedHosts: [
    //     '******.ngrok-free.app',
    //     'perversely-welcomed-peacock.cloudpub.ru'
    //   ],
    //   cors: true
    // }
  }
})
