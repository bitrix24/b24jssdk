import { EnumCrmEntityTypeId, SdkError, Result } from '@bitrix24/b24jssdk'
import type { GetPayload } from '@bitrix24/b24jssdk'
import { defineCommand } from 'citty'
import 'dotenv/config'
import type { FmField, CompanyFields, CrmItemAddResult } from '../../types'
import { LANGUAGES, EMAIL_DOMAINS, CLIENT_ERROR_STATUS } from '../../constants'
import { pickRandom, generatePhoneNumber, showProgress, createB24Client, icon } from '../../utils'

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
    total: { description: 'Number of companies to create', required: true },
    assignedById: { description: 'Assigned user ID', default: '1' }
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

    const params = { total, assignedById }
    let createdCount = 0

    const { b24, logger } = createB24Client('companies')

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
            status: CLIENT_ERROR_STATUS
          }))
        }

        const resultData = response.getData() as GetPayload<CrmItemAddResult> | null | undefined
        const companyId = resultData?.result?.item?.id ?? 0

        if (!companyId) {
          return result.addError(new SdkError({
            code: 'PLAYGROUND_CLI_ERROR',
            description: 'No company ID returned from API',
            status: CLIENT_ERROR_STATUS
          }))
        }

        createdCount++
        return result.setData({ companyId })
      } catch (error: unknown) {
        return result.addError(SdkError.fromException(
          `Error creating company ${companyNumber}: ${error instanceof Error ? error.message : error}`, {
            code: 'PLAYGROUND_CLI_ERROR',
            status: CLIENT_ERROR_STATUS
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
      logger.notice(`${icon('🚀 ')}Starting creation of random companies in Bitrix24`)
      logger.notice(`${icon('📊 ')}Planned to create: ${params.total} companies`)
      logger.notice(`${icon('👤 ')}Responsible: user ID ${params.assignedById}`)
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
      logger.notice(`${icon('✅ ')}Completed!`)
      logger.notice(`${icon('📈 ')}Successfully created: ${createdCount} companies`)
      logger.notice(`${icon('⏱️ ')}Total execution time: ${duration} seconds`)
      logger.notice(`${icon('📊 ')}Average time per company: ${(Number(duration) / params.total).toFixed(2)} seconds`)

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

    await createRandomCompanies()
  }
})
