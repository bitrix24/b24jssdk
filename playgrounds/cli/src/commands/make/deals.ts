import { B24Hook, Logger, LogLevel, ConsoleV2Handler, ParamsFactory, EnumCrmEntityTypeId, EnumCrmEntityTypeShort } from '@bitrix24/b24jssdk'
import { defineCommand } from 'citty'
import 'dotenv/config'
import type { CatalogProduct, CrmCompany, CrmContact } from '../../types'
import { THEMES_PRODUCTS } from '../../constants'
import { pickRandom, showProgress, randomInt } from '../../utils'

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
    const params = {
      total: Number.parseInt(args.total),
      assignedById: Number.parseInt(args.assignedById),
      categoryId: Number.parseInt(args.categoryId),
      maxProducts: Math.min(Number.parseInt(args.maxProducts), 5)
    }

    let createdCount = 0

    // region Logger ////
    const logger = Logger.create('deals')
    const handler = new ConsoleV2Handler(LogLevel.DEBUG, { useStyles: false })
    logger.pushHandler(handler)
    // endregion Logger ////

    // Initialize Bitrix24 connection
    const hookPath = process.env.B24_HOOK ?? ''
    if (!hookPath) {
      logger.emergency('🚨 B24_HOOK environment variable is not set! Please configure it in your .env file')
      process.exit(1)
    }

    const b24 = B24Hook.fromWebhookUrl(hookPath, { restrictionParams: ParamsFactory.getBatchProcessing() })
    logger.info('Connected to Bitrix24', { target: b24.getTargetOrigin() })

    const loggerForDebugB24 = Logger.create('b24')
    const handlerForDebugB24 = new ConsoleV2Handler(LogLevel.ERROR, { useStyles: false })
    loggerForDebugB24.pushHandler(handlerForDebugB24)

    b24.setLogger(loggerForDebugB24)

    async function fetchDictionaries() {
      logger.info('🔍 Loading reference data: currencies, stages, sources, companies, contacts, products...')

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
        b24.actions.v2.call.make({ method: 'crm.status.list', params: { filter: { ENTITY_ID: params.categoryId > 0 ? `DEAL_STAGE_${params.categoryId}` : 'DEAL_STAGE' } } }),
        b24.actions.v2.call.make({ method: 'crm.status.list', params: { filter: { ENTITY_ID: 'SOURCE' } } }),
        b24.actions.v2.call.make({ method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id', 'title'], order: { ID: 'desc' } } }),
        b24.actions.v2.call.make({ method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.contact, select: ['id', 'name', 'lastName'], order: { ID: 'desc' } } })
      ])

      const catalogs = ((catResponse.getData() || {}).result as any)?.catalogs || []
      if (!catalogs || !Array.isArray(catalogs) || catalogs.length === 0) {
        logger.error('No catalogs found in Bitrix24. Please ensure a product catalog exists.', {
          responseData: ((catResponse.getData() || {})?.result as any)?.catalogs
        })
        process.exit(1)
      }

      const mainCatalog = catalogs.find((c: any) => c.productIblockId === null)
      if (!mainCatalog || !mainCatalog.iblockId) {
        logger.error('Unable to determine main catalog IBlock ID.', {
          catalogs
        })
        process.exit(1)
      }
      const productIblockId = Number.parseInt(mainCatalog.iblockId)

      const skuCatalog = catalogs.find((c: any) => c.productIblockId === productIblockId)
      if (!skuCatalog || !skuCatalog.iblockId) {
        logger.error('Unable to determine sku catalog IBlock ID.', {
          catalogs
        })
        process.exit(1)
      }
      const skuIblockId = Number.parseInt(skuCatalog.iblockId)

      // vat
      const listTax = (((vatResponse.getData() || {}).result as any)?.vats || []).map((m: any) => m.rate)
      if (!listTax || listTax.length < 1) {
        logger.error('Empty tax list', {})
        process.exit(1)
      }

      // --- Currencies ---
      const currenciesData = (currenciesResponse.getData() as any)?.result || []
      if (!Array.isArray(currenciesData) || currenciesData.length === 0) {
        logger.error('No currencies found. Make sure currencies exist in CRM.', {})
        process.exit(1)
      }
      const currencies: string[] = currenciesData.map((c: any) => c.CURRENCY)

      // --- Deal stages ---
      const stagesData = (stagesResponse.getData() as any)?.result || []
      if (!Array.isArray(stagesData) || stagesData.length === 0) {
        logger.error('No deal stages found. Check your sales funnel.', {})
        process.exit(1)
      }
      const stages: string[] = stagesData.map((s: any) => s.STATUS_ID)

      // Determine which stages are considered successful/unsuccessful.
      // Default Bitrix24: 'WON' – success, 'LOSE' – failure. Everything else – in progress.
      const wonStage = stages.find(s => s === 'WON') || stages[0]
      const loseStage = stages.find(s => s === 'LOSE') || stages[stages.length - 1]
      const firstStage = stages[0]

      // --- Deal sources ---
      const sourcesData = (sourcesResponse.getData() as any)?.result || []
      let sources: string[] = []
      if (Array.isArray(sourcesData) && sourcesData.length > 0) {
        sources = sourcesData.map((s: any) => s.STATUS_ID)
      } else {
        logger.warning('No deal sources found, SOURCE_ID field will be empty', {})
      }

      // --- Companies ---
      const companiesData = (companiesResponse.getData() as any)?.result?.items || []
      if (!Array.isArray(companiesData) || companiesData.length === 0) {
        logger.error('No companies found. Create at least one company.', {})
        process.exit(1)
      }
      const companies: CrmCompany[] = companiesData.map((c: any) => ({
        id: c.id,
        title: c.title || 'Untitled'
      }))

      // --- Contacts ---
      const contactsData = (contactsResponse.getData() as any)?.result?.items || []
      if (!Array.isArray(contactsData) || contactsData.length === 0) {
        logger.error('No contacts found. Create at least one contact.', {})
        process.exit(1)
      }
      const contacts: CrmContact[] = contactsData.map((c: any) => ({
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
        } })
      const productsData = (productsResponse.getData() as any)?.result?.products || []
      if (!Array.isArray(productsData) || productsData.length === 0) {
        logger.error('No products (SKU) found. Create at least one product in the catalog.', {})
        process.exit(1)
      }
      const products: CatalogProduct[] = productsData.map((p: any) => ({
        id: p.id,
        name: p.name,
        measure: p.measure,
        vatId: p.vatId
      }))

      logger.info('✅ Reference data loaded', {
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
      logger.notice('🚀 Starting random deal generation')
      logger.notice(`📊 Planned: ${params.total} deals`)
      logger.notice(`👤 Responsible: user ID ${params.assignedById}`)
      logger.notice(`⚙  Funnel ID: ${params.categoryId}`)
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
      let batchCommands: Record<string, any> = {}
      let commandsCount = 0

      // Helper to execute a batch
      async function flushBatch() {
        if (commandsCount === 0) return

        try {
          const response = await b24.actions.v2.batch.make({
            calls: batchCommands,
            options: { isHaltOnError: true, returnAjaxResult: false }
          })
          if (!response.isSuccess) {
            errors.push(...response.getErrorMessages())
          }
        } catch (e) {
          errors.push(`Batch execution error: ${e}`)
        }
        // Reset
        batchCommands = {}
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

        const formatDate = (d: Date) => d.toISOString().split('T')[0]

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
        const dealCmdId = `deal_${createdCount}`
        const dealParams: any = {
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
          const productCmdId = `prod_${createdCount}_${idx}`
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

        createdCount++

        showProgress(createdCount, params.total)

        // If batch limit reached or all deals created, execute
        if (commandsCount >= (MAX_BATCH_SIZE - 10) || createdCount >= params.total) {
          await flushBatch()
        }
      }

      // Final batch if any leftovers
      await flushBatch()

      const endTime = Date.now()
      const duration = ((endTime - startTime) / 1000).toFixed(2)

      logger.notice('\n')
      logger.notice('─'.repeat(50))
      logger.notice('✅ Completed!')
      logger.notice(`📈 Deals created: ${createdCount}`)
      logger.notice(`⏱️ Total execution time: ${duration} seconds`)
      logger.notice(`📊 Average time per deal: ${(Number(duration) / params.total).toFixed(2)} seconds`)

      if (errors.length > 0) {
        logger.notice(`❌ Errors encountered: ${errors.length}`)
        logger.notice('❌ Errors', {
          encountered: errors.length,
          first10: errors.slice(0, 10).map((error, index) => `${index + 1}. ${error}`)
        })
      } else {
        logger.notice('🎉 No errors encountered during creation process!')
      }
    }

    await createRandomDeals()
  }
})
