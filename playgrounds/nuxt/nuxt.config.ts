const extraAllowedHosts = (process?.env.NUXT_ALLOWED_HOSTS?.split(',').map((s: string) => s.trim()).filter(Boolean)) ?? []

export default defineNuxtConfig({
  modules: [
    // '@bitrix24/b24jssdk-nuxt',
    '../../packages/jssdk-nuxt/src/module',
    '@bitrix24/b24ui-nuxt'
  ],

  ssr: true,

  devtools: { enabled: false },

  css: ['~/assets/css/main.css'],

  /**
   * @memo this will be overwritten from .env or Docker_*
   * @see https://nuxt.com/docs/guide/going-further/runtime-config#example
   */
  runtimeConfig: {
    public: {}
  },

  devServer: { port: 3001 },

  compatibilityDate: '2024-07-09',

  vite: {
    server: {
      // Fix: "Blocked request. This host is not allowed" when using tunnels like ngrok
      allowedHosts: [...extraAllowedHosts]
    }
  }
})
