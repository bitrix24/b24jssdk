import { existsSync, promises as fsp } from 'node:fs'
import { resolve } from 'pathe'
import { defineBuildConfig } from 'unbuild'
import path from 'path'

import packageInfo from '../../package.json'
const SDK_VERSION = packageInfo.version
const SDK_USER_AGENT = 'b24-js-sdk'

const isMinify = true
const rootDir = path.join(process.cwd(), '../../')

console.log({
	place: '>> build.conf',
	params: [
		process.cwd(),
		rootDir
	]
})

export default defineBuildConfig([
	//*/
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
	//*/
	//*/
	{
		failOnWarn: false,
		name: '@bitrix24/b24jssdk-v2',
		entries: [
			"./src/index"
		],
		declaration: false,
		sourcemap: true,
		outDir: "dist",
		rollup: {
			esbuild: {
				target: 'esnext',
				minify: isMinify,
			},
			replace: {
				values: getReplaceData(),
			},
			output: {
				format: 'es',
				name: 'B24Js',
				entryFileNames: 'es.[name].js',
				extend: true,
				compact: false,
				
				intro: '// TEST_STRING_v1 ////',
				outro: '// TEST_STRING_v2 ////',
				
				esModule: true,
				dynamicImportInCjs: true,
				externalImportAttributes: true,
				externalLiveBindings: true,
				freeze: true,
				
				minifyInternalExports: true,
				noConflict: true,
				
				inlineDynamicImports: false,
				preserveModules: true,
				
			},
			resolve: {
				browser: true,
			},
			emitCJS: true,
			inlineDependencies: true,
			commonjs: {
				include: ['../../node_modules/**']
			},
		},
		externals: [
			'axios',
			'qs',
			'luxon',
			'protobufjs',
		],
	},
	//*/
	{
		name: '@bitrix24/b24jssdk-iife',
		entries: [
			"src/index"
		],
		declaration: false,
		sourcemap: false,
		outDir: "dist",
		rollup: {
			esbuild: {
				target: 'esnext',
				minify: isMinify,
			},
			emitCJS: true,
			cjsBridge: true,
			inlineDependencies: true,
			replace: {
				values: getReplaceData(),
			},
			output: {
				format: 'iife',
				name: 'B24Js',
				entryFileNames: `browser.[name].js`,
				extend: true,
				compact: false,
				
				banner: '// TEST_STRING_v0 ////',
				intro: '// TEST_STRING_v1 ////',
				outro: '// TEST_STRING_v2 ////',
			},
			resolve: {
				browser: true,
				//rootDir: process.cwd(),
				//preferBuiltins: false,
				//extensions: ['.cjs', '.ts'],
				//jail: 'node_modules/@bitrix24/b24jssdk/dist',
				//jail: 'src',
				modulePaths: [
					'node_modules/**'
				]
			},
			commonjs: {
				//dynamicRequireRoot: rootDir,
				//include: ['node_modules/**']
			},
		},
		hooks: {
			async 'build:prepare'(ctx) {
				ctx.pkg.dependencies = { }
				ctx.options.dependencies = []
			},
			/**
			 * @todo remove this
			 */
			async 'build:before'(ctx) {
				console.log({
					place: '>> build:prepare',
					params: [
						ctx.options.externals
					]
				})
			},
		},
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
