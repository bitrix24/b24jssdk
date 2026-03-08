import { B24Hook, EnumCrmEntityTypeId, Logger, LogLevel, ConsoleV2Handler, ParamsFactory, SdkError, Result } from '@bitrix24/b24jssdk'
import type { GetPayload } from '@bitrix24/b24jssdk'
import { defineCommand } from 'citty'
import 'dotenv/config'
import type { FmField, CompanyFields, CrmItemAddResult } from '../../types'
import { LANGUAGES, EMAIL_DOMAINS } from '../../constants'
import { pickRandom, generatePhoneNumber, showProgress } from '../../utils'

/**
 * Command for generating random companies in Bitrix24.
 *
 * This command automates the creation of test data by generating realistic company
 * names, phone numbers, and emails, then uploading them to Bitrix24 via webhooks.
 *
 * @usage pnpm --filter @bitrix24/b24jssdk-cli dev make companies --total=10
 */

// Arrays for generating realistic company names
const COMPANY_PREFIXES = [
  'Global', 'Innovative', 'Elite', 'Prime', 'Advanced', 'NextGen', 'Smart',
  'True', 'United', 'National', 'First', 'Premium', 'Pro', 'Alpha', 'Omega'
] as const

const COMPANY_INDUSTRIES = [
  'Tech', 'Software', 'Digital', 'Data', 'Cloud', 'Network', 'Info', 'Cyber',
  'Business', 'Finance', 'Capital', 'Investment', 'Market', 'Trade',
  'Industrial', 'Manufacturing', 'Production', 'Supply', 'Logistics',
  'Media', 'Creative', 'Design', 'Studio', 'Media', 'Communications'
] as const

const COMPANY_SUFFIXES = [
  'Solutions', 'Group', 'Partners', 'Systems', 'Technologies', 'Services',
  'Inc', 'Corp', 'Ltd', 'Associates', 'Enterprises', 'Holdings', 'Ventures',
  'International', 'Worldwide', 'Global', 'Corporation', 'Company'
] as const

export default defineCommand({
  meta: {
    name: 'companies',
    description: 'Generate random companies in Bitrix24'
  },
  args: {
    total: {
      description: 'Number of companies to create',
      required: true
    },
    assignedById: {
      description: 'Assigned user ID',
      default: '1'
    }
  },
  async setup({ args }) {
    const params = {
      total: Number.parseInt(args.total),
      assignedById: Number.parseInt(args.assignedById)
    }

    let createdCount = 0

    // region Logger ////
    const logger = Logger.create('loadTesting')
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

    /**
     * Generates a corporate email address based on the company name.
     *
     * @param {string} companyName - The name used as the email prefix.
     * @returns {string} Normalized email (e.g., "globatech@gmail.com").
     */
    function generateEmail(companyName: string): string {
      const domain = pickRandom(EMAIL_DOMAINS)
      return `${companyName.toLowerCase().replace(/\s+/g, '')}@${domain}`
    }

    /**
     * Constructs a realistic company name using random combinations
     * of prefixes, industries, and suffixes.
     *
     * @returns {string} A randomly formatted company name.
     */
    function generateCompanyName(): string {
      const prefix = pickRandom(COMPANY_PREFIXES)
      const industry = pickRandom(COMPANY_INDUSTRIES)
      const suffix = pickRandom(COMPANY_SUFFIXES)

      // Randomly choose name pattern for variety
      const patterns = [
        `${prefix} ${industry} ${suffix}`,
        `${industry} ${suffix}`,
        `${prefix} ${suffix}`,
        `${industry} ${pickRandom(COMPANY_SUFFIXES)}`
      ]

      return pickRandom(patterns)
    }

    /**
     * Assembles a complete company data object with randomized fields.
     * Includes a 50% chance for a phone and a 30% chance for an email.
     *
     * @returns {CompanyFields} Object ready for Bitrix24 CRM API.
     */
    function generateRandomCompany(): CompanyFields {
      const language = pickRandom(LANGUAGES)
      const companyName = generateCompanyName()

      // Additional optional fields for more realistic data
      const fm: FmField[] = []

      if (Math.random() > 0.5) {
        fm.push({
          valueType: 'WORK',
          value: generatePhoneNumber(language),
          typeId: 'PHONE'
        })
      }

      if (Math.random() > 0.7) {
        fm.push({
          valueType: 'WORK',
          value: generateEmail(companyName),
          typeId: 'EMAIL'
        })
      }

      return {
        title: companyName,
        assignedById: params.assignedById,
        open: 'Y',
        typeId: 'CLIENT',
        sourceId: 'OTHER',
        fm
      }
    }

    /**
     * Performs an API call to Bitrix24 to create a single company.
     *
     * @param {number} companyNumber - The current iteration index for logging.
     * @returns {Promise<Result>} A Result object containing the new ID or errors.
     */
    async function createCompany(companyNumber: number): Promise<Result> {
      const result = new Result()

      try {
        const companyData = generateRandomCompany()

        const response = await b24.actions.v2.call.make<CrmItemAddResult>({
          method: 'crm.item.add',
          params: {
            entityTypeId: EnumCrmEntityTypeId.company,
            fields: companyData
          }
        })

        if (!response.isSuccess) {
          return result.addError(new SdkError({
            code: 'PLAYGROUND_CLI_ERROR',
            description: response.getErrorMessages().join(';'),
            status: 404
          }))
        }

        const resultData = response.getData() as GetPayload<CrmItemAddResult> | null | undefined
        const companyId = resultData?.result?.item?.id ?? 0

        if (!companyId) {
          return result.addError(new SdkError({
            code: 'PLAYGROUND_CLI_ERROR',
            description: 'No company ID returned from API',
            status: 404
          }))
        }

        createdCount++
        return result.setData({ companyId })
      } catch (error: unknown) {
        return result.addError(SdkError.fromException(
          `Error creating company ${companyNumber}: ${error instanceof Error ? error.message : error}`, {
            code: 'PLAYGROUND_CLI_ERROR',
            status: 404
          }))
      }
    }

    /**
     * Orchestrates the batch creation process.
     *
     * Performs a health check, iterates through the total count,
     * updates the progress bar, and logs final performance metrics.
     *
     * @returns {Promise<void>}
     */
    async function createRandomCompanies(): Promise<void> {
      logger.notice('🚀 Starting creation of random companies in Bitrix24')
      logger.notice(`📊 Planned to create: ${params.total} companies`)
      logger.notice(`👤 Responsible: user ID ${params.assignedById}`)
      logger.notice('─'.repeat(50))

      const healthCheckData = await b24.tools.healthCheck.make({ requestId: 'healthCheck' })
      logger.notice(`Health check: ${healthCheckData ? 'success' : 'fail'}`)
      if (!healthCheckData) {
        return
      }
      logger.notice('\n')

      const startTime = Date.now()
      const errors: string[] = []

      for (let i = 0; i < params.total; i++) {
        const companyResult = await createCompany(i + 1)
        errors.push(...companyResult.getErrorMessages())
        showProgress(createdCount, params.total)
      }

      const endTime = Date.now()
      const duration = ((endTime - startTime) / 1000).toFixed(2)

      logger.notice('\n')
      logger.notice('─'.repeat(50))
      logger.notice('✅ Completed!')
      logger.notice(`📈 Successfully created: ${createdCount} companies`)
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

    await createRandomCompanies()
  }
})
