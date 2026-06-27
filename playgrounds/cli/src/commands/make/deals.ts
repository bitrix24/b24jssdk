import { SdkError, EnumCrmEntityTypeId, EnumCrmEntityTypeShort } from '@bitrix24/b24jssdk'
import type { CommandObject } from '@bitrix24/b24jssdk'
import { defineCommand } from 'citty'
import 'dotenv/config'
import type { CatalogProduct, CrmCompany, CrmContact, CatalogCatalogItem, CatalogVatItem, CrmCurrency, DealStage, CrmSource } from '../../types'
import { THEMES_PRODUCTS, CLIENT_ERROR_STATUS } from '../../constants'
import { pickRandom, showProgress, randomInt, createB24Client, icon } from '../../utils'

/**
 * CLI command to mass generate deals in Bitrix24.
 *
 * Features:
 * - Randomly picks a company (legal entity) or a contact (individual)
 * - Random currency from available ones
 * - 1 to 4 random SKU products per deal
 * - VAT inclusion controlled by counterparty type (individual – included, legal – not included)
 * - Stage distribution: 30% first stage, 40% successful stage, 30% unsuccessful stage
 * - Random start and close dates
 * - English deal title generation
 * - Random source ID
 * - Batch processing for maximum performance
 *
 * @usage pnpm --filter @bitrix24/b24jssdk-cli dev make deals --total=150
 */

interface CatalogsListResult {
  result: { catalogs: CatalogCatalogItem[] }
}

interface VatListResult {
  result: { vats: CatalogVatItem[] }
}

interface CurrenciesListResult {
  result: CrmCurrency[]
}

interface StagesListResult {
  result: DealStage[]
}

interface SourcesListResult {
  result: CrmSource[]
}

interface CrmItemListResult {
  result: { items: Array<{ id: number, title?: string, name?: string, lastName?: string }> }
}

interface ProductsListResult {
  result: { products: Array<{ id: number, name: string, measure?: number, vatId?: number }> }
}

