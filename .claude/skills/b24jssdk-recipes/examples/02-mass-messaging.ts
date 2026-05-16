/**
 * Recipe 2 — Personalised IM notifications to CRM contacts
 *
 * 1. Loads up to 100 contacts that match a filter (one HTTP call, no paging).
 * 2. For each contact: personalises a template.
 * 3. Sends an IM system notification (im.notify) to the contact's assigned manager.
 *
 * Run:
 *   B24_HOOK=https://your.bitrix24.com/rest/1/secret npx tsx 02-mass-messaging.ts
 */

import {
  AjaxError,
  B24Hook,
  EnumCrmEntityTypeId,
  LoggerBrowser,
  type TypeB24
} from '@bitrix24/b24jssdk'

const logger = LoggerBrowser.build('MassMail', true)

function bootB24(): TypeB24 {
  const url = process.env.B24_HOOK
  if (!url) throw new Error('B24_HOOK env var is required')
  const $b24 = B24Hook.fromWebhookUrl(url)
  $b24.offClientSideWarning?.()
  return $b24
}

const TEMPLATE = `Hello, {{NAME}}!

We've updated our partnership terms. The new pricing is effective starting next month.
Reach out to your manager or visit our site for details.

— Sales`

const CONFIG = {
  filter: { typeId: 'CLIENT' as string | string[] },
  delayBetweenMessages: 1000,
  maxContacts: 100
}

interface ContactRow {
  id: number
  name: string
  lastName: string
  assignedById: number
}

async function loadContacts($b24: TypeB24): Promise<ContactRow[]> {
  // Single page (no paging). Filter narrows the result, max 50 in one v2 call
  // by default. For >50 contacts, swap to actions.v2.callList.make.
  const response = await $b24.actions.v2.call.make<{ items: ContactRow[] }>({
    method: 'crm.item.list',
    params: {
      entityTypeId: EnumCrmEntityTypeId.contact,
      filter: CONFIG.filter,
      select: ['id', 'name', 'lastName', 'assignedById'],
      order: { id: 'asc' }
    },
    requestId: 'load-contacts'
  })

  if (!response.isSuccess) {
    throw new Error(`Failed to load contacts: ${response.getErrorMessages().join('; ')}`)
  }

  const items = response.getData()!.result.items ?? []
  return items.slice(0, CONFIG.maxContacts).map((c) => ({
    id: Number(c.id),
    name: c.name ?? '',
    lastName: c.lastName ?? '',
    assignedById: Number(c.assignedById ?? 0)
  }))
}

function personalise(template: string, c: ContactRow): string {
  const fullName = [c.name, c.lastName].filter(Boolean).join(' ') || 'there'
  return template.replaceAll('{{NAME}}', fullName)
}

async function notifyManager($b24: TypeB24, c: ContactRow, body: string) {
  if (!c.assignedById) throw new Error('contact has no assigned manager')

  await $b24.actions.v2.call.make({
    method: 'im.notify',
    params: {
      to: c.assignedById,
      message: `[Mailing] Contact: ${c.name} ${c.lastName}\n\n${body}`,
      type: 'SYSTEM'
    },
    requestId: `notify-${c.id}`
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const $b24 = bootB24()
  logger.info(`Filter: ${JSON.stringify(CONFIG.filter)}`)

  const contacts = await loadContacts($b24)
  logger.info(`Found ${contacts.length} contacts`)
  if (contacts.length === 0) return

  let sent = 0
  let failed = 0
  const errors: { contact: string; reason: string }[] = []

  for (const c of contacts) {
    const fullName = `${c.name} ${c.lastName}`.trim()
    try {
      await notifyManager($b24, c, personalise(TEMPLATE, c))
      sent++
      logger.info(`[${sent}/${contacts.length}] ${fullName} — sent`)
    } catch (e) {
      failed++
      const reason = e instanceof AjaxError ? `${e.code}: ${e.message}` : (e as Error).message
      errors.push({ contact: fullName, reason })
      logger.warn(`[${sent + failed}/${contacts.length}] ${fullName} — failed: ${reason}`)
    }
    await sleep(CONFIG.delayBetweenMessages)
  }

  logger.info(`Done: sent=${sent}, failed=${failed}`)
  if (errors.length) logger.warn('Errors:', errors)
}

main().catch((e) => { logger.error(e); process.exit(1) })
