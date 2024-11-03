// https://nuxt.com/docs/api/configuration/nuxt-config
import {readFileSync} from "fs";

export default defineNuxtConfig({
	compatibilityDate: '2024-10-31',
	devtools: { enabled: false },
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
		'@nuxtjs/i18n',
	],
	i18n: {
		detectBrowserLanguage: false,
		strategy: 'no_prefix',
		lazy: true,
		langDir: 'locales',
		locales: [
			{
				code: 'de',
				name: 'Deutsch',
				file: 'de.json',
			},
			{
				code: 'la',
				name: 'Español',
				file: 'la.json',
			},
			
			{
				code: 'br',
				name: 'Português (Brasil)',
				file: 'br.json',
			},
			{
				code: 'fr',
				name: 'Français',
				file: 'fr.json',
			},
			{
				code: 'it',
				name: 'Italiano',
				file: 'it.json',
			},
			
			{
				code: 'pl',
				name: 'Polski',
				file: 'pl.json',
			},
			{
				code: 'ru',
				name: 'Polski',
				file: 'ru.json',
			},
			{
				code: 'ua',
				name: 'Українська',
				file: 'ua.json',
			},
			
			{
				code: 'tr',
				name: 'Türkçe',
				file: 'tr.json',
			},
			{
				code: 'sc',
				name: '中文（简体）',
				file: 'sc.json',
			},
			{
				code: 'tc',
				name: '中文（繁體）',
				file: 'tc.json',
			},
			
			{
				code: 'ja',
				name: '日本語',
				file: 'ja.json',
			},
			{
				code: 'vn',
				name: 'Tiếng Việt',
				file: 'vn.json',
			},
			{
				code: 'id',
				name: 'Bahasa Indonesia',
				file: 'id.json',
			},
			{
				code: 'ms',
				name: 'Bahasa Melayu',
				file: 'ms.json',
			},
			{
				code: 'th',
				name: 'ภาษาไทย',
				file: 'th.json',
			},
			{
				code: 'ar',
				name: 'عربي',
				file: 'ar.json',
			},
			
			{
				code: 'en',
				name: 'English',
				file: 'en.json',
			},
			
		],
		/**
		 * @memo defaultLocale mast be last at locales[]
		 * @see https://i18n.nuxtjs.org/docs/v7/strategies#no_prefix
		 */
		defaultLocale: 'en',
	},
})
