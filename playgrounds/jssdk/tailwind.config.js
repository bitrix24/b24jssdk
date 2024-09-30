/** @type {import('tailwindcss').Config} */

export default {
	content: [
		'./*.html',
		'./src/**/*.{vue,js,ts,jsx,tsx}'
	],
	theme: {
		extend: {},
	},
	plugins: [
		require('@bitrix24/b24style')({
			logs: false,
			useLocalFonts: false,
		}),
		require('@tailwindcss/typography')
	]
}