#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import make from './commands/make/index.mjs'

const main = defineCommand({
  meta: {
    name: 'bitrix24-jsSdk',
    description: 'Bitrix24 JS SDK CLI'
  },
  subCommands: {
    make
  }
})

runMain(main)
