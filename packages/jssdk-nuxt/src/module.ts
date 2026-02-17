import { defineNuxtModule, addPlugin, createResolver } from '@nuxt/kit'

export type ModuleOptions = object

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@bitrix24/b24jssdk-nuxt',
    version: '1.0.2',
    configKey: 'B24JsSdkNuxt',
    compatibility: {
      nuxt: '>=4.2.2'
    }
  },
  defaults: {},
  async setup(_options, _nuxt) {
    const resolver = createResolver(import.meta.url)

    addPlugin({ src: resolver.resolve('./runtime/plugin') })
  }
})
