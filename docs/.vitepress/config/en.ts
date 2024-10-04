import { defineConfig, type DefaultTheme } from 'vitepress'
import { configParams } from './params'

export const en = defineConfig({
	lang: 'en-US',
	description: 'Bitrix24 REST API JS SDK',
	
	themeConfig: {
		nav: nav(),
		
		sidebar: {
			'/guide/': { base: '/guide/', items: sidebarGuide() },
			'/reference/': { base: '/reference/', items: sidebarReference() }
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
		{text: 'Reference', link: '/reference/logger-browser'},
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

function sidebarReference(): DefaultTheme.SidebarItem[] {
	return [
		{
			text: 'Usage',
			collapsed: false,
			items: [
				{text: 'Hook', link: 'hook' },
			]
		},
		{
			text: 'Core',
			collapsed: false,
			items: [
				{ text: 'Result', link: 'core-result' },
				{ text: 'Language List', link: 'core-lang-list' },
			]
		},
		{
			text: 'Data Types',
			collapsed: false,
			items: [
				{ text: 'Common', link: 'types-common' },
				{ text: 'CRM Entity Type', link: 'types-crm-entity' },
				{ text: 'For Authorization', link: 'types-auth' },
			]
		},
		{
			text: 'Logger',
			collapsed: false,
			items: [
				{ text: 'Logger for browser', link: 'logger-browser' },
			]
		},
	]
}