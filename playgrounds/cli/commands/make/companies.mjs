import { B24Hook, EnumCrmEntityTypeId, Logger, LogLevel, ConsoleV2Handler, ParamsFactory, SdkError, Result } from '@bitrix24/b24jssdk'
import { defineCommand } from 'citty'
import dotenv from 'dotenv'

/**
 * Command for generating random companies in Bitrix24
 *
 * Usage:
 * clear; node ./index.mjs make companies --total=10
 *
 * @todo fix problem args
 */

dotenv.config({ path: '../../.env', quiet: true })

// Arrays for generating realistic company names
const companyPrefixes = [
  'Global', 'Innovative', 'Elite', 'Prime', 'Advanced', 'NextGen', 'Smart',
  'True', 'United', 'National', 'First', 'Premium', 'Pro', 'Alpha', 'Omega'
]

const companyIndustries = [
  'Tech', 'Software', 'Digital', 'Data', 'Cloud', 'Network', 'Info', 'Cyber',
  'Business', 'Finance', 'Capital', 'Investment', 'Market', 'Trade',
  'Industrial', 'Manufacturing', 'Production', 'Supply', 'Logistics',
  'Media', 'Creative', 'Design', 'Studio', 'Media', 'Communications'
]

const companySuffixes = [
  'Solutions', 'Group', 'Partners', 'Systems', 'Technologies', 'Services',
  'Inc', 'Corp', 'Ltd', 'Associates', 'Enterprises', 'Holdings', 'Ventures',
  'International', 'Worldwide', 'Global', 'Corporation', 'Company'
]

const languages = ['english', 'russian', 'spanish', 'chinese']

