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
        // Сохраняем имена функций для отладки
        keepNames: true,
        // Минимизация только для production сборок
        minifyIdentifiers: isMinify,
        minifySyntax: isMinify,
        minifyWhitespace: isMinify
      },
      replace: {
        values: {
          __SDK_VERSION__: SDK_VERSION,
          __SDK_USER_AGENT__: SDK_USER_AGENT
        },
        preventAssignment: true // Важно для tree shaking
      },
      output: {
        format: formatType,
        name: 'B24Js',
        banner: getBanner(),
        // Экспортируем все именованные экспорты для лучшего tree shaking
        exports: 'named',
        // Сохраняем модульную структуру
        preserveModules: formatType === 'esm',
        preserveModulesRoot: 'src',
        // Генерируем sourcemap с исходным содержимым
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
            // Для ESM сохраняем комментарии (включая JSDoc)
            legalComments: 'external'
          },
          emitCJS: false,
          cjsBridge: false,
          inlineDependencies: false,
          output: {
            ...baseConfig.rollup.output,
            entryFileNames: '[name].mjs',
            chunkFileNames: '[name]-[hash].mjs',
            // Оптимизации для tree shaking
            hoistTransitiveImports: false,
            interop: 'auto'
            // -- extend: true,
            // -- esModule: true,
            // ??? не нужно сохранять модули
            // -- preserveModules: false,
            // -- inlineDynamicImports: false
          }
        },
        // Генерируем отдельные .d.ts файлы
        declarationOptions: {
          emitDeclarationOnly: false,
          // Компилируем все файлы для сохранения путей
          compilerOptions: {
            declaration: true,
            emitDeclarationOnly: false,
            declarationMap: true,
            // Сохраняем структуру каталогов
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
          emitCJS: true,
          cjsBridge: true,
          inlineDependencies: true,
          output: {
            ...baseConfig.rollup.output,
            entryFileNames: `index${isMinify ? '.min' : ''}.js`,
            compact: false,
            inlineDynamicImports: true,
            // Для UMD не нужно сохранять модули
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
