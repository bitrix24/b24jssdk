import { defineConfig } from 'vitest/config'
import dotenv from 'dotenv'
import path from 'node:path'

dotenv.config({ quiet: true, path: path.resolve(__dirname, '.env.test') })

export default defineConfig({
  test: {
    globals: true,
    silent: false,
    // reporters: [['tree', { summary: false }]],
    projects: [
      {
        extends: true,
        test: {
          name: 'jsSdk:integration',
          environment: 'node',
          testTimeout: 3000,
          hookTimeout: 3000,
          include: ['./test/integration/**/*.spec.ts'],
          setupFiles: ['./test/0_setup/setup-integration-jssdk.ts']
        }
      },
      {
        extends: true,
        test: {
          name: 'jsSdk:underLoad',
          environment: 'node',
          maxConcurrency: 10,
          testTimeout: 2400_000, // 40 min
          hookTimeout: 2400_000,
          fileParallelism: false,
          sequence: { shuffle: false },
          include: ['./test/under-load/**.spec.ts'],
          setupFiles: ['./test/0_setup/setup-under-load-jssdk.ts']
        }
      }
    ]
  }
})
