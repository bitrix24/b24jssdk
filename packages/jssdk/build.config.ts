import { defineBuildConfig, type BuildConfig, type BuildContext } from 'unbuild'
import { type ModuleFormat } from 'rollup'

import packageInfo from '../../package.json'
const SDK_VERSION = packageInfo.version
const SDK_USER_AGENT = 'b24-js-sdk'
const COPYRIGHT_DATE = (new Date()).getFullYear()

const listFormats: string[] = [
	'esm',
	'commonjs',
	'iife-min'
]

export default defineBuildConfig(
	listFormats.map((formatTypeParam) => {
		const formatType = formatTypeParam.replace('-min', '') as ModuleFormat
		const isMinify = formatTypeParam.includes('-min')
		//const outDir = isEsm ? 'dist' : `dist/${formatType}`
		const outDir = `dist/${formatType}`
		let declaration = true
		let sourcemap = true
		
		let emitCJS = true
		let cjsBridge = true
		let inlineDependencies = true
		
		let fileExtension
		let rollupExt = {
			output: {},
			resolve: {}
		}
		
		let hooks: Record<string, Function> = {}
		
		switch(formatType)
		{
			case 'esm':
				declaration = true
				sourcemap = true
				fileExtension = 'mjs'
				emitCJS = false
				cjsBridge = false
				inlineDependencies = false
				rollupExt.output = {
					extend: true,
					esModule: true,
					preserveModules: true,
					inlineDynamicImports: false,
				}
				break
			case 'commonjs':
				fileExtension = 'cjs'
				emitCJS = true
				cjsBridge = true
				inlineDependencies = true
				break
			case 'iife':
				declaration = false
				sourcemap = true
				fileExtension = 'js'
				
				emitCJS = true
				cjsBridge = true
				inlineDependencies = true
				
				rollupExt.output = {
					extend: true,
					compact: false,
					esModule: false,
					preserveModules: false,
					inlineDynamicImports: true,
				}
				
				rollupExt.resolve = {
					browser: true,
					modulePaths: [
						'node_modules/**'
					]
				}
				
				hooks = {
					async 'build:prepare'(ctx: BuildContext) {
						ctx.pkg.dependencies = {}
						ctx.options.dependencies = []
					}
				}
				break
			default:
				fileExtension = 'js'
				break
		}
		
		const entryFileNames = `[name]${isMinify ? '.min' : ''}.${fileExtension}`
		return {
			failOnWarn: true,
			name: `@bitrix24/b24jssdk-${formatType}`,
			entries: [
				'./src/index'
			],
			outDir,
			declaration,
			sourcemap,
			rollup: {
				esbuild: {
					minify: isMinify,
					target: 'esnext',
				},
				emitCJS,
				cjsBridge,
				inlineDependencies,
				replace: {
					values: getReplaceData()
				},
				output: {
					format: formatType,
					name: 'B24Js',
					entryFileNames,
					banner: getBanner.bind(this),
					intro: getIntro.bind(this),
					outro: getOutro.bind(this),
					...rollupExt.output
				},
				resolve: rollupExt.resolve
			},
			hooks: hooks
		} as BuildConfig
	})
)

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

// @todo ??
function getBanner(): string
{
	return `/**
 * @version @bitrix24/b24jssdk v${SDK_VERSION}
 * @copyright (c) ${COPYRIGHT_DATE} Bitrix24
 * @licence MIT
 * @links https://github.com/bitrix24/b24jssdk - GitHub
 * @links https://bitrix24.github.io/b24jssdk/ - Documentation
 */`
}

// @todo remove this
function getIntro(): string
{
	return `// TEST_STRING_v1 ////`;
}

// @todo remove this
function getOutro(): string
{
	return `// TEST_STRING_v2 ////`;
}