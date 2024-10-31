import { defineNuxtModule, addPlugin, createResolver } from '@nuxt/kit'

export interface ModuleOptions
{
}

export default defineNuxtModule<ModuleOptions>({
	meta: {
		name: '@bitrix24/b24jssdk-nuxt',
		version: '0.1.0',
		configKey: 'B24JsSdkNuxt',
		compatibility: {
			nuxt: '>=3.13.0'
		}
	},
	defaults: {},
	setup(_options, _nuxt)
	{
		const resolver = createResolver(import.meta.url)
		
		addPlugin({
			src: resolver.resolve('./runtime/plugin')
		})
	},
})
