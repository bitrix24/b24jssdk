import { consola } from 'consola'
import { B24Hook, EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'
import { defineCommand } from 'citty'

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

/**
 * Command for generating random companies in Bitrix24
 * Usage: node -r dotenv/config ./cli/index.mjs make companies --total=10
 */
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
      default: 1
    }
  },
  async setup({ args }) {
    let createdCount = 0
    let errors = []

    // Initialize Bitrix24 connection
    const hookPath = process.env?.B24_HOOK || ''
    if (!hookPath) {
      consola.error('🚨 B24_HOOK environment variable is not set! Please configure it in your .env file')
      process.exit(1)
    }

    const b24 = B24Hook.fromWebhookUrl(hookPath)
    consola.info(`Connected to Bitrix24: ${b24.getTargetOrigin()}`)

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
      try {
        const companyData = generateRandomCompany()

        const response = await b24.callMethod(
          'crm.item.add',
          {
            entityTypeId: EnumCrmEntityTypeId.company,
            fields: companyData
          }
        )

        if (!response.isSuccess) {
          throw new Error(response.getErrorMessages().join(';\n'))
        }

        const result = response.getData()
        const companyId = result?.result || 0

        if (!companyId) {
          throw new Error('No company ID returned from API')
        }

        createdCount++
        return { success: true, companyId }
      } catch (error) {
        const errorMessage = `Error creating company ${companyNumber}: ${error.message}`
        errors.push(errorMessage)
        consola.error(`❌ ${errorMessage}`)
        return { success: false, error: errorMessage }
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
      consola.log('🚀 Starting creation of random companies in Bitrix24')
      consola.log(`📊 Planned to create: ${args.total} companies`)
      consola.log(`👤 Responsible: user ID ${args.assignedById}`)
      consola.log('─'.repeat(50))

      const startTime = Date.now()

      for (let i = 0; i < args.total; i++) {
        await createCompany(i + 1)
        showProgress()
      }

      const endTime = Date.now()
      const duration = ((endTime - startTime) / 1000).toFixed(2)

      consola.log('\n\n' + '─'.repeat(50))
      consola.log('✅ Completed!')
      consola.log(`📈 Successfully created: ${createdCount} companies`)
      consola.log(`⏱️ Total execution time: ${duration} seconds`)
      consola.log(`📊 Average time per company: ${(duration / args.total).toFixed(2)} seconds`)

      if (errors.length > 0) {
        consola.log(`❌ Errors encountered: ${errors.length}`)
        consola.log('\nList of errors:')
        if (errors.length <= 10) {
          consola.log('\nError details:')
          errors.forEach((error, index) => {
            consola.log(`${index + 1}. ${error}`)
          })
        } else {
          consola.log(`\nFirst 10 errors (out of ${errors.length}):`)
          errors.slice(0, 10).forEach((error, index) => {
            consola.log(`${index + 1}. ${error}`)
          })
        }
      } else {
        consola.log('🎉 No errors encountered during creation process!')
      }
    }

    await createRandomContacts()
  }
})
