#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import make from './commands/make'
import list from './commands/list'
import smokeRetry from './commands/smoke-retry'
import deferredBatch from './commands/deferred-batch'

const main = defineCommand({
  meta: {
    name: 'bitrix24-jsSdk',
    description: 'Bitrix24 JS SDK CLI'
  },
  subCommands: {
    make,
    list,
    'smoke-retry': smokeRetry,
    'deferred-batch': deferredBatch
  }
})

runMain(main)
