import { B24Hook, Logger, LogLevel, ConsoleV2Handler } from '@bitrix24/b24jssdk'
import { defineCommand } from 'citty'
import 'dotenv/config'
import { pickRandom, showProgress } from '../../utils'
import { THEMES_PRODUCTS } from '../../constants'

/**
 * Advanced CLI Command to populate Bitrix24 Catalog with products and SKUs.
 *
 * Features:
 * - Automatic Discovery: Detects IBlock IDs for Products and SKUs.
 * - Dynamic Properties: Maps available SKU properties (Color, Size, etc.).
 * - Price Types: Supports multiple price types per item.
 * - Atomic Batching: Optimized for high-speed generation (up to 50 commands per batch).
 * - Unique naming: Prevents duplicates based on existing catalog data.
 *
 * @usage pnpm --filter @bitrix24/b24jssdk-cli dev make products-sku --total=10 --theme=fashion --vatId=1 --currency=USD
 *
 * @todo need refactor
 * @todo add README info
 */
export default defineCommand({
  meta: {
    name: 'products-sku',
    description: 'Ultimate Bitrix24 Catalog Generator (SKU, Prices, VAT, Unique Names, Batch)'
  },
  args: {
    total: { description: 'How many products to create', default: '5' },
    theme: { description: 'Theme industrial | fashion', default: 'industrial' },
    vatId: { description: 'VAT rate ID (check your B24 settings)', default: '1' },
    vatIncluded: { description: 'Include VAT in price (Y|N)', default: 'Y' },
    currency: { description: 'Currency code', default: 'USD' }
  },
  async setup({ args }) {
    // --- 1. Init Connection & Logger ---
    const b24 = B24Hook.fromWebhookUrl(process.env.B24_HOOK ?? '')
    const logger = Logger.create('CatalogGen')
    logger.pushHandler(new ConsoleV2Handler(LogLevel.DEBUG, { useStyles: false }))

    // --- 2. Load Dictionaries ---
    const themes = THEMES_PRODUCTS
    const dictionary = themes[args.theme] || themes.industrial

    /**
     * DISCOVERY PHASE: Fetching system IDs and properties.
     *
     * Identifies the main CRM catalog, determines IBlock relationships
     * for base products and offers, and fetches available price types.
     */
    logger.info(`🔍 Discovery: Analyzing Bitrix24 for [${args.theme}] theme...`)

    const [catRes, ptRes] = await Promise.all([
      b24.actions.v2.call.make({ method: 'catalog.catalog.list' }),
      b24.actions.v2.call.make({ method: 'catalog.priceType.list' })
    ])

    const catalogs = (catRes.getData() as any)?.catalogs || []
    const mainCatalog = catalogs.find((c: any) => c.name.includes('CRM')) || catalogs[0]

    // Find Product and SKU IBlock IDs
    const productIblockId = mainCatalog.iblockId
    const skuIblockId = mainCatalog.skuPropertyId ? mainCatalog.iblockId : (catalogs.find((c: any) => c.productId === productIblockId)?.iblockId || productIblockId)

    // Fetch all active Price Types
    const priceTypeIds = (ptRes.getData() as any)?.priceTypes.map((t: any) => t.id) || []

    // Fetch Unique SKU properties (List types like Color/Size)
    const propRes = await b24.actions.v2.call.make({
      method: 'catalog.productProperty.list',
      params: { filter: { iblockId: skuIblockId, propertyType: 'L' } }
    })
    const listProps = (propRes.getData() as any)?.productProperties || []

    // Get Values (Enums) for each found property
    const activeSkuProps = await Promise.all(listProps.map(async (prop: any) => {
      const enumRes = await b24.actions.v2.call.make({
        method: 'catalog.productPropertyEnum.list',
        params: { filter: { propertyId: prop.id } }
      })
      return { id: prop.id, values: (enumRes.getData() as any)?.productPropertyEnums || [] }
    })).then(res => res.filter(p => p.values.length > 0))

    // Pre-fetch existing names to avoid duplicates
    const existRes = await b24.actions.v2.call.make({
      method: 'catalog.product.list',
      params: { select: ['name'], filter: { iblockId: productIblockId } }
    })
    const existingNames = new Set((existRes.getData() as any)?.products?.map((p: any) => p.name) || [])

    logger.info(`✅ Ready: ProductIB[${productIblockId}], SKU-Props[${activeSkuProps.length}], Existing[${existingNames.size}]`)

    /**
     * GENERATION & UPLOAD PHASE
     */

    /**
     * Generates a unique product name based on the selected theme dictionary.
     * Checks against the internal `existingNames` set to prevent duplicates.
     *
     * @returns {string} A unique generated product name.
     */
    function generateUniqueName(): string {
      while (true) {
        const lang = pickRandom(Object.keys(dictionary)) as keyof typeof dictionary
        const name = `${pickRandom(dictionary[lang])} ${pickRandom(dictionary[lang])} ${Math.floor(Math.random() * 9999)}`
        if (!existingNames.has(name)) {
          existingNames.add(name)
          return name
        }
      }
    }

    /**
     * Orchestrates the batch generation process.
     *
     * Calculates the optimal batch size based on the number of commands
     * required per product (Container + Offer + Prices).
     *
     * Workflow:
     * 1. Create Parent SKU (Container).
     * 2. Create Product Offer (Variation) linked to Parent.
     * 3. Assign random values to discovered SKU properties.
     * 4. Set prices for all active price types.
     */
    const totalToCreate = Number.parseInt(args.total)
    const commandsPerProduct = 2 + priceTypeIds.length
    const productsPerBatch = Math.floor(50 / commandsPerProduct)

    let created = 0
    while (created < totalToCreate) {
      const currentBatchSize = Math.min(productsPerBatch, totalToCreate - created)
      const batchCommands: Record<string, any> = {}

      for (let i = 0; i < currentBatchSize; i++) {
        const name = generateUniqueName()
        const imageUrl = `https://placehold.co{encodeURIComponent(name)}`
        const parentKey = `parent_${i}`

        // Command 1: Add Parent Product (Container)
        batchCommands[parentKey] = {
          method: 'catalog.product.sku.add',
          params: {
            fields: {
              name,
              iblockId: productIblockId,
              vatId: args.vatId,
              vatIncluded: args.vatIncluded === 'Y' ? 'Y' : 'N',
              previewPicture: imageUrl,
              detailPicture: imageUrl
            }
          }
        }

        // Command 2: Add SKU with unique property values (Size/Color/etc)
        const dynamicProps: Record<string, any> = {}
        activeSkuProps.forEach((p: any) => {
          dynamicProps[`property${p.id}`] = pickRandom(p.values as { id: number }[]).id
        })

        const offerKey = `offer_${i}`
        batchCommands[offerKey] = {
          method: 'catalog.product.offer.add',
          params: {
            fields: {
              name: `${name} (Variation)`,
              parentId: `$result[${parentKey}][element][id]`,
              iblockId: skuIblockId,
              xmlId: `SKU-${Date.now()}-${created + i}`,
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
                productId: `$result[${offerKey}][element][id]`,
                catalogGroupId: typeId,
                price: Math.floor(Math.random() * 20000) + 500,
                currency: args.currency
              }
            }
          }
        })
      }

      // Execute atomic batch
      await b24.actions.v2.call.make({
        method: 'batch',
        params: { halt: 0, cmd: batchCommands }
      })

      created += currentBatchSize
      showProgress(created, totalToCreate)
    }

    logger.notice(`\n🎉 Final Success! Created ${created} unique items in theme "${args.theme}".`)
  }
})
