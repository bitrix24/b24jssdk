import { defineConfig } from 'vitest/config'
import dotenv from 'dotenv'
import path from 'node:path'

dotenv.config({ quiet: true, path: path.resolve(__dirname, '.env.test') })

export default defineConfig({
  test: {
    globals: true,
    silent: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'jsSdk:integration',
          environment: 'node',
          testTimeout: 3000,
          hookTimeout: 3000,
          // @todo fix tis
          fileParallelism: false, // Disable parallel execution of tests
          include: ['./test/integration/**/*.spec.ts'],
          setupFiles: ['./test/0_setup/setup-integration-jssdk.ts']
        }
      }
      // @todo add this
      // {
      //   extends: true,
      //   test: {
      //     name: 'jsSdk:underLoad',
      //     environment: 'node',
      //     testTimeout: 30_000,
      //     hookTimeout: 30_000,
      //     fileParallelism: false, // Disable parallel execution of tests
      //     include: ['./test/under-load/**.spec.ts'],
      //     setupFiles: ['./test/0_setup/setup-under-load-jssdk.ts']
      //   }
      // }
    ]
  }
})
