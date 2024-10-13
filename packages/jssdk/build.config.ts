/**
 * @see https://github.com/nuxt/module-builder/blob/main/src/commands/build.ts
 */
import { existsSync, promises as fsp } from 'node:fs'
import { resolve } from 'pathe'
import { defineBuildConfig } from 'unbuild'

/**
 * Generate CommonJS stub
 * @param distDir
 */
async function writeCJSStub(distDir: string) {
	const cjsStubFile = resolve(distDir, 'index.cjs')
	if (existsSync(cjsStubFile)) {
		return
	}
	const cjsStub =
		`module.exports = function(...args) {
  return import('./index.mjs').then(m => m.default.call(this, ...args))
}
`
	await fsp.writeFile(cjsStubFile, cjsStub, 'utf8')
}

export default defineBuildConfig({
	name: '@bitrix24/b24jssdk',
	entries: [
		'./src/index',
		'./src/types/common',
		'./src/types/auth',
		'./src/types/payloads',
		'./src/types/crm/index',
		'./src/types/user',
		'./src/logger/browser',
		'./src/tools/scrollSize',
		'./src/tools/scrollSize',
		'./src/tools/useFormatters',
		'./src/tools/uniqId',
		'./src/core/result',
		'./src/core/abstractB24',
		'./src/core/language/list',
		'./src/core/http/ajaxError',
		'./src/core/http/ajaxResult',
		'./src/core/http/restrictionManager',
		'./src/core/http/controller',
		'./src/hook/index',
		'./src/frame/index',
		'./src/helper/characteristicsManager',
	],
	outDir: 'dist',
	clean: true,
	declaration: true,
	sourcemap: true,
	stub: false,
	rollup: {
		esbuild: {
			minify: true,
			target: 'esnext',
		},
		emitCJS: false,
		cjsBridge: true,
	},
	hooks: {
		async 'rollup:done'(ctx) {
			await writeCJSStub(ctx.options.outDir)
		},
	}
})
