/** @type {import('tailwindcss').Config} */
export default {
	content: [
		"./src/**/*.{js,vue,ts}",
	],
	theme: {
		extend: {},
	},
	plugins: [
		require('@bitrix24/b24style')
	]
}