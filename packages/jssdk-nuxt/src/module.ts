import {defu} from 'defu'
import {defineNuxtModule, addPlugin, useNuxt, createResolver} from '@nuxt/kit'
import logger, {LogLevels} from './logger/server'

export interface ModuleOptions
{
	quiet: boolean
}

const defaults = (nuxt = useNuxt()): ModuleOptions => ({
	quiet: nuxt.options.logLevel === 'silent'
})

/**
 * Module for communication with B24
 */
export default defineNuxtModule<ModuleOptions>({
	meta: {
		/**
		 * @todo fix this
		 */
		name: '@bitrix24/b24jssdk-nuxt',
		version: '0.1.0',
		configKey: 'b24JsSdk',
		compatibility: {
			nuxt: '>=3.13.0'
		}
	},
	defaults,
	setup(_options, _nuxt)
	{
		if(_options.quiet)
		{
			logger.level = LogLevels.silent;
		}
		
		// Default runtimeConfig ////
		_nuxt.options.runtimeConfig.public.b24Frame = defu(
			_nuxt.options.runtimeConfig.public?.b24Frame || {},
			_options
		);
		
		/**
		 * @todo fix this
		 */
		logger.withTag('setup').start('Start @bitrix24/b24jssdk-nuxt ...');
		
		const resolver = createResolver(import.meta.url);
		
		// Plugins ////
		addPlugin({
			src: resolver.resolve('./runtime/plugin')
		});
		
		logger.withTag('setup').success('plugin');
	},
})
