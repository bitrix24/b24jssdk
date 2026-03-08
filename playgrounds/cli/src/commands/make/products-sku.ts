import { B24Hook, Logger, LogLevel, ConsoleV2Handler, ParamsFactory } from '@bitrix24/b24jssdk'
import { defineCommand } from 'citty'
import 'dotenv/config'
import { pickRandom, showProgress, randomInt } from '../../utils'
import { THEMES_PRODUCTS } from '../../constants'

/**
 * Advanced CLI command to populate Bitrix24 Catalog with products and SKUs.
 *
 * Features:
 * - Automatic Discovery: Detects IBlock IDs for Products and SKUs.
 * - Dynamic Properties: Maps available SKU properties (Color, Size, etc.).
 * - Price Types: Supports multiple price types per item.
 * - VAT handling: Automatically picks a random VAT ID from available rates.
 * - Batch processing: Optimized for high-speed generation using atomic batches.
 * - Unique naming: Uses theme-based dictionaries to generate random product names.
 *
 * @example
 * ```bash
 * pnpm --filter @bitrix24/b24jssdk-cli dev make products-sku --total=10 --theme=industrial --currency=USD
 * pnpm --filter @bitrix24/b24jssdk-cli dev make products-sku --total=10 --theme=fashion --currency=USD --vatIncluded=Y
 * ```
 *
 * @todo Add README info
 */
