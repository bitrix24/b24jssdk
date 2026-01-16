import { defineConfig } from 'vitest/config'
import dotenv from 'dotenv'
import path from 'node:path'

dotenv.config({ quiet: true, path: path.resolve(__dirname, '.env.test') })

export default defineConfig({
  test: {
    testTimeout: 3000,
    hookTimeout: 3000,
    globals: true,
    silent: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'jsSdk',
          environment: 'node',
          include: [
            './test/jssdk/**.integration-spec.ts'
          ],
          setupFiles: ['./test/utils/setup-integration-jssdk.ts']
        }
      }
    ]
  }
})
