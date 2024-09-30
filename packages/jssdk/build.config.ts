/**
 * @see https://github.com/nuxt/module-builder/blob/main/src/commands/build.ts
 */
import { existsSync, promises as fsp } from 'node:fs'
import { resolve } from 'pathe'

import { defineBuildConfig} from 'unbuild'

export default defineBuildConfig([
	{
		declaration: true,
		sourcemap: true,
		stub: false,
		outDir: 'dist',
		entries: ['./src/index'],
		rollup: {
			esbuild: {
				/**
				 * @todo on this
				 */
				//minify: true,
				target: 'esnext',
			},
			emitCJS: false,
			cjsBridge: true,
		},
		hooks: {
			async 'rollup:done'(ctx) {
				// Generate CommonJS stub
				await writeCJSStub(ctx.options.outDir)
			},
		}
	}
])

async function writeCJSStub(distDir: string) {
	const cjsStubFile = resolve(distDir, 'index.cjs')
	if (existsSync(cjsStubFile)) {
		return
	}
	const cjsStub = `module.exports = function(...args) {
  return import('./index.mjs').then(m => m.default.call(this, ...args))
}
`
	await fsp.writeFile(cjsStubFile, cjsStub, 'utf8')
}