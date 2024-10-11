// https://nuxt.com/docs/api/configuration/nuxt-config
import {readFileSync} from "fs";

export default defineNuxtConfig({
	compatibilityDate: '2024-04-03',
	devtools: {enabled: false},
	devServer: {
		port: 3000,
		/*/
		host: 'custom.mydomain.local',
		https: {
			key: '.../source/ssl/custom.mydomain.local-key.pem',
			cert: '.../source/ssl/custom.mydomain.local.pem'
		},
		//*/
		loadingTemplate: () =>
		{
			return readFileSync('./template/devServer-loading.html', 'utf-8');
		}
	},
	css: ['~/assets/css/main.css'],
	postcss: {
		plugins: {
			tailwindcss: {},
			autoprefixer: {},
		},
	},
	modules: [
		'@nuxtjs/i18n'
	],
	i18n: {
		detectBrowserLanguage: false,
		strategy: 'no_prefix',
		lazy: true,
		langDir: 'locales',
		locales: [
			{
				code: 'tr',
				name: 'Türkçe',
				file: 'tr-TR.json',
			},
			{
				code: 'en',
				name: 'English',
				file: 'en-US.json',
			},
			
		],
		/**
		 * @memo defaultLocale mast be last at locales[]
		 * @see https://i18n.nuxtjs.org/docs/v7/strategies#no_prefix
		 */
		defaultLocale: 'en',
	},
})
