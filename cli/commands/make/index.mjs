import { defineCommand } from 'citty'
import contacts from './contacts.mjs'
import companies from './companies.mjs'

export default defineCommand({
  meta: {
    name: 'make',
    description: 'Commands to create new Bitrix24 entities.'
  },
  subCommands: {
    contacts,
    companies
  }
})
