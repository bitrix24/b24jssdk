import type { BatchCommandsArrayUniversal } from '@bitrix24/b24jssdk'
import { B24Hook, EnumCrmEntityTypeId, LoggerFactory } from '@bitrix24/b24jssdk'

type Contact = {
  id: number
  name: string
  lastName: string
}

const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)
const $logger = LoggerFactory.createForBrowser('Example:BatchObject', devMode)
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

try {
  // First, we get all the contacts that need to be updated.
  const contactResponse = await $b24.callFastListMethod<Contact>('crm.item.list', {
    entityTypeId: EnumCrmEntityTypeId.contact,
    filter: { '=sourceId': 'WEBFORM' }, // Contacts from web forms
    select: ['id', 'name', 'lastName', 'sourceId']
  }, 'id', 'items')

  if (!contactResponse.isSuccess) {
    throw new Error(`Failed to retrieve contact list: ${contactResponse.getErrorMessages().join('; ')}`)
  }

  const contacts: Contact[] = contactResponse.getData() || []

  if (contacts.length === 0) {
    $logger.warning('No contacts to update')
  } else {
    $logger.info(`Contacts found for update: ${contacts.length}`)

    // Create commands to update each contact
    const updateCalls: BatchCommandsArrayUniversal<string, Record<string, any>> = contacts.map(contact => [
      'crm.item.update',
      {
        entityTypeId: EnumCrmEntityTypeId.contact,
        id: contact.id,
        fields: {
          // Example: Adding a prefix to a name
          name: `[UPDATED] ${(contact.name || '').replace('[UPDATED] ', '')}`.trim(),
          comments: `Automatic update from ${new Date().toLocaleDateString('en')}`
        }
      }
    ])

    // We perform the update in chunks
    const response = await $b24.callBatchByChunk<{ item: Contact }>(updateCalls, { isHaltOnError: false }) // Continue with errors

    if (!response.isSuccess) {
      throw new Error(`API Error: ${response.getErrorMessages().join('; ')}`)
    }

    const data = response.getData()!
    const updatedContactIds: number[] = []
    data.forEach((chunkRow) => {
      updatedContactIds.push(chunkRow.item.id)
    })

    $logger.info('Contacts with ID updated', {
      length: updatedContactIds.length,
      updatedContactIds: updatedContactIds.join(', ')
    })
  }
} catch (error) {
  $logger.error('some error', { error })
}
