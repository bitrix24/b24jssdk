/**
 * Recipe 9 — Web search + LLM with citations, output written to a deal's timeline
 *
 * Bitrix24 REST has no native web search or LLM endpoint. This recipe shows
 * how to combine any external web-search + LLM provider with b24jssdk: ask
 * a question about a deal, search the web, run RAG with `[N]` citations,
 * and post the answer as a CRM timeline comment on the deal.
 *
 * Replace the search/llm calls with your provider of choice (Tavily, Brave,
 * Bitrix-search, OpenAI, Anthropic, …). Keys via env.
 *
 * Env:
 *   B24_HOOK=...
 *   SEARCH_API_KEY=...   (your web-search provider key)
 *   OPENAI_API_KEY=...
 * Run:
 *   npx tsx 09-web-search-llm.ts <DEAL_ID> "<question>"
 */

import {
  B24Hook,
  EnumCrmEntityTypeId,
  LoggerBrowser,
  type TypeB24
} from '@bitrix24/b24jssdk'
import OpenAI from 'openai'

const logger = LoggerBrowser.build('WebRag', true)

function bootB24(): TypeB24 {
  const url = process.env.B24_HOOK
  if (!url) throw new Error('B24_HOOK env var is required')
  const $b24 = B24Hook.fromWebhookUrl(url)
  $b24.offClientSideWarning()
  return $b24
}

interface SearchResult { id: number; title: string; url: string; content: string }

/**
 * Replace this stub with a real call to your search provider:
 *   - Tavily:    POST https://api.tavily.com/search
 *   - Brave:     GET  https://api.search.brave.com/res/v1/web/search
 *   - SerpAPI:   GET  https://serpapi.com/search
 */
async function webSearch(query: string): Promise<SearchResult[]> {
  // demo stub — REPLACE
  return [
    { id: 1, title: 'Example.com', url: 'https://example.com', content: `Stub article about "${query}".` }
  ]
}

async function askLlm(question: string, sources: SearchResult[]): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const sourcesBlock = sources.map((s) => `[${s.id}] ${s.title}\n${s.url}\n${s.content}`).join('\n\n')

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: 'Answer ONLY based on the sources below. Tag every fact with [N] where N is the id of the source.'
      },
      {
        role: 'user',
        content: `Question: ${question}\n\nSources:\n${sourcesBlock}`
      }
    ]
  })
  return completion.choices[0].message.content ?? ''
}

async function postTimelineComment($b24: TypeB24, dealId: number, comment: string) {
  // crm.timeline.comment.add — classic API, uppercase fields. Use the numeric
  // ENTITY_TYPE_ID (2 = deal, per EnumCrmEntityTypeId.deal): it is accepted on
  // every portal version we've seen. The string form (`ENTITY_TYPE: 'deal'`)
  // also works on most modern portals but a few older ones reject it with 400.
  await $b24.actions.v2.call.make({
    method: 'crm.timeline.comment.add',
    params: {
      fields: {
        ENTITY_ID: dealId,
        ENTITY_TYPE_ID: 2,  // EnumCrmEntityTypeId.deal — numeric is the safe default
        COMMENT: comment
      }
    },
    requestId: `timeline-${dealId}`
  })
}

async function main() {
  const dealId = Number(process.argv[2])
  const question = process.argv[3]
  if (!dealId || !question) {
    console.log('Usage: tsx 09-web-search-llm.ts <DEAL_ID> "<question>"')
    process.exit(1)
  }

  const $b24 = bootB24()

  const dealRes = await $b24.actions.v2.call.make<{ item: { id: number; title: string } }>({
    method: 'crm.item.get',
    params: {
      entityTypeId: EnumCrmEntityTypeId.deal,
      id: dealId
    },
    requestId: `deal-${dealId}`
  })
  if (!dealRes.isSuccess) throw new Error(dealRes.getErrorMessages().join('; '))
  const deal = dealRes.getData()!.result.item
  logger.info(`Deal #${dealId}: ${deal.title}`)

  logger.info('Searching the web…')
  const results = await webSearch(question)
  logger.info(`  ${results.length} sources`)

  logger.info('Asking the LLM…')
  const answer = await askLlm(question, results)
  console.log('\n--- ANSWER ---\n' + answer + '\n--------------\n')

  logger.info('Posting to deal timeline…')
  const sourcesList = results.map((s) => `[${s.id}] ${s.url}`).join('\n')
  await postTimelineComment(
    $b24,
    dealId,
    `Question: ${question}\n\n${answer}\n\nSources:\n${sourcesList}`
  )
  logger.info('Done.')
}

main().catch((e) => { logger.error(e); process.exit(1) })