export default defineCommand({
  meta: {
    name: 'products-sku',
    description: 'Ultimate Bitrix24 Catalog Generator (SKU, Prices, VAT, Unique Names, Batch)'
  },
  args: {
    total: { description: 'How many products to create', required: true },
    theme: { description: 'Theme industrial | fashion', default: 'industrial' },
    vatIncluded: { description: 'Include VAT in price (Y|N)', default: 'N' },
    currency: { description: 'Currency code', default: 'USD' }
  },
  async setup({ args }) {
    const params = {
      total: Number.parseInt(args.total),
      theme: args.theme,
      vatIncluded: args.vatIncluded,
      currency: args.currency
    }

    let createdCount = 0

    // region Logger ////
    const logger = Logger.create('productsSku')
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

    // --- 2. Load Dictionaries ---
    const themes = THEMES_PRODUCTS
    const dictionary = themes[params.theme] || themes.industrial

    /**
     * DISCOVERY PHASE: Fetching system IDs and properties.
     *
     * Identifies the main CRM catalog, determines IBlock relationships
     * for base products and offers, and fetches available price types,
     * measures, VAT rates, and SKU properties.
     *
     * @returns {Promise<{
     *   productIblockId: number,
     *   skuIblockId: number,
     *   listVat: number[],
     *   listMeasure: number[],
     *   activeSkuProps: Array<{ id: number, values: any[] }>,
     *   priceTypeIds: number[]
     * }>} Resolved discovery data.
     *
     * @throws {never} Exits process if any critical discovery fails.
     */
    async function init() {
      logger.info(`🔍 Discovery: Analyzing Bitrix24 for [${params.theme}] theme...`)

      const [
        catResponse,
        ptResponse,
        measureResponse,
        vatResponse
      ] = await Promise.all([
        b24.actions.v2.call.make({ method: 'catalog.catalog.list' }),
        b24.actions.v2.call.make({ method: 'catalog.priceType.list' }),
        b24.actions.v2.call.make({ method: 'catalog.measure.list' }),
        b24.actions.v2.call.make({ method: 'catalog.vat.list' })
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

      // measure
      const listMeasure = ((measureResponse.getData()!.result as any)?.measures || []).map((m: any) => m.id)
      if (!listMeasure || listMeasure.length < 1) {
        logger.error('Empty measure list', {})
        process.exit(1)
      }

      // vat
      const listVat = (((vatResponse.getData() || {}).result as any)?.vats || []).map((m: any) => m.id)
      if (!listVat || listVat.length < 1) {
        logger.error('Empty vat list', {})
        process.exit(1)
      }

      // priceType
      const priceTypeIds = ((ptResponse.getData() || {})?.result as any)?.priceTypes.map((t: any) => t.id) || []

      // Fetch Unique SKU properties (List types like Color/Size)
      const propResponse = await b24.actions.v2.call.make({
        method: 'catalog.productProperty.list',
        params: { filter: { iblockId: skuIblockId, propertyType: 'L' } }
      })
      const listProps = ((propResponse.getData() || {}).result as any)?.productProperties || []

      // Fetch enums for each found property
      const activeSkuProps = await Promise.all(listProps.map(async (prop: any) => {
        const enumRes = await b24.actions.v2.call.make({
          method: 'catalog.productPropertyEnum.list',
          params: { filter: { propertyId: prop.id } }
        })

        return { id: prop.id, values: ((enumRes.getData() || {}).result as any)?.productPropertyEnums || [] }
      })).then(res => res.filter(p => p.values.length > 0))

      return {
        productIblockId,
        skuIblockId,
        listVat,
        listMeasure,
        activeSkuProps,
        priceTypeIds
      }
    }

    /**
     * Generates a unique product name based on the selected theme dictionary.
     * Uses a random language (e.g., 'ru', 'en') and combines two random words
     * from that language with a random 4-digit number.
     *
     * @returns {string} A unique generated product name.
     */
    function generateUniqueName(): string {
      const lang = pickRandom(Object.keys(dictionary)) as keyof typeof dictionary
      return `${pickRandom(dictionary[lang])} ${pickRandom(dictionary[lang])} ${Math.floor(Math.random() * 9999)}`
    }

    /**
     * Main generation loop.
     * Creates products in batches, each batch containing multiple products
     * with their SKUs and prices.
     *
     * Steps:
     * 1. Perform discovery (init) to get system IDs.
     * 2. Calculate optimal batch size based on B24 batch limit (50 commands).
     * 3. For each product:
     *    - Generate a unique name.
     *    - Prepare image data (base64 encoded PNG).
     *    - Add parent product command.
     *    - Add SKU command with dynamic properties and VAT/measure.
     *    - Add price commands for each price type.
     * 4. Execute batch.
     * 5. Collect errors and show progress.
     *
     * @returns {Promise<void>}
     */
    async function createRandomProducts(): Promise<void> {
      logger.notice('🚀 Starting creation of random products in Bitrix24')
      logger.notice(`📊 Planned to create: ${params.total} products`)
      logger.notice(`⚙  Currency: ${params.currency}`)
      logger.notice(`⚙  Theme: ${params.theme}`)
      logger.notice('─'.repeat(50))

      const healthCheckData = await b24.tools.healthCheck.make({ requestId: 'healthCheck' })
      logger.notice(`Health check: ${healthCheckData ? 'success' : 'fail'}`)
      if (!healthCheckData) {
        return
      }
      logger.notice('\n')

      const startTime = Date.now()
      const errors: string[] = []

      const {
        productIblockId,
        skuIblockId,
        priceTypeIds,
        activeSkuProps,
        listMeasure,
        listVat
      } = await init()

      logger.info(`⚙  Ready`, {
        productIblockId,
        skuIblockId,
        listVats: listVat.length,
        listMeasures: listMeasure.length,
        activeSkuProps: activeSkuProps.length,
        priceTypes: priceTypeIds.length
      })

      /**
       * Orchestrates the batch generation process.
       *
       * Calculates the optimal batch size based on the number of commands
       * required per product (Parent + Offer + Prices).
       *
       * Workflow:
       * 1. Create Parent SKU (Container).
       * 2. Create Product Offer (Variation) linked to Parent.
       * 3. Assign random values to discovered SKU properties.
       * 4. Set prices for all active price types.
       */
      const maxBatchInB24 = 50
      const commandsPerProduct = 2 + priceTypeIds.length
      const productsPerBatch = Math.floor(maxBatchInB24 / commandsPerProduct)

      while (createdCount < params.total) {
        const currentBatchSize = Math.min(productsPerBatch, params.total - createdCount)
        const batchCommands: Record<string, any> = {}

        for (let i = 0; i < currentBatchSize; i++) {
          const parentKey = `parent_${i}`
          const name = generateUniqueName()
          // @see https://placehold.co/640x800.png?text=SomePicture
          // const imageData = {}
          const imageData = { fileData: ['somePicture.png', `iVBORw0KGgoAAAANSUhEUgAAAoAAAAMgCAYAAACzptN5AAAACXBIWXMAAAsTAAALEwEAmpwYAAAgAElEQVR4nO3d6XbsVrm24X3+Z0C76EMXQh8CJPRt6CF04TmW9Y3Xg8rnGLs0q3N5+bl+XCObnbhcJaukW1PS1P8leQkAQGr837XfAAAAeVQCEAAgXQQgAEC6CEAAgHQRgAAA6SIAAQDSRQACAKSLAAQASBcBCACQLgIQACBdBCAAQLoIQACAdBGAAADpIgABANJFAAIApIsABABIFwEIAJAuAhAAIF0EIABAughAAIB0EYAAAOkiAAEA0kUAAgCkiwAEAEgXAQgAkC4CEAAgXQQgAEC6CEAAgHQRgAAA6SIAAQDSRQACAKSLAAQASBcBCACQLgIQACBdBCAAQLoIQACAdBGAAADpIgABANJFAAIApIsABABIFwEIAJAuAhAAIF0EIABAughAAIB0EYAAAOkiAAEA0kUAAgCkiwAEAEgXAQgAkC4CEAAgXQQgAEC6CEAAgHQRgAAA6SIAAQDSRQACAKSLAAQASBcBCACQLgIQACBdBCAAQLoIQACAdBGAAADpIgABANJFAAIAlBGAAADpIgABANJFAAIApIsABABIFwEIAJAuAhAAIF0EIABAughAAIB0EYAAAOkiAAEA0kUAAgCkiwAEAEgXAQgAkC4CEAAgXQQgAEC6CEAAgHQRgAAA6SIAAQDSRQACAKSLAAQASBcBCACQLgIQACBdBCAAQLoIQACAdBGAAADpIgABANJFAAIApIsABABIFwEIAJAuAhAAIF0EIABAughAAIB0EYAAAOkiAAEA0kUAAgCkiwAEAEgXAQgAkC4CEAAgXQQgAEC6CEAAgHQRgAAA6SIAAQDSRQACAKSLAAQASBcBCACQLgIQACBdBCAAQLoIQACAdBGAAADpIgABANJFAAIApIsABABIFwEIAJAuAhAAIF0EIABAughAAIB0EYAAAOkiAAEA0kUAAgCkiwAEAEgXAQgAkC4CEAAgXQQgAEC6CEAAgDICEAAgXQQgAEC6CEAAgHQRgAAA6SIAAQDSRQACAKSLAAQASBcBCACQLgIQACBdBCAAQLoIQACAdBGAAADpIgABANJFAAIApIsABABIFwEIAJAuAhAAIF0EIABAughAAIB0EYAAAOkiAAEA0kUAAgCkiwAEAEgXAQgAkC4CEAAgXQQgAEC6CEAAgHQRgAAA6SIAAQDSRQACAKSLAAQASBcBCACQLgIQACBdBCAAQLoIQACAdBGAAADpIgABANJFAAIApIsABABIFwEIAJAuAhAAIF0EIABAughAAIB0EYAAAOkiAAEA0kUAAgCkiwAEAEgXAQgAkC4CEAAgXQQgAEC6CEAAgHQRgAAA6SIAAQDSRQACAKSLAAQASBcBCACQLgIQACBdBCAAQLoIQACAdBGAAADpIgABANJFAAIApIsABABIFwEIAFBGAAIApIsABABIFwEIAJAuAhAAIF0EIABAughAAIB0EYAAAOkiAAEA0kUAAgCkiwAEAEgXAQgAkC4CEAAgXQQgAEC6CEAAgHQRgAAA6SIAAQDSRQACAKSLAAQASBcBCACQLgIQACBdBCAAQLoIQACAdBGAAADpIgABANJFAAIApIsABABIFwEIAJAuAhAAIF0EIABAughAAIB0EYAAAOkiAAEA0kUAAgCkiwAEAEgXAQgAkC4CEAAgXQQgAEC6CEAAgHQRgAAA6SIAAQDSRQACAKSLAAQASBcBCACQLgIQACBdBCAAQLoIQACAdBGAAADpIgABANJFAAIApIsABABIFwEIAJAuAhAAIF0EIABAughAAIB0EYAAAOkiAAEA0kUAAgCkiwAEAEgXAQgAkC4CEAAgXQQgAEC6CEAAgHQRgAAA6SIAAQDSRQACAKSLAAQASBcBCACQLgIQACBdBCAAQLoIQACAdBGAAADpIgABANJFAAIApIsABABIFwEIAJAuAhAAIF0EIABAughAAIB0EYAAAOkiAAEA0kUAAgCkiwAEAEgXAQgAkC4CEAAgXQQgAEC6CEAAgHQRgAAA6SIAAQDSRQACAKSLAAQASBcBCACQLgIQACBdBCAAQLoIQACAdBGAAADpIgABANJFAAIApIsABABIFwEIAJAuAhAAIF0EIABAughAAIB0EYAAAOkiAAEA0kUAAgCkiwAEAEgXAQgAkC4CEAAgXQQgAEC6CEAAgHQRgAAA6SIAAQDSRQACAKSLAAQASBcBCACQLgIQACBdBCAAQLoIQACAdBGAAADpIgABANJFAAIApIsABABIFwEIAJAuAhAAIF0EIABAughAAIB0EYAAAOkiAAEA0kUAAgCkiwAEAEgXAQgAkC4CEAAgXQQgAEC6CEAAgHQRgAAA6SIAAQDSRQACAKSLAAQASBcBCACQLgIQACBdBCAAQLoIQACAdBGAAADpIgABANJFAAIApIsABABIFwEIAJAuAhAAIF0EIABAughAAIB0EYAAAOkiAAEA0kUAAgCkiwAEAEgXAQgAkC4CEAAgXQQgAEC6CEAAgHQRgAAA6SIAAQDSRQACAKSLAAQASBcBCACQLgIQACBdBCAAQLoIQACAdBGAAADpIgABANJFAAIApIsABABIFwEIAJAuAhAAIF0EIABAughAAIB0EYAAAOkiAAEA0kUAAgCkiwAEAEgXAQgAkC4CEAAgXQQgAEC6CEAAgHQRgAAX9Ic//OHlj3/84xu/+93vXv7nP/+5+nsCUk8AcpDZef3pT3+62Zl997vfffm1r33t5Ve+8pWXX/7yl2/++cYbb9z8/+ff//73v3/573//++rvmefl/fffv1kHT/XnP//55XvvvXfzepd4n3/5y19evvbaay8/8pGPfMhnP/vZm+/GtZcjkGoCkCV///vfX37ve997+alPfep/dmj7fOxjH3v5+uuvv/z5z39+sR0tXf76178etA6uePHixc1BzJtvvvny17/+9ckHLn/7299efvKTn9z7vRCBQK5IALLXP//5z5sRvY9//OMn72Rnh/iDH/zAqCBPLgDvmvX9G9/4xtGRNiPjW79jRgKdDgZyJQKQvdcuHTrit2Jec0ZZrv35eDU9RgDeNiODc7r4kIOmj370o0uvPdcEXnt5AqkkALnXz372s+Wd2LG+/e1vGwHhyQfgmO/C22+/vfT+ZtRw9XXnWtlrL89jTm/P5SDz/b1trnm89nsDskwA8j9+85vfXDz+dn74wx9e/fPyarlGAO5885vf3DxomZHz1df76U9/evXleagvfOEL936W3/72t1d/b0CWCUA+ZI7iz3G934q5EH5GE679mXm1XDMAx4x27Xt/c43r6nfokFPLT8Gc3n7oswhAyCtFAPIhM5XLITvDuZB9fmYuep9rpT73uc8tjx7OzSXX/rw83wD8zGc+86C5DvWUA525q33fe3zrrbc2X2O+M9delod69913BSDkeRCAfGA24Ks71p/85Cc3owH3vc6//vWvl7/4xS9efvGLX3zwNWbn+49//OPqn5nnGYBzELLyWrOuzno/17Ttm7blrvlvH1r/x0x5tO9gag6U9v38U/XOO+8IQMjz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`] }

          // Command 1: Add Parent Product
          batchCommands[parentKey] = {
            method: 'catalog.product.sku.add',
            params: {
              fields: {
                iblockId: productIblockId,
                name,
                active: 'Y'
              }
            }
          }

          // Command 2: Add SKU with unique property values (Size/Color/etc)
          const offerKey = `offer_${i}`

          const dynamicProps: Record<string, any> = {}
          activeSkuProps.forEach((p: any) => {
            dynamicProps[`property${p.id}`] = pickRandom(p.values as { id: number }[]).id
          })

          batchCommands[offerKey] = {
            method: 'catalog.product.offer.add',
            params: {
              fields: {
                iblockId: skuIblockId,
                name: `${name} (Variation)`,
                active: 'Y',
                parentId: `$result[${parentKey}][sku][id]`,
                xmlId: `SKU-${Date.now()}-${createdCount + i}`,
                previewPicture: imageData,
                detailPicture: imageData,
                purchasingCurrency: params.currency,
                purchasingPrice: Math.floor(Math.random() * 10000) + 200,
                quantity: randomInt(1, 1000),
                measure: pickRandom(listMeasure),
                height: randomInt(1, 1000),
                length: randomInt(1, 1000),
                width: randomInt(1, 1000),
                weight: randomInt(1, 1000),
                vatId: pickRandom(listVat),
                vatIncluded: params.vatIncluded === 'Y' ? 'Y' : 'N',
                ...dynamicProps
              }
            }
          }

          // Command 3+: Add all available Price Types for this SKU
          priceTypeIds.forEach((typeId: number, tIdx: number) => {
            batchCommands[`price_${i}_${tIdx}`] = {
              method: 'catalog.price.add',
              params: {
                fields: {
                  productId: `$result[${offerKey}][offer][id]`,
                  catalogGroupId: typeId,
                  price: Math.floor(Math.random() * 20000) + 500,
                  currency: params.currency
                }
              }
            }
          })
        }

        createdCount += currentBatchSize
        showProgress(createdCount, params.total)
        // Execute atomic batch
        const response = await b24.actions.v2.batch.make({
          calls: batchCommands,
          options: {
            isHaltOnError: true,
            returnAjaxResult: false
          }
        })
        errors.push(...response.getErrorMessages())
      }

      const endTime = Date.now()
      const duration = ((endTime - startTime) / 1000).toFixed(2)

      logger.notice('\n')
      logger.notice('─'.repeat(50))
      logger.notice('✅ Completed!')
      logger.notice(`📈 Successfully created: ${createdCount} products`)
      logger.notice(`⏱️ Total execution time: ${duration} seconds`)
      logger.notice(`📊 Average time per company: ${(Number(duration) / params.total).toFixed(2)} seconds`)

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

    await createRandomProducts()
  }
})