export default defineCommand({
  meta: {
    name: 'deals',
    description: 'Generate random deals in Bitrix24 with products, counterparties, and stages'
  },
  args: {
    total: { description: 'Number of deals to create', required: true },
    assignedById: { description: 'Assigned user ID', default: '1' },
    categoryId: { description: 'Sales funnel ID', default: '0' },
    maxProducts: { description: 'Maximum products per deal', default: '4' }
  },
  async setup({ args }) {
    const total = Number.parseInt(args.total, 10)
    if (Number.isNaN(total)) {
      throw new SdkError({
        code: 'PLAYGROUND_CLI_INVALID_ARG',
        description: `--total must be a valid integer, got: ${args.total}`,
        status: CLIENT_ERROR_STATUS
      })
    }
    const assignedById = Number.parseInt(args.assignedById, 10)
    if (Number.isNaN(assignedById)) {
      throw new SdkError({
        code: 'PLAYGROUND_CLI_INVALID_ARG',
        description: `--assignedById must be a valid integer, got: ${args.assignedById}`,
        status: CLIENT_ERROR_STATUS
      })
    }
    const categoryId = Number.parseInt(args.categoryId, 10)
    if (Number.isNaN(categoryId)) {
      throw new SdkError({
        code: 'PLAYGROUND_CLI_INVALID_ARG',
        description: `--categoryId must be a valid integer, got: ${args.categoryId}`,
        status: CLIENT_ERROR_STATUS
      })
    }
    const maxProductsRaw = Number.parseInt(args.maxProducts, 10)
    if (Number.isNaN(maxProductsRaw)) {
      throw new SdkError({
        code: 'PLAYGROUND_CLI_INVALID_ARG',
        description: `--maxProducts must be a valid integer, got: ${args.maxProducts}`,
        status: CLIENT_ERROR_STATUS
      })
    }

    const params = {
      total,
      assignedById,
      categoryId,
      maxProducts: Math.min(maxProductsRaw, 5)
    }

    let createdCount = 0

    const { b24, logger } = createB24Client('deals')

    async function fetchDictionaries() {
      logger.info(`${icon('🔍 ')}Loading reference data: currencies, stages, sources, companies, contacts, products...`)

      // Parallel requests for speed
      const [
        catResponse,
        vatResponse,
        currenciesResponse,
        stagesResponse,
        sourcesResponse,
        companiesResponse,
        contactsResponse
      ] = await Promise.all([
        b24.actions.v2.call.make({ method: 'catalog.catalog.list' }),
        b24.actions.v2.call.make({ method: 'catalog.vat.list' }),
        b24.actions.v2.call.make({ method: 'crm.currency.list' }),
        b24.actions.v2.call.make({ method: 'crm.status.list', params: { filter: { ENTITY_ID: categoryId > 0 ? `DEAL_STAGE_${categoryId}` : 'DEAL_STAGE' } } }),
        b24.actions.v2.call.make({ method: 'crm.status.list', params: { filter: { ENTITY_ID: 'SOURCE' } } }),
        b24.actions.v2.call.make({ method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id', 'title'], order: { ID: 'desc' } } }),
        b24.actions.v2.call.make({ method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.contact, select: ['id', 'name', 'lastName'], order: { ID: 'desc' } } })
      ])

      const catData = catResponse.getData() as CatalogsListResult | null
      const catalogs: CatalogCatalogItem[] = catData?.result?.catalogs ?? []
      if (!Array.isArray(catalogs) || catalogs.length === 0) {
        throw new SdkError({
          code: 'PLAYGROUND_CLI_ERROR',
          description: 'No catalogs found in Bitrix24. Please ensure a product catalog exists.',
          status: CLIENT_ERROR_STATUS
        })
      }

      const mainCatalog = catalogs.find(c => c.productIblockId === null)
      if (!mainCatalog || !mainCatalog.iblockId) {
        throw new SdkError({
          code: 'PLAYGROUND_CLI_ERROR',
          description: 'Unable to determine main catalog IBlock ID.',
          status: CLIENT_ERROR_STATUS
        })
      }
      const productIblockId = Number.parseInt(String(mainCatalog.iblockId), 10)

      const skuCatalog = catalogs.find(c => c.productIblockId === productIblockId || String(c.productIblockId) === String(productIblockId))
      if (!skuCatalog || !skuCatalog.iblockId) {
        throw new SdkError({
          code: 'PLAYGROUND_CLI_ERROR',
          description: 'Unable to determine sku catalog IBlock ID.',
          status: CLIENT_ERROR_STATUS
        })
      }
      const skuIblockId = Number.parseInt(String(skuCatalog.iblockId), 10)

      // vat
      const vatData = vatResponse.getData() as VatListResult | null
      const listTax: number[] = (vatData?.result?.vats ?? []).map(m => m.rate)
      if (listTax.length < 1) {
        throw new SdkError({
          code: 'PLAYGROUND_CLI_ERROR',
          description: 'Empty tax list',
          status: CLIENT_ERROR_STATUS
        })
      }

      // --- Currencies ---
      const currenciesData = currenciesResponse.getData() as CurrenciesListResult | null
      const currenciesRaw: CrmCurrency[] = currenciesData?.result ?? []
      if (!Array.isArray(currenciesRaw) || currenciesRaw.length === 0) {
        throw new SdkError({
          code: 'PLAYGROUND_CLI_ERROR',
          description: 'No currencies found. Make sure currencies exist in CRM.',
          status: CLIENT_ERROR_STATUS
        })
      }
      const currencies: string[] = currenciesRaw.map(c => c.CURRENCY)

      // --- Deal stages ---
      const stagesData = stagesResponse.getData() as StagesListResult | null
      const stagesRaw: DealStage[] = stagesData?.result ?? []
      if (!Array.isArray(stagesRaw) || stagesRaw.length === 0) {
        throw new SdkError({
          code: 'PLAYGROUND_CLI_ERROR',
          description: 'No deal stages found. Check your sales funnel.',
          status: CLIENT_ERROR_STATUS
        })
      }
      const stages: string[] = stagesRaw.map(s => s.STATUS_ID)

      // Determine which stages are considered successful/unsuccessful.
      // Default Bitrix24: 'WON' – success, 'LOSE' – failure. Everything else – in progress.
      const wonStageFound = stages.find(s => s === 'WON')
      if (!wonStageFound) {
        logger.warning('Canonical WON stage not found; falling back to first stage. Deal stages may be incorrect.')
      }
      const wonStage = wonStageFound ?? (stages[0] ?? '')

      const loseStageFound = stages.find(s => s === 'LOSE')
      if (!loseStageFound) {
        logger.warning('Canonical LOSE stage not found; falling back to last stage. Deal stages may be incorrect.')
      }
      const loseStage = loseStageFound ?? (stages[stages.length - 1] ?? '')

      const firstStage = stages[0] ?? ''

      // --- Deal sources ---
      const sourcesData = sourcesResponse.getData() as SourcesListResult | null
      const sourcesRaw: CrmSource[] = sourcesData?.result ?? []
      let sources: string[] = []
      if (Array.isArray(sourcesRaw) && sourcesRaw.length > 0) {
        sources = sourcesRaw.map(s => s.STATUS_ID)
      } else {
        logger.warning('No deal sources found, SOURCE_ID field will be empty', {})
      }

      // --- Companies ---
      const companiesData = companiesResponse.getData() as CrmItemListResult | null
      const companiesRaw = companiesData?.result?.items ?? []
      if (!Array.isArray(companiesRaw) || companiesRaw.length === 0) {
        throw new SdkError({
          code: 'PLAYGROUND_CLI_ERROR',
          description: 'No companies found. Create at least one company.',
          status: CLIENT_ERROR_STATUS
        })
      }
      const companies: CrmCompany[] = companiesRaw.map(c => ({
        id: c.id,
        title: c.title ?? 'Untitled'
      }))

      // --- Contacts ---
      const contactsData = contactsResponse.getData() as CrmItemListResult | null
      const contactsRaw = contactsData?.result?.items ?? []
      if (!Array.isArray(contactsRaw) || contactsRaw.length === 0) {
        throw new SdkError({
          code: 'PLAYGROUND_CLI_ERROR',
          description: 'No contacts found. Create at least one contact.',
          status: CLIENT_ERROR_STATUS
        })
      }
      const contacts: CrmContact[] = contactsRaw.map(c => ({
        id: c.id,
        name: c.name,
        lastName: c.lastName
      }))

      // --- Products (SKU) ---
      const productsResponse = await b24.actions.v2.call.make({
        method: 'catalog.product.list',
        params: {
          filter: { iblockId: skuIblockId, active: 'Y', available: 'Y' },
          select: ['iblockId', 'id', 'name', 'measure', 'vatId'],
          order: { ID: 'desc' }
        }
      })
      const productsData = productsResponse.getData() as ProductsListResult | null
      const productsRaw = productsData?.result?.products ?? []
      if (!Array.isArray(productsRaw) || productsRaw.length === 0) {
        throw new SdkError({
          code: 'PLAYGROUND_CLI_ERROR',
          description: 'No products (SKU) found. Create at least one product in the catalog.',
          status: CLIENT_ERROR_STATUS
        })
      }
      const products: CatalogProduct[] = productsRaw.map(p => ({
        id: p.id,
        name: p.name,
        measure: p.measure,
        vatId: p.vatId
      }))

      logger.info(`${icon('✅ ')}Reference data loaded`, {
        currencies: currencies.length,
        stages: stages.length,
        sources: sources.length,
        companies: companies.length,
        contacts: contacts.length,
        products: products.length
      })

      return {
        currencies,
        listTax,
        stages,
        firstStage,
        wonStage,
        loseStage,
        sources,
        companies,
        contacts,
        products
      }
    }

    // --- Generate deal title in English ---
    function generateDealTitle(): string {
      // Use theme words from constants
      const themes = THEMES_PRODUCTS
      const themeKeys = Object.keys(themes)
      const themeKey = pickRandom(themeKeys) as keyof typeof themes
      const dictionary = themes[themeKey]
      // Prefer English if available
      const lang = 'en'
      const words = dictionary[lang]
      if (words && words.length >= 2) {
        return `${pickRandom(words)} ${pickRandom(words)} Deal`
      }
      // Fallback
      return `Deal ${Math.floor(Math.random() * 10000)}`
    }

    // --- Generate random date in range ---
    function randomDate(start: Date, end: Date): Date {
      return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
    }

    // --- Main deal creation function ---
    async function createRandomDeals() {
      logger.notice(`${icon('🚀 ')}Starting random deal generation`)
      logger.notice(`${icon('📊 ')}Planned: ${params.total} deals`)
      logger.notice(`${icon('👤 ')}Responsible: user ID ${params.assignedById}`)
      logger.notice(`${icon('⚙  ')}Funnel ID: ${params.categoryId}`)
      logger.notice('─'.repeat(50))

      const healthCheckData = await b24.tools.healthCheck.make({ requestId: 'healthCheck' })
      logger.notice(`Health check: ${healthCheckData ? 'success' : 'fail'}`)
      if (!healthCheckData) {
        return
      }
      logger.notice('\n')

      const startTime = Date.now()
      const errors: string[] = []

      const dictionaries = await fetchDictionaries()

      // Batch parameters
      const MAX_BATCH_SIZE = 50
      let batchCommands: Record<string, CommandObject> = {}
      let commandsCount = 0
      let batchDealCount = 0 // deals added to current batch (for naming)

      // Helper to execute a batch
      async function flushBatch(dealCountInBatch: number) {
        if (commandsCount === 0) return

        try {
          const response = await b24.actions.v2.batch.make({
            calls: batchCommands,
            options: { isHaltOnError: true, returnAjaxResult: false }
          })
          if (!response.isSuccess) {
            errors.push(...response.getErrorMessages())
          } else {
            createdCount += dealCountInBatch
          }
        } catch (e) {
          errors.push(`Batch execution error: ${e}`)
        }
        showProgress(createdCount, params.total)
        // Reset
        batchCommands = {} as Record<string, CommandObject>
        commandsCount = 0
      }

      for (let i = 0; i < params.total; i++) {
        // --- Generate data for one deal ---
        // 1. Counterparty: company or contact (50/50)
        const useCompany = Math.random() < 0.5
        let companyId: number | undefined
        let contactId: number | undefined
        const contactType = useCompany ? 'company' : 'contact'
        if (useCompany) {
          companyId = pickRandom(dictionaries.companies).id
        } else {
          contactId = pickRandom(dictionaries.contacts).id
        }

        // 2. Choose currency
        const currency = pickRandom(dictionaries.currencies)

        // 3. Choose source if available
        const sourceId = dictionaries.sources.length > 0 ? pickRandom(dictionaries.sources) : undefined

        // 4. Determine stage according to distribution
        let stageId: string
        const r = Math.random()
        if (r < 0.3) {
          stageId = dictionaries.firstStage
        } else if (r < 0.7) {
          stageId = dictionaries.wonStage
        } else {
          stageId = dictionaries.loseStage
        }

        // 5. Generate dates
        const now = new Date()
        const twoYearsAgo = new Date()
        twoYearsAgo.setFullYear(now.getFullYear() - 2)

        const beginDate = randomDate(twoYearsAgo, now)
        const closeDate = new Date(beginDate)
        closeDate.setDate(beginDate.getDate() + randomInt(5, 120))

        const formatDate = (d: Date) => d.toISOString().split('T')[0] ?? d.toISOString()

        // 6. Generate title
        const title = generateDealTitle()

        // 7. Choose random products (1 to maxProducts)
        const numProducts = randomInt(1, params.maxProducts)
        const selectedProducts: CatalogProduct[] = []
        for (let j = 0; j < numProducts; j++) {
          const product = pickRandom(dictionaries.products)
          selectedProducts.push(product)
        }

        // 8. VAT inclusion: contact (individual) – Y, company – N
        const taxIncluded = contactType === 'contact' ? 'Y' : 'N'
        const taxRate = pickRandom(dictionaries.listTax)

        // --- Build batch commands ---
        // Deal creation command
        const dealCmdId = `deal_${batchDealCount}`
        const dealParams = {
          entityTypeId: EnumCrmEntityTypeId.deal,
          fields: {
            title,
            categoryId: params.categoryId,
            currencyId: currency,
            stageId,
            assignedById: params.assignedById,
            begindate: formatDate(beginDate),
            closedate: formatDate(closeDate),
            sourceId,
            ...(companyId ? { companyId } : {}),
            ...(contactId ? { contactId } : {})
          }
        }
        batchCommands[dealCmdId] = {
          method: 'crm.item.add',
          params: dealParams
        }
        commandsCount++

        // Product rows commands
        selectedProducts.forEach((product, idx) => {
          const productCmdId = `prod_${batchDealCount}_${idx}`
          batchCommands[productCmdId] = {
            method: 'crm.item.productrow.add',
            params: {
              fields: {
                ownerId: `$result[${dealCmdId}][item][id]`,
                ownerType: EnumCrmEntityTypeShort.deal,
                productId: product.id,
                quantity: randomInt(1, 10),
                // measureCode: product.measure,
                price: randomInt(500, 20000),
                taxIncluded,
                taxRate
              }
            }
          }
          commandsCount++
        })

        batchDealCount++

        // If batch limit reached or all deals created, execute
        if (commandsCount >= (MAX_BATCH_SIZE - 10) || i === params.total - 1) {
          await flushBatch(batchDealCount)
          batchDealCount = 0
        }
      }

      // Final batch if any leftovers
      await flushBatch(batchDealCount)

      const endTime = Date.now()
      const duration = ((endTime - startTime) / 1000).toFixed(2)

      logger.notice('\n')
      logger.notice('─'.repeat(50))
      logger.notice(`${icon('✅ ')}Completed!`)
      logger.notice(`${icon('📈 ')}Deals created: ${createdCount}`)
      logger.notice(`${icon('⏱️ ')}Total execution time: ${duration} seconds`)
      logger.notice(`${icon('📊 ')}Average time per deal: ${(Number(duration) / params.total).toFixed(2)} seconds`)

      if (errors.length > 0) {
        logger.notice(`${icon('❌ ')}Errors encountered: ${errors.length}`)
        logger.notice(`${icon('❌ ')}Errors`, {
          encountered: errors.length,
          first10: errors.slice(0, 10).map((error, index) => `${index + 1}. ${error}`)
        })
      } else {
        logger.notice(`${icon('🎉 ')}No errors encountered during creation process!`)
      }
    }

    await createRandomDeals()
  }
})
