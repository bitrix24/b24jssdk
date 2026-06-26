import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ModuleFormat } from 'rollup'
import type { BuildConfig } from 'unbuild'
import { defineBuildConfig } from 'unbuild'
import packageInfo from './package.json'

const SDK_VERSION = packageInfo.version
const SDK_USER_AGENT = 'b24-js-sdk'
const COPYRIGHT_DATE = new Date().getFullYear()

export default defineBuildConfig(
  ['esm', 'cjs', 'umd', 'umd-min'].map(formatTypeParam => initConfig(formatTypeParam))
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
        preserveModules: formatType === 'esm' || formatType === 'cjs',
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

    case 'cjs':
      // First-class CommonJS build: same modular structure as ESM but emitted
      // as `.cjs` with dependencies kept EXTERNAL (`require('axios')` etc.),
      // unlike the UMD bundle which inlines them. This is the `require()` target
      // (#258). A single rollup pass writes `.cjs` (format from baseConfig);
      // the `build:done` hook below produces the `index.d.cts` that
      // `exports.require.types` points at.
      return {
        ...baseConfig,
        entries: ['./src/index'],
        declaration: true,
        sourcemap: true,
        rollup: {
          ...baseConfig.rollup,
          esbuild: {
            ...baseConfig.rollup.esbuild,
            legalComments: 'external'
          },
          // NB: do NOT set `emitCJS` here. The rollup `output.format` already
          // comes from `baseConfig` (`format: formatType` === 'cjs'), so a
          // single rollup pass emits CommonJS. `emitCJS: true` would ADD a
          // second cjs output on top of that — building every file twice.
          emitCJS: false,
          cjsBridge: false,
          inlineDependencies: false,
          output: {
            ...baseConfig.rollup.output,
            // explicit for clarity (already 'cjs' via baseConfig formatType)
            format: 'cjs',
            entryFileNames: '[name].cjs',
            chunkFileNames: '[name]-[hash].cjs',
            hoistTransitiveImports: false,
            // ESM-only deps are interop'd for CommonJS consumers
            interop: 'auto'
          }
        },
        declarationOptions: {
          emitDeclarationOnly: false,
          compilerOptions: {
            declaration: true,
            emitDeclarationOnly: false,
            declarationMap: true,
            preserveSymlinks: true
          }
        },
        hooks: {
          // Without `emitCJS` rollup-plugin-dts emits `index.d.ts` / `.d.mts`
          // but not `.d.cts`. The emitted `index.d.ts` is a single self-contained
          // declaration (no relative re-exports), so it is valid verbatim as the
          // `.d.cts` that `exports.require.types` resolves to — copy it (dropping
          // the declaration-map pointer, which has no matching `.d.cts.map`).
          async 'build:done'(ctx) {
            const cjsDir = resolve(ctx.options.outDir)
            const dts = await readFile(resolve(cjsDir, 'index.d.ts'), 'utf8')
            await writeFile(
              resolve(cjsDir, 'index.d.cts'),
              dts.replace(/\n\/\/# sourceMappingURL=.*$/m, '\n')
            )
          }
        } as Record<string, () => {}>
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
          },
          // The UMD bundle is the browser `<script>` / unpkg / jsdelivr target
          // (deps inlined). `require()` is now served by the first-class `cjs`
          // build (external deps) — see the `cjs` config above and #258.
          //
          // We still drop a `dist/umd/package.json` with `"type": "commonjs"`:
          // the root package is `"type": "module"`, so a bare `.js` file in
          // `dist/umd` would otherwise be parsed as ESM. This keeps the UMD
          // bundle loadable as CommonJS for anyone pointing a `<script>` /
          // bundler directly at `dist/umd/index.js`.
          async 'build:done'(ctx) {
            const umdDir = resolve(ctx.options.outDir)
            await mkdir(umdDir, { recursive: true })
            await writeFile(
              resolve(umdDir, 'package.json'),
              `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`
            )
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
