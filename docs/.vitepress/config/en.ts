import { defineConfig, type DefaultTheme } from 'vitepress'
import { configParams } from './params'

export const en = defineConfig({
	lang: 'en-US',
	description: 'Bitrix24 REST API JS SDK',
	
	themeConfig: {
		nav: nav(),
		
		sidebar: {
			'/guide/': { base: '/guide/', items: sidebarGuide() }
		},
		
		editLink: {
			pattern: 'https://github.com/bitrix24/b24jssdk/edit/main/docs/:path',
			text: 'Edit this page on GitHub'
		},
		
		footer: {
			message: 'Released under the MIT License.',
			copyright: 'Copyright © 2024-present Bitrix24'
		},
	}
})


function nav(): DefaultTheme.NavItem[] {
	return [
		{text: 'Quickstart', link: '/guide/getting-started'},
		{
			text: configParams.version,
			items: [
				{
					text: 'Changelog',
					link: `${configParams.github}/blob/main/CHANGELOG.md`
				},
				... configParams.relative
			]
		}
	]
}

function sidebarGuide(): DefaultTheme.SidebarItem[] {
	return [
		{
			text: 'Guide',
			collapsed: false,
			items: [
				{ text: 'Getting Started', link: 'getting-started' },
				{ text: 'Vue', link: 'vue' }
			]
		},
	]
}