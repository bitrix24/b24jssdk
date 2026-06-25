import { defineCommand } from 'citty'
import tasks from './tasks'

export default defineCommand({
  meta: {
    name: 'list',
    description: 'Commands to read lists of Bitrix24 entities.'
  },
  subCommands: {
    tasks
  }
})
