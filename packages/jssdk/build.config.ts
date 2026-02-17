import type { ModuleFormat } from 'rollup'
import type { BuildConfig } from 'unbuild'
import { defineBuildConfig } from 'unbuild'
import packageInfo from './package.json'

const SDK_VERSION = packageInfo.version
const SDK_USER_AGENT = 'b24-js-sdk'
const COPYRIGHT_DATE = new Date().getFullYear()

export default defineBuildConfig(
  ['esm', 'umd', 'umd-min'].map(formatTypeParam => initConfig(formatTypeParam))
)

function initConfig(formatTypeParam: string): BuildConfig {
  const formatType = formatTypeParam.replace('-min', '') as ModuleFormat
  const isMinify = formatTypeParam.includes('-min')
  const outDir = `dist/${formatType}`

  const baseConfig = {
    failOnWarn: false,
    name: `@bitrix24/b24jssdk-${formatType}`,
    outDir,
    rollup: {
      esbuild: {
        minify: isMinify,
        target: 'esnext',
        // Saving function names for debugging
        keepNames: true,
        // Minification only for production builds
        minifyIdentifiers: isMinify,
        minifySyntax: isMinify,
        minifyWhitespace: isMinify
      },
      replace: {
        values: {
          __SDK_VERSION__: SDK_VERSION,
          __SDK_USER_AGENT__: SDK_USER_AGENT
        },
        preventAssignment: true // Important for tree shaking
      },
      output: {
        format: formatType,
        name: 'B24Js',
        banner: getBanner(),
        // Export all named exports for better tree shaking
        exports: 'named',
        // Maintaining a modular structure
        preserveModules: formatType === 'esm',
        preserveModulesRoot: 'src',
        // Generate a sourcemap with the original content
        sourcemap: true,
        sourcemapExcludeSources: false
      } as any
    },
    hooks: {} as Record<string, () => {}>
  }

  switch (formatType) {
    case 'esm':
      return {
        ...baseConfig,
        entries: ['./src/index'],
        declaration: true,
        sourcemap: true,
        rollup: {
          ...baseConfig.rollup,
          esbuild: {
            ...baseConfig.rollup.esbuild,
            // For ESM, we preserve comments (including JSDoc)
            legalComments: 'external'
          },
          emitCJS: false,
          cjsBridge: false,
          inlineDependencies: false,
          output: {
            ...baseConfig.rollup.output,
            entryFileNames: '[name].mjs',
            chunkFileNames: '[name]-[hash].mjs',
            // Tree shaking optimizations
            hoistTransitiveImports: false,
            interop: 'auto'
            // -- extend: true,
            // -- esModule: true,
            // ??? no need to save modules
            // -- preserveModules: false,
            // -- inlineDynamicImports: false
          }
        },
        // Generating separate .d.ts files
        declarationOptions: {
          emitDeclarationOnly: false,
          // Compile all files to save paths
          compilerOptions: {
            declaration: true,
            emitDeclarationOnly: false,
            declarationMap: true,
            // Preserving the directory structure
            preserveSymlinks: true
          }
        }
      } as BuildConfig

    case 'umd':
      return {
        ...baseConfig,
        entries: ['./src/index'],
        declaration: false,
        sourcemap: true,
        rollup: {
          ...baseConfig.rollup,
          esbuild: {
            ...baseConfig.rollup.esbuild,
            minifyIdentifiers: false
          },
          emitCJS: true,
          cjsBridge: true,
          inlineDependencies: true,
          output: {
            ...baseConfig.rollup.output,
            entryFileNames: `index${isMinify ? '.min' : ''}.js`,
            compact: false,
            inlineDynamicImports: true,
            // For UMD there is no need to save modules
            preserveModules: false
            // -- extend: true,
            // -- esModule: false,
          },
          resolve: {
            browser: true,
            modulePaths: ['node_modules/**']
          }
        },
        hooks: {
          async 'build:prepare'(ctx) {
            ctx.pkg.dependencies = {}
            ctx.options.dependencies = []
          }
        }
      } as BuildConfig

    default:
      throw new Error(`Unknown format: ${formatType}`)
  }
}

function getBanner(): string {
  return `/**
 * @package @bitrix24/b24jssdk
 * @version ${SDK_VERSION}
 * @copyright (c) ${COPYRIGHT_DATE} Bitrix24
 * @license MIT
 * @see https://github.com/bitrix24/b24jssdk
 * @see https://bitrix24.github.io/b24jssdk/
 */`
}
