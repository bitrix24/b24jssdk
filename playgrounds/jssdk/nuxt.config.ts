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
})
