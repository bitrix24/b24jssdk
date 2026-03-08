import { defineCommand } from 'citty'
import companies from './companies'
import contacts from './contacts'
import tasks from './tasks'
import productsSku from './products-sku'

export default defineCommand({
  meta: {
    name: 'make',
    description: 'Commands to create new Bitrix24 entities.'
  },
  subCommands: {
    companies,
    contacts,
    tasks,
    'products-sku': productsSku
  }
})
