/**
 * Recipe 4 — Two-way contact sync between Bitrix24 and an external ERP
 *
 * Matches contacts on INN (primary) or email (fallback). Creates missing
 * records on each side and updates changed fields. Cron every hour.
 * The ERP side is mocked — replace fetchErpContacts/createErpContact with
 * your real client.
 *
 * Install: pnpm add node-cron
 * Run:
 *   B24_HOOK=https://your.bitrix24.com/rest/1/secret npx tsx 04-erp-sync.ts
 */

import {
  B24Hook,
  EnumCrmEntityTypeId,
  ConsoleV2Handler,
  LogLevel,
  Logger,
  type TypeB24
} from '@bitrix24/b24jssdk'
import cron from 'node-cron'

const logger = Logger.create('ErpSync')
logger.pushHandler(new ConsoleV2Handler(LogLevel.INFO, { useStyles: false }))

function bootB24(): TypeB24 {
  const url = process.env.B24_HOOK
  if (!url) throw new Error('B24_HOOK env var is required')
  const $b24 = B24Hook.fromWebhookUrl(url)
  $b24.offClientSideWarning()
  return $b24
}

// === Mock ERP — replace with real client ===
interface ErpContact {
  id: string
  name: string
  lastName: string
  email: string
  phone: string
  inn: string
  company: string
}

function fetchErpContacts(): ErpContact[] {
  return [
    { id: 'erp-001', name: 'Иван',    lastName: 'Петров',   email: 'petrov@example.com',   phone: '+79001234567', inn: '7701234567', company: 'OOO Romashka' },
    { id: 'erp-002', name: 'Мария',   lastName: 'Сидорова', email: 'sidorova@example.com', phone: '+79009876543', inn: '7709876543', company: 'IP Sidorova' },
    { id: 'erp-003', name: 'Алексей', lastName: 'Козлов',   email: 'kozlov@example.com',   phone: '+79005551234', inn: '7705551234', company: 'AO Beryozka' }
  ]
}

function createErpContact(c: BitrixContact): { id: string } {
  logger.info(`  [ERP] created ${c.name} ${c.lastName}`)
  return { id: `erp-${Date.now()}` }
}
// === /mock ===

interface BitrixContactRaw {
  id: number
  name?: string
  lastName?: string
  email?: Array<{ VALUE: string; VALUE_TYPE: string }> | string
  phone?: Array<{ VALUE: string; VALUE_TYPE: string }> | string
  ufCrmInn?: string
}

interface BitrixContact {
  id: number
  name: string
  lastName: string
  email: string
  phone: string
  ufCrmInn?: string
}

async function fetchBitrixContacts($b24: TypeB24): Promise<BitrixContact[]> {
  const out: BitrixContact[] = []

  const generator = $b24.actions.v2.fetchList.make<BitrixContactRaw>({
    method: 'crm.item.list',
    params: {
      entityTypeId: EnumCrmEntityTypeId.contact,
      select: ['id', 'name', 'lastName', 'email', 'phone', 'ufCrmInn']
    },
    idKey: 'id',
    customKeyForResult: 'items',
    requestId: 'load-contacts'
  })

  for await (const chunk of generator) {
    for (const c of chunk) {
      const email = Array.isArray(c.email) ? c.email[0]?.VALUE ?? '' : (c.email ?? '')
      const phone = Array.isArray(c.phone) ? c.phone[0]?.VALUE ?? '' : (c.phone ?? '')
      out.push({
        id: Number(c.id),
        name: c.name ?? '',
        lastName: c.lastName ?? '',
        email,
        phone,
        ufCrmInn: c.ufCrmInn
      })
    }
  }
  return out
}

async function createBitrixContact($b24: TypeB24, e: ErpContact): Promise<number> {
  const res = await $b24.actions.v2.call.make<{ item: { id: number } }>({
    method: 'crm.item.add',
    params: {
      entityTypeId: EnumCrmEntityTypeId.contact,
      fields: {
        name: e.name,
        lastName: e.lastName,
        email: [{ VALUE: e.email, VALUE_TYPE: 'WORK' }],
        phone: [{ VALUE: e.phone, VALUE_TYPE: 'WORK' }],
        ufCrmInn: e.inn,
        sourceId: 'OTHER',
        sourceDescription: `Imported from ERP (${e.id})`
      }
    },
    requestId: `create-contact-${e.id}`
  })

  if (!res.isSuccess) throw new Error(res.getErrorMessages().join('; '))

  const id = Number(res.getData()!.result.item.id)
  logger.info(`  [B24] created ${e.name} ${e.lastName} → id=${id}`)
  return id
}

