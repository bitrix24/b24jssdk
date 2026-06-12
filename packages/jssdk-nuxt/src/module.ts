import { defineNuxtModule, addPlugin, createResolver } from '@nuxt/kit'

export type ModuleOptions = object

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@bitrix24/b24jssdk-nuxt',
    // Replaced from package.json at build time by rollup.replace (build.config.ts).
    // In `dev:prepare` (stub) mode the placeholder is left as-is — expected.
    version: '__SDK_VERSION__',
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
