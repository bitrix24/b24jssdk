import { SdkError } from '@bitrix24/b24jssdk'
import type { CommandObject } from '@bitrix24/b24jssdk'
import { defineCommand } from 'citty'
import 'dotenv/config'
import { pickRandom, showProgress, randomInt, createB24Client, icon } from '../../utils'
import { THEMES_PRODUCTS, CLIENT_ERROR_STATUS } from '../../constants'
import { PLACEHOLDER_IMAGE_BASE64 } from '../../constants/placeholder-image'
import type { CatalogCatalogItem, CatalogVatItem, CatalogMeasureItem, CatalogPriceType } from '../../types'

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
 */

interface CatalogsListResult {
  result: { catalogs: CatalogCatalogItem[] }
}

interface MeasureListResult {
  result: { measures: CatalogMeasureItem[] }
}

interface VatListResult {
  result: { vats: CatalogVatItem[] }
}

interface PriceTypeListResult {
  result: { priceTypes: CatalogPriceType[] }
}

interface ProductPropertyItem {
  id: number
}

interface ProductPropertyListResult {
  result: { productProperties: ProductPropertyItem[] }
}

interface ProductPropertyEnumItem {
  id: number
}

interface ProductPropertyEnumListResult {
  result: { productPropertyEnums: ProductPropertyEnumItem[] }
}

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
    const total = Number.parseInt(args.total, 10)
    if (Number.isNaN(total) || total < 1) {
      throw new SdkError({
        code: 'PLAYGROUND_CLI_INVALID_ARG',
        description: `--total must be a positive integer (>= 1), got: ${args.total}`,
        status: CLIENT_ERROR_STATUS
      })
    }

    const params = {
      total,
      theme: args.theme,
      vatIncluded: args.vatIncluded,
      currency: args.currency
    }

    let createdCount = 0

    const { b24, logger } = createB24Client('products-sku')

    // --- 2. Load Dictionaries ---
    const themes = THEMES_PRODUCTS
    const dictionary = themes[params.theme] ?? themes.industrial

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
     *   activeSkuProps: Array<{ id: number, values: ProductPropertyEnumItem[] }>,
     *   priceTypeIds: number[]
     * }>} Resolved discovery data.
     */
    async function init() {
      logger.info(`${icon('🔍 ')}Discovery: Analyzing Bitrix24 for [${params.theme}] theme...`)

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

      // measure
      const measureData = measureResponse.getData() as MeasureListResult | null
      const listMeasure: number[] = (measureData?.result?.measures ?? []).map(m => m.id)
      if (listMeasure.length < 1) {
        throw new SdkError({
          code: 'PLAYGROUND_CLI_ERROR',
          description: 'Empty measure list',
          status: CLIENT_ERROR_STATUS
        })
      }

      // vat
      const vatData = vatResponse.getData() as VatListResult | null
      const listVat: number[] = (vatData?.result?.vats ?? []).map(m => m.id)
      if (listVat.length < 1) {
        throw new SdkError({
          code: 'PLAYGROUND_CLI_ERROR',
          description: 'Empty vat list',
          status: CLIENT_ERROR_STATUS
        })
      }

      // priceType
      const ptData = ptResponse.getData() as PriceTypeListResult | null
      const priceTypeIds: number[] = (ptData?.result?.priceTypes ?? []).map(t => t.id)

      // Fetch Unique SKU properties (List types like Color/Size)
      const propResponse = await b24.actions.v2.call.make({
        method: 'catalog.productProperty.list',
        params: { filter: { iblockId: skuIblockId, propertyType: 'L' } }
      })
      const propData = propResponse.getData() as ProductPropertyListResult | null
      const listProps: ProductPropertyItem[] = propData?.result?.productProperties ?? []

      // Fetch enums for each found property
      const activeSkuProps = await Promise.all(listProps.map(async (prop) => {
        const enumRes = await b24.actions.v2.call.make({
          method: 'catalog.productPropertyEnum.list',
          params: { filter: { propertyId: prop.id } }
        })

        const enumData = enumRes.getData() as ProductPropertyEnumListResult | null
        const values: ProductPropertyEnumItem[] = enumData?.result?.productPropertyEnums ?? []
        return { id: prop.id, values }
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
      logger.notice(`${icon('🚀 ')}Starting creation of random products in Bitrix24`)
      logger.notice(`${icon('📊 ')}Planned to create: ${params.total} products`)
      logger.notice(`${icon('⚙  ')}Currency: ${params.currency}`)
      logger.notice(`${icon('⚙  ')}Theme: ${params.theme}`)
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

      logger.info(`${icon('⚙  ')}Ready`, {
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
      const MAX_BATCH_SIZE = 50
      const commandsPerProduct = 2 + priceTypeIds.length
      const productsPerBatch = Math.max(1, Math.floor(MAX_BATCH_SIZE / commandsPerProduct))

      // @see https://placehold.co/640x800.png?text=SomePicture
      const imageData = { fileData: ['somePicture.png', PLACEHOLDER_IMAGE_BASE64] }

      while (createdCount < params.total) {
        const currentBatchSize = Math.min(productsPerBatch, params.total - createdCount)
        const batchCommands: Record<string, CommandObject> = {}

        for (let i = 0; i < currentBatchSize; i++) {
          const parentKey = `parent_${i}`
          const name = generateUniqueName()

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

          const dynamicProps: Record<string, unknown> = {}
          activeSkuProps.forEach((p) => {
            const pickedVal = pickRandom(p.values)
            dynamicProps[`property${p.id}`] = pickedVal.id
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
          priceTypeIds.forEach((typeId, tIdx) => {
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
        if (!response.isSuccess) {
          errors.push(...response.getErrorMessages())
        }
      }

      const endTime = Date.now()
      const duration = ((endTime - startTime) / 1000).toFixed(2)

      logger.notice('\n')
      logger.notice('─'.repeat(50))
      logger.notice(`${icon('✅ ')}Completed!`)
      logger.notice(`${icon('📈 ')}Successfully created: ${createdCount} products`)
      logger.notice(`${icon('⏱️ ')}Total execution time: ${duration} seconds`)
      logger.notice(`${icon('📊 ')}Average time per product: ${(Number(duration) / params.total).toFixed(2)} seconds`)

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

    await createRandomProducts()
  }
})