export default defineCommand({
  meta: {
    name: 'companies',
    description: 'Generate random companies in Bitrix24'
  },
  args: {
    total: {
      description: 'Number of companies to create',
      default: 10
    },
    assignedById: {
      description: 'Assigned user ID',
      default: 1
    }
  },
  async setup({ args }) {
    args.total = 1000
    args.assignedById = 1

    let createdCount = 0
    let errors = []

    // region Logger ////
    const logger = Logger.create('loadTesting')
    const handler = new ConsoleV2Handler(LogLevel.DEBUG, { useStyles: false })
    logger.pushHandler(handler)
    // endregion ////

    // Initialize Bitrix24 connection
    const hookPath = process.env?.B24_HOOK || ''
    if (!hookPath) {
      logger.emergency('🚨 B24_HOOK environment variable is not set! Please configure it in your .env file')
      process.exit(1)
    }

    const b24 = B24Hook.fromWebhookUrl(hookPath, { restrictionParams: ParamsFactory.getBatchProcessing() })
    logger.info(`Connected to Bitrix24`, { target: b24.getTargetOrigin() })

    const loggerForDebugB24 = Logger.create('b24')
    const handlerForDebugB24 = new ConsoleV2Handler(LogLevel.ERROR, { useStyles: false })
    loggerForDebugB24.pushHandler(handlerForDebugB24)

    b24.setLogger(loggerForDebugB24)

    /**
     * Generates email from name and last name
     */
    function generateEmail(companyName) {
      const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'company.com']
      const domain = domains[Math.floor(Math.random() * domains.length)]

      return `${companyName.toLowerCase().replace(/\s+/g, '')}@${domain}`
    }

    /**
     * Generates phone number based on language/country
     */
    function generatePhoneNumber(language) {
      const countryCodes = {
        english: '+1', // USA
        russian: '+7', // Russia
        spanish: '+34', // Spain
        chinese: '+86' // China
      }

      const code = countryCodes[language] || '+1'
      // Generate 10-digit number (excluding country code)
      const number = Math.floor(1000000000 + Math.random() * 9000000000)
      return `${code}${number}`
    }

    /**
     * Generates a realistic company name by combining prefix, industry, and suffix
     */
    function generateCompanyName() {
      const prefix = companyPrefixes[Math.floor(Math.random() * companyPrefixes.length)]
      const industry = companyIndustries[Math.floor(Math.random() * companyIndustries.length)]
      const suffix = companySuffixes[Math.floor(Math.random() * companySuffixes.length)]

      // Randomly choose name pattern for variety
      const patterns = [
        `${prefix} ${industry} ${suffix}`,
        `${industry} ${suffix}`,
        `${prefix} ${suffix}`,
        `${industry} ${companySuffixes[Math.floor(Math.random() * companySuffixes.length)]}`
      ]

      return patterns[Math.floor(Math.random() * patterns.length)]
    }

    /**
     * Generates random company data
     */
    function generateRandomCompany() {
      const language = languages[Math.floor(Math.random() * languages.length)]

      const companyName = generateCompanyName()

      return {
        title: companyName,
        assignedById: args.assignedById,
        open: 'Y',
        typeId: 'CLIENT',
        sourceId: 'OTHER',
        // Additional optional fields for more realistic data
        fm: [
          (Math.random() > 0.5 && {
            valueType: 'WORK',
            value: generatePhoneNumber(language),
            typeId: 'PHONE'
          }) || undefined,
          (Math.random() > 0.7 && {
            valueType: 'WORK',
            value: generateEmail(companyName),
            typeId: 'EMAIL'
          }) || undefined
        ].filter(Boolean)
      }
    }

    /**
     * Creates a single company in Bitrix24
     */
    async function createCompany(companyNumber) {
      const result = new Result()

      try {
        const companyData = generateRandomCompany()

        const response = await b24.actions.v2.call.make({
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

        const resultData = response.getData()
        const companyId = resultData?.result.item.id || 0

        if (!companyId) {
          return result.addError(new SdkError({
            code: 'PLAYGROUND_CLI_ERROR',
            description: 'No company ID returned from API',
            status: 404
          }))
        }

        createdCount++
        return result.setData({ companyId })
      } catch (error) {
        const errorMessage = `Error creating company ${companyNumber}: ${error.message}`
        errors.push(errorMessage)
        return result.addError(SdkError.fromException(errorMessage, {
          code: 'PLAYGROUND_CLI_ERROR',
          status: 404
        }))
      }
    }

    /**
     * Displays creation progress
     */
    function showProgress() {
      const percentage = Math.round((createdCount / args.total) * 100)

      const progressBarLength = 20
      const filledLength = Math.floor(percentage / 100 * progressBarLength)
      const progressBar = '█'.repeat(filledLength) + '░'.repeat(progressBarLength - filledLength)

      process.stdout.clearLine()
      process.stdout.cursorTo(0)
      process.stdout.write(`\rProgress: [${progressBar}] ${percentage}% (${createdCount}/${args.total})`)
    }

    /**
     * Main function for creating random companies
     */
    async function createRandomContacts() {
      logger.notice('🚀 Starting creation of random companies in Bitrix24')
      logger.notice(`📊 Planned to create: ${args.total} companies`)
      logger.notice(`👤 Responsible: user ID ${args.assignedById}`)
      logger.notice('─'.repeat(50))

      const healthCheckData = await b24.tools.healthCheck.make({ requestId: 'healthCheck' })
      logger.notice(`Health check: ${healthCheckData ? 'success' : 'fail'}`)
      if (!healthCheckData) {
        return
      }
      logger.notice('\n')

      const startTime = Date.now()

      for (let i = 0; i < args.total; i++) {
        await createCompany(i + 1)
        showProgress()
      }

      const endTime = Date.now()
      const duration = ((endTime - startTime) / 1000).toFixed(2)

      logger.notice('\n')
      logger.notice('─'.repeat(50))
      logger.notice('✅ Completed!')
      logger.notice(`📈 Successfully created: ${createdCount} companies`)
      logger.notice(`⏱️ Total execution time: ${duration} seconds`)
      logger.notice(`📊 Average time per company: ${(duration / args.total).toFixed(2)} seconds`)

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

    await createRandomContacts()
  }
})
