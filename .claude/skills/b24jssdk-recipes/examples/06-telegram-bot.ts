/**
 * Recipe 6 — Telegram bot: notify a chat about new deals in CRM
 *
 * Polls crm.item.list every 2 minutes for deals with id > lastSeenDealId
 * and base stage NEW; for each new deal sends an HTML-formatted Telegram message.
 *
 * Install: pnpm add grammy node-cron
 * Env:
 *   B24_HOOK=https://your.bitrix24.com/rest/1/secret
 *   TELEGRAM_BOT_TOKEN=...   (from @BotFather)
 *   TELEGRAM_CHAT_ID=...     (chat to notify)
 * Run:
 *   npx tsx 06-telegram-bot.ts
 */

import {
  B24Hook,
  EnumCrmEntityTypeId,
  LoggerBrowser,
  type TypeB24
} from '@bitrix24/b24jssdk'
import { Bot } from 'grammy'
import cron from 'node-cron'

const logger = LoggerBrowser.build('TgBot', true)

function bootB24(): TypeB24 {
  const url = process.env.B24_HOOK
  if (!url) throw new Error('B24_HOOK env var is required')
  const $b24 = B24Hook.fromWebhookUrl(url)
  $b24.offClientSideWarning()
  return $b24
}

interface DealRow {
  id: number
  title: string
  opportunity: number
  currencyId: string
  contactId?: number
  createdTime: string
  stageId: string
}

let lastSeenDealId = 0

const baseStage = (s: string) => (s.includes(':') ? s.split(':')[1] : s)

async function fetchNewDeals($b24: TypeB24): Promise<DealRow[]> {
  const res = await $b24.actions.v2.call.make<{ items: DealRow[] }>({
    method: 'crm.item.list',
    params: {
      entityTypeId: EnumCrmEntityTypeId.deal,
      filter: { '>id': lastSeenDealId },
      select: ['id', 'title', 'opportunity', 'currencyId', 'contactId', 'createdTime', 'stageId'],
      order: { id: 'asc' }
    },
    requestId: 'new-deals'
  })

  if (!res.isSuccess) {
    logger.warn(`fetchNewDeals failed: ${res.getErrorMessages().join('; ')}`)
    return []
  }

  const items = res.getData()!.result.items ?? []
  // Multi-funnel: filter base stage client-side.
  return items.filter((d) => baseStage(d.stageId) === 'NEW')
}

async function fetchContactName($b24: TypeB24, contactId?: number): Promise<string> {
  if (!contactId) return 'Not set'

  const res = await $b24.actions.v2.call.make<{ item: { name?: string; lastName?: string } }>({
    method: 'crm.item.get',
    params: {
      entityTypeId: EnumCrmEntityTypeId.contact,
      id: contactId
    },
    requestId: `contact-${contactId}`
  })

  if (!res.isSuccess) return 'Failed to load'
  const c = res.getData()!.result.item
  return `${c.name ?? ''} ${c.lastName ?? ''}`.trim() || 'Anonymous'
}

function format(deal: DealRow, contactName: string): string {
  return [
    '🆕 <b>New deal</b>',
    '',
    `📋 <b>Title:</b> ${escape(deal.title)}`,
    `💰 <b>Amount:</b> ${deal.opportunity ?? 0} ${deal.currencyId ?? 'RUB'}`,
    `👤 <b>Contact:</b> ${escape(contactName)}`,
    `📅 <b>Created:</b> ${new Date(deal.createdTime).toLocaleString()}`,
    `🔗 <b>ID:</b> ${deal.id}`
  ].join('\n')
}

function escape(s: string): string {
  return s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))
}

async function tick($b24: TypeB24, bot: Bot, chatId: string) {
  logger.info(`[${new Date().toISOString()}] checking new deals…`)
  const deals = await fetchNewDeals($b24)
  if (deals.length === 0) { logger.info('  no new deals'); return }

  // Deals arrive in id-asc order (filter sets `order: { id: 'asc' }` and
  // `call.make` honours it). We advance lastSeenDealId only across the
  // contiguous prefix of successful sends — the moment one deal fails, we
  // stop advancing so the failed deal AND the rest get retried next tick.
  let sawFailure = false
  for (const d of deals) {
    try {
      const contact = await fetchContactName($b24, d.contactId)
      await bot.api.sendMessage(chatId, format(d, contact), { parse_mode: 'HTML' })
      logger.info(`Notified about deal #${d.id}`)
      if (!sawFailure) {
        lastSeenDealId = Math.max(lastSeenDealId, d.id)
      }
    } catch (e) {
      // Don't abort the whole tick — but also don't advance the cursor past
      // this deal (so it's retried next tick).
      sawFailure = true
      logger.warn(`Failed to notify about deal #${d.id}: ${(e as Error).message}`)
    }
  }
}

async function main() {
  const $b24 = bootB24()
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required')

  const bot = new Bot(token)

  // ctx is typed as `any` here because grammy ships its own Context type only
  // when the user actually installs the package. The recipe is opt-in.
  bot.command('start', (ctx: any) => ctx.reply('Bot ready. You will receive notifications about new CRM deals.'))
  bot.command('status', (ctx: any) => ctx.reply(`Last seen deal ID: ${lastSeenDealId}`))

  cron.schedule('*/2 * * * *', () => { tick($b24, bot, chatId).catch((e) => logger.error(e)) })

  await bot.start()
}

main().catch((e) => { logger.error(e); process.exit(1) })