async function updateBitrixContact($b24: TypeB24, id: number, fields: Record<string, unknown>) {
  await $b24.actions.v2.call.make({
    method: 'crm.item.update',
    params: {
      entityTypeId: EnumCrmEntityTypeId.contact,
      id,
      fields
    },
    requestId: `update-contact-${id}`
  })
  logger.info(`  [B24] updated #${id}: ${JSON.stringify(fields)}`)
}

interface MatchResult {
  matched: { bitrix: BitrixContact; erp: ErpContact }[]
  onlyInBitrix: BitrixContact[]
  onlyInErp: ErpContact[]
}

function match(bx: BitrixContact[], erp: ErpContact[]): MatchResult {
  const byInn = new Map<string, BitrixContact>()
  const byEmail = new Map<string, BitrixContact>()
  for (const b of bx) {
    if (b.ufCrmInn) byInn.set(b.ufCrmInn, b)
    if (b.email) byEmail.set(b.email.toLowerCase(), b)
  }

  const matched: MatchResult['matched'] = []
  const onlyInErp: ErpContact[] = []
  const matchedIds = new Set<number>()

  for (const e of erp) {
    const hit = byInn.get(e.inn) ?? byEmail.get(e.email.toLowerCase())
    if (hit) {
      matched.push({ bitrix: hit, erp: e })
      matchedIds.add(hit.id)
    } else {
      onlyInErp.push(e)
    }
  }

  const onlyInBitrix = bx.filter((b) => !matchedIds.has(b.id))
  return { matched, onlyInBitrix, onlyInErp }
}

async function syncMatched($b24: TypeB24, b: BitrixContact, e: ErpContact): Promise<boolean> {
  const updates: Record<string, unknown> = {}
  if (b.name !== e.name) updates.name = e.name
  if (b.lastName !== e.lastName) updates.lastName = e.lastName
  if (Object.keys(updates).length === 0) return false
  await updateBitrixContact($b24, b.id, updates)
  return true
}

async function synchronise($b24: TypeB24) {
  const t0 = Date.now()
  logger.info(`\n=== Sync ${new Date().toISOString()} ===`)

  const [bx, erp] = await Promise.all([fetchBitrixContacts($b24), Promise.resolve(fetchErpContacts())])
  logger.info(`  Bitrix24: ${bx.length}, ERP: ${erp.length}`)

  const { matched, onlyInBitrix, onlyInErp } = match(bx, erp)
  logger.info(`  matched=${matched.length}, onlyB24=${onlyInBitrix.length}, onlyErp=${onlyInErp.length}`)

  // Per-side counters: a single `created` would obscure where rows landed
  // (was it B24 falling behind, or ERP?).
  let createdInB24 = 0
  let createdInErp = 0
  let updated = 0

  for (const e of onlyInErp) { await createBitrixContact($b24, e); createdInB24++ }
  for (const b of onlyInBitrix) { createErpContact(b); createdInErp++ }
  for (const m of matched) { if (await syncMatched($b24, m.bitrix, m.erp)) updated++ }

  logger.info(`  done: created.b24=${createdInB24}, created.erp=${createdInErp}, updated=${updated}, ${(Date.now() - t0) / 1000}s`)
}

async function main() {
  const $b24 = bootB24()
  await synchronise($b24)
  cron.schedule('0 * * * *', () => { synchronise($b24).catch((e: unknown) => logger.error(e instanceof Error ? e.message : String(e), {})) })
  logger.info('Cron scheduled: every hour at :00')
}

main().catch((e: unknown) => {
  // Raw console.error so structured-logger formatting can't hide the trace.
  console.error('\n[recipe failed]', e instanceof Error ? `${e.name}: ${e.message}` : String(e))
  if (e instanceof Error && e.stack) console.error(e.stack)
  process.exit(1)
})
