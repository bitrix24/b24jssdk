import { defineNuxtModule, addPlugin, createResolver } from '@nuxt/kit'

export type ModuleOptions = object

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@bitrix24/b24jssdk-nuxt',
    version: '0.5.1',
    configKey: 'B24JsSdkNuxt',
    compatibility: {
      nuxt: '>=4.0.0'
    }
  },
  defaults: {},
  async setup(_options, _nuxt) {
    const resolver = createResolver(import.meta.url)

    addPlugin({ src: resolver.resolve('./runtime/plugin') })
  }
})
