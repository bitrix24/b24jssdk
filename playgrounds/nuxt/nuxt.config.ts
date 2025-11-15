import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  modules: [
    '@bitrix24/b24ui-nuxt',
    // '@bitrix24/b24jssdk-nuxt',
    '../../packages/jssdk-nuxt/src/module',
    '@nuxt/eslint'
  ],
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  devServer: {
    port: 3001,
    loadingTemplate: () => {
      return readFileSync('./playground/template/devServer-loading.html', 'utf-8')
    }
  },
  compatibilityDate: '2024-04-12',
  vite: {
    plugins: [
      tailwindcss()
    ]
  },
  B24JsSdkNuxt: {}
})
