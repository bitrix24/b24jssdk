import { existsSync, promises as fsp } from 'node:fs'
import { resolve } from 'pathe'
import { defineBuildConfig } from 'unbuild'

import packageInfo from '../../package.json'
const SDK_VERSION = packageInfo.version
const SDK_USER_AGENT = 'b24-js-sdk'

const isMinify = true

export default defineBuildConfig([
	{
		name: '@bitrix24/b24jssdk',
		entries: [
			"./src/index"
		],
		outDir: "dist",
		clean: true,
		declaration: true,
		sourcemap: true,
		stub: false,
		rollup: {
			esbuild: {
				minify: isMinify,
				target: 'esnext',
			},
			replace: {
				values: getReplaceData()
			},
			emitCJS: false,
			cjsBridge: true,
		},
		hooks: {
			async 'rollup:done'(ctx) {
				await writeCJSStub(ctx.options.outDir)
			},
		}
	},
	{
		name: '@bitrix24/b24jssdk-iife',
		entries: [
			"./src/index"
		],
		declaration: false,
		sourcemap: false,
		outDir: "dist",
		rollup: {
			esbuild: {
				target: 'esnext',
				minify: isMinify,
			},
			replace: {
				values: getReplaceData(),
			},
			emitCJS: false,
			inlineDependencies: true,
			output: {
				format: 'iife',
				entryFileNames: '[name].browser.js',
				minifyInternalExports: true,
				name: 'B24Js',
				globals: {
					luxon: 'luxon',
					'protobufjs/minimal': 'protobufjsMin',
					axios: 'axios',
					qs: 'qs',
				}
			},
			resolve: {
				extensions: ['.js', '.ts'],
				browser: true
			},
			commonjs: {
				include: ['../../node_modules/**']
			},
		}
	}
])

/**
 * Return Replace Data
 * @return {Record<string, string>}
 */
function getReplaceData(): Record<string, string>
{
	return {
		'__SDK_VERSION__': SDK_VERSION,
		'__SDK_USER_AGENT__': SDK_USER_AGENT,
	}
}

/**
 * Generate CommonJS stub
 * @param distDir
 */
async function writeCJSStub(distDir: string) {
	const cjsStubFile = resolve(distDir, 'index.cjs')
	if (existsSync(cjsStubFile))
	{
		return
	}
	const cjsStub =
		`module.exports = function(...args) {
  return import('./index.mjs').then(m => m.default.call(this, ...args))
}
`
	await fsp.writeFile(cjsStubFile, cjsStub, 'utf8')
}
