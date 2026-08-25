import { existsSync, readFileSync } from 'node:fs'
import fsp from 'node:fs/promises'
import { dirname, join, parse } from 'pathe'
import { defineNuxtModule, addTemplate, addServerHandler, createResolver } from '@nuxt/kit'

interface CodeExample {
  name: string
  filePath: string
  content: string
  type: 'ts' | 'js' | 'vue' | 'other'
}

export default defineNuxtModule({
  meta: {
    name: 'code-example'
  },
  async setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    let _configResolved: any
    let examples: Record<string, CodeExample>
    const outputPath = join(nuxt.options.buildDir, 'code-example')

    const exampleDirs = ['app/examples'].map(dir => join(nuxt.options.rootDir, dir))

    async function stubOutput() {
      if (existsSync(outputPath + '.mjs')) {
        return
      }
      await updateOutput('export default {}')
    }

    function getFileType(filePath: string): CodeExample['type'] {
      const ext = filePath.split('.').pop()?.toLowerCase()
      switch (ext) {
        case 'ts': return 'ts'
        case 'js': return 'js'
        case 'mjs': return 'js'
        case 'vue': return 'vue'
        default: return 'other'
      }
    }

    async function scanExamples() {
      examples = {}

      for (const dir of exampleDirs) {
        if (!existsSync(dir)) {
          continue
        }

        await scanDirectory(dir)
      }
    }

    async function scanDirectory(dir: string, relativePath = '') {
      const entries = await fsp.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        const currentRelative = relativePath ? join(relativePath, entry.name) : entry.name

        if (entry.isDirectory()) {
          await scanDirectory(fullPath, currentRelative)
        } else if (
          entry.name.endsWith('.ts')
          || entry.name.endsWith('.js')
          || entry.name.endsWith('.mjs')
          || entry.name.endsWith('.vue')
          || entry.name.endsWith('.md')
        ) {
          await addExample(fullPath, currentRelative)
        }
      }
    }

    async function addExample(filePath: string, relativePath: string) {
      // The catch is scoped to the read alone. It used to wrap the whole body,
      // which would have swallowed the duplicate-name error below and turned a
      // build failure back into a console line nobody reads.
      let content: string
      try {
        content = await fsp.readFile(filePath, 'utf-8')
      } catch (error) {
        console.error(`Error reading example ${filePath}:`, error)
        return
      }

      const name = parse(relativePath).name

      // Examples are keyed by basename because that is what a page writes
      // (`<CodeExample name="call-rest-api-ver2" />`) and what the API route
      // serves — `/api/code-examples/:name?` is a single segment, so a key
      // containing a slash could not be fetched even if it were stored.
      // `scanDirectory` recurses, though, so two files sharing a basename in
      // different subdirectories would quietly overwrite each other and a page
      // would show the wrong example (#139). Fail the build instead: silently
      // serving the wrong code is worse than not building.
      const existing = examples[name]
      if (existing) {
        throw new Error(
          `[code-example] duplicate example name "${name}":\n`
          + `  ${existing.filePath}\n  ${filePath}\n`
          + 'Examples are addressed by basename, so these would overwrite one '
          + 'another. Rename one of them.'
        )
      }

      examples[name] = {
        name,
        filePath,
        content,
        type: getFileType(filePath)
      }
    }

    const getStringifiedExamples = () => JSON.stringify(examples, null, 2)

    const getVirtualModuleContent = () => `export default ${getStringifiedExamples()}`

    async function updateOutput(content?: string) {
      const path = outputPath + '.mjs'

      if (!existsSync(dirname(path))) {
        await fsp.mkdir(dirname(path), { recursive: true })
      }
      await fsp.writeFile(path, content || getVirtualModuleContent(), 'utf-8')
    }

    // Initialization at startup
    nuxt.hook('build:before', async () => {
      await scanExamples()
      await stubOutput()
    })

    addTemplate({
      filename: 'code-example.mjs',
      getContents: () => 'export default {}',
      write: true
    })

    // Vite plugin for HMR
    nuxt.hook('vite:extend', (vite: any) => {
      vite.config.plugins = vite.config.plugins || []
      vite.config.plugins.push({
        name: 'code-example',
        enforce: 'post',
        async buildStart() {
          if (_configResolved?.build.ssr) {
            return
          }
          await updateOutput()
        },
        configResolved(config: any) {
          _configResolved = config
        },
        async handleHotUpdate({ file }: { file: string }) {
          // Check if the file is in one of the example folders
          const isExampleFile = exampleDirs.some(dir => file.startsWith(dir))
          if (isExampleFile) {
            const relativePath = file.replace(/^.*app\/examples\//, '')
            await addExample(file, relativePath)
            await updateOutput()
          }
        }
      })
    })

    // Nitro virtual module
    nuxt.hook('nitro:config', (nitroConfig) => {
      nitroConfig.virtual = nitroConfig.virtual || {}
      nitroConfig.virtual['#code-example/nitro'] = () =>
        readFileSync(
          join(nuxt.options.buildDir, 'code-example.mjs'),
          'utf-8'
        )
    })

    // Additional endpoint to get by path
    addServerHandler({
      method: 'get',
      route: '/api/code-examples/:name?',
      handler: resolver.resolve('../server/api/code-examples.get')
    })
  }
})
