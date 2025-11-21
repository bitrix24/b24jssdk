import { defineCommand } from 'citty'
import contacts from './contacts.mjs'

export default defineCommand({
  meta: {
    name: 'make',
    description: 'Commands to create new Bitrix24 entities.'
  },
  subCommands: {
    contacts
  }
})
