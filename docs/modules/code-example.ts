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
      try {
        const content = await fsp.readFile(filePath, 'utf-8')
        const parsed = parse(relativePath)
        const name = parsed.name

        examples[name] = {
          name,
          filePath,
          content,
          type: getFileType(filePath)
        }
      } catch (error) {
        console.error(`Error reading example ${filePath}:`, error)
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
