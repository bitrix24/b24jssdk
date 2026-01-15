import { defineCommand } from 'citty'
/**
 * @todo remove this
 */
import testing from './testing.mjs'
import loadTesting from './load-testing.mjs'
import contacts from './contacts.mjs'
import companies from './companies.mjs'

export default defineCommand({
  meta: {
    name: 'make',
    description: 'Commands to create new Bitrix24 entities.'
  },
  subCommands: {
    testing,
    loadTesting,
    contacts,
    companies
  }
})
