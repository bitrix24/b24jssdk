import { readFileSync } from "fs";

export default defineNuxtConfig({
	compatibilityDate: '2024-10-31',
	devtools: { enabled: false },
	devServer: {
		port: 3001,
		loadingTemplate: () =>
		{
			return readFileSync('./playground/template/devServer-loading.html', 'utf-8');
		}
	},
	css: ['~/assets/css/main.css'],
	modules: ['../src/module'],
	B24JsSdkNuxt: {},
})
