/**
 * Recipe 2 — Personalised IM notifications to CRM contacts
 *
 * 1. Loads contacts matching a CRM filter (one HTTP page, capped at 100).
 * 2. For each contact: builds a personal message from a template.
 * 3. Sends an IM notification (im.notify) to the contact's assigned manager.
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
  // typeId: 'CLIENT' for the standard CRM type list. Use crm.status.list type=CONTACT_TYPE for portal-specific values.
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
  const res = await $b24.callMethod('crm.item.list', {
    entityTypeId: EnumCrmEntityTypeId.contact,
    filter: CONFIG.filter,
    select: ['id', 'name', 'lastName', 'assignedById'],
    order: { id: 'asc' },
    start: 0
  })
  // crm.item.list payload: { items: [...] }
  const data = res.getData().result as { items: ContactRow[] }
  return (data.items ?? []).slice(0, CONFIG.maxContacts).map((c) => ({
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
  if (!c.assignedById) {
    throw new Error('contact has no assigned manager')
  }
  // im.notify works on every portal with IM enabled. type=4 is system notification.
  await $b24.callMethod('im.notify', {
    to: c.assignedById,
    message: `[Mailing] Contact: ${c.name} ${c.lastName}\n\n${body}`,
    type: 'SYSTEM'
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
      const reason = e instanceof AjaxError ? `${e.code}: ${e.description}` : (e as Error).message
      errors.push({ contact: fullName, reason })
      logger.warn(`[${sent + failed}/${contacts.length}] ${fullName} — failed: ${reason}`)
    }
    await sleep(CONFIG.delayBetweenMessages)
  }

  logger.info(`Done: sent=${sent}, failed=${failed}`)
  if (errors.length) logger.warn('Errors:', errors)
}

main().catch((e) => { logger.error(e); process.exit(1) })
