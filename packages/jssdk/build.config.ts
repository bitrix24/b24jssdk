import { defineBuildConfig, type BuildConfig, type BuildContext } from 'unbuild'
import { type ModuleFormat } from 'rollup'

import packageInfo from './package.json'

const SDK_VERSION = packageInfo.version
const SDK_USER_AGENT = 'b24-js-sdk'
const COPYRIGHT_DATE = (new Date()).getFullYear()

export default defineBuildConfig(
  [
    'esm',
    'umd',
    'umd-min',
  ].map((formatTypeParam) => initConfig(formatTypeParam))
)

function initConfig(formatTypeParam: string): BuildConfig {
  const formatType = formatTypeParam.replace('-min', '') as ModuleFormat
  const isMinify = formatTypeParam.includes('-min')
  const outDir = `dist/${ formatType }`
  let declaration = true
  let sourcemap = true

  let emitCJS = true
  let cjsBridge = true
  let inlineDependencies = true

  let fileExtension: string
  const rollupExt = {
    output: {},
    resolve: {}
  }

  // eslint-disable-next-line
  let hooks: Record<string, Function> = {}

  switch (formatType) {
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
        preserveModules: false,
        inlineDynamicImports: false,
      }
      break
    case 'commonjs':
      fileExtension = 'cjs'
      emitCJS = true
      cjsBridge = true
      inlineDependencies = true
      break
    case 'umd':
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

  const entryFileNames = `[name]${ isMinify ? '.min' : '' }.${ fileExtension }`

  return {
    failOnWarn: false,
    name: `@bitrix24/b24jssdk-${ formatType }`,
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
}

/**
 * Return Replace Data
 * @return {Record<string, string>}
 */
function getReplaceData(): Record<string, string> {
  return {
    '__SDK_VERSION__': SDK_VERSION,
    '__SDK_USER_AGENT__': SDK_USER_AGENT,
  }
}

function getBanner(): string {
  return `/**
 * @version @bitrix24/b24jssdk v${ SDK_VERSION }
 * @copyright (c) ${ COPYRIGHT_DATE } Bitrix24
 * @licence MIT
 * @links https://github.com/bitrix24/b24jssdk - GitHub
 * @links https://bitrix24.github.io/b24jssdk/ - Documentation
 */`
}

function getIntro(): string {
  return ``;
}

function getOutro(): string {
  return ``;
}
