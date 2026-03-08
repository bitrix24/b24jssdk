import { B24Hook, EnumCrmEntityTypeId, Logger, LogLevel, ConsoleV2Handler, ParamsFactory, SdkError, Result } from '@bitrix24/b24jssdk'
import type { GetPayload } from '@bitrix24/b24jssdk'
import { defineCommand } from 'citty'
import 'dotenv/config'
import type { Language, NamesByLanguage, FmField, ContactFields, CrmItemAddResult } from '../../types'
import { LANGUAGES, EMAIL_DOMAINS, SOURCES, POSTS } from '../../constants'
import { pickRandom, generatePhoneNumber, showProgress } from '../../utils'

/**
 * CLI Command to populate Bitrix24 with randomized contact data.
 *
 * Supports multi-language name generation, realistic email patterns,
 * and handles batch processing via the Bitrix24 JSSDK.
 *
 * @usage pnpm --filter @bitrix24/b24jssdk-cli dev make contacts --total=50 --assignedById=1
 */

// Arrays for generating realistic contact names
const names: Record<Language, NamesByLanguage> = {
  english: {
    firstNames: [
      'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles',
      'Christopher', 'Daniel', 'Matthew', 'Anthony', 'Donald', 'Mark', 'Paul', 'Steven', 'Andrew', 'Kenneth',
      'Joshua', 'Kevin', 'Brian', 'George', 'Edward', 'Ronald', 'Timothy', 'Jason', 'Jeffrey', 'Ryan',
      'Jacob', 'Gary', 'Nicholas', 'Eric', 'Jonathan', 'Stephen', 'Larry', 'Justin', 'Scott', 'Brandon',
      'Benjamin', 'Samuel', 'Gregory', 'Frank', 'Alexander', 'Raymond', 'Patrick', 'Jack', 'Dennis', 'Jerry',
      'Tyler', 'Aaron', 'Jose', 'Adam', 'Nathan', 'Henry', 'Douglas', 'Zachary', 'Peter', 'Kyle'
    ],
    lastNames: [
      'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
      'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
      'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
      'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
      'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts'
    ]
  },
  russian: {
    firstNames: [
      'Александр', 'Алексей', 'Андрей', 'Антон', 'Артем', 'Борис', 'Вадим', 'Валентин',
      'Валерий', 'Василий', 'Виктор', 'Виталий', 'Владимир', 'Владислав', 'Геннадий',
      'Георгий', 'Григорий', 'Даниил', 'Денис', 'Дмитрий', 'Евгений', 'Егор', 'Иван',
      'Игорь', 'Илья', 'Кирилл', 'Константин', 'Леонид', 'Максим', 'Михаил', 'Никита',
      'Николай', 'Олег', 'Павел', 'Петр', 'Роман', 'Руслан', 'Сергей', 'Станислав',
      'Степан', 'Тимофей', 'Федор', 'Юрий', 'Ярослав'
    ],
    lastNames: [
      'Иванов', 'Смирнов', 'Кузнецов', 'Попов', 'Васильев', 'Петров', 'Соколов',
      'Михайлов', 'Новиков', 'Федоров', 'Морозов', 'Волков', 'Алексеев', 'Лебедев',
      'Семенов', 'Егоров', 'Павлов', 'Козлов', 'Степанов', 'Николаев', 'Орлов',
      'Андреев', 'Макаров', 'Никитин', 'Захаров', 'Зайцев', 'Соловьев', 'Борисов',
      'Яковлев', 'Григорьев', 'Романов', 'Воробьев', 'Сергеев', 'Кузьмин', 'Фролов',
      'Александров', 'Дмитриев', 'Королев', 'Гусев', 'Киселев', 'Ильин', 'Максимов',
      'Поляков', 'Сорокин', 'Виноградов', 'Ковалев', 'Белов', 'Медведев', 'Антонов',
      'Тарасов'
    ]
  },
  spanish: {
    firstNames: [
      'Carlos', 'José', 'Manuel', 'Francisco', 'David', 'Juan', 'Javier', 'Antonio', 'Daniel', 'Miguel',
      'Rafael', 'Alejandro', 'Jesús', 'Pedro', 'Luis', 'Ángel', 'Sergio', 'Fernando', 'Pablo', 'Jorge',
      'Alberto', 'Raúl', 'Diego', 'Rubén', 'Adrián', 'Enrique', 'Víctor', 'Roberto', 'Mario', 'Ignacio',
      'Óscar', 'Andrés', 'Ricardo', 'Joaquín', 'Santiago', 'Eduardo', 'Gabriel', 'Marcos', 'Héctor', 'Iván',
      'Gustavo', 'Jaime', 'Julio', 'César', 'Ramón', 'Salvador', 'Tomás', 'Agustín', 'Emilio', 'Nicolás'
    ],
    lastNames: [
      'García', 'Fernández', 'González', 'Rodríguez', 'López', 'Martínez', 'Sánchez', 'Pérez', 'Martín', 'Gómez',
      'Ruiz', 'Hernández', 'Jiménez', 'Díaz', 'Moreno', 'Álvarez', 'Muñoz', 'Romero', 'Alonso', 'Gutiérrez',
      'Navarro', 'Torres', 'Domínguez', 'Vázquez', 'Ramos', 'Gil', 'Ramírez', 'Serrano', 'Blanco', 'Suárez',
      'Molina', 'Morales', 'Ortega', 'Delgado', 'Castro', 'Ortiz', 'Rubio', 'Marín', 'Sanz', 'Núñez',
      'Iglesias', 'Medina', 'Garrido', 'Cortés', 'Castillo', 'Santos', 'Lozano', 'Guerrero', 'Cano', 'Prieto'
    ]
  },
  chinese: {
    firstNames: [
      '伟', '强', '勇', '军', '磊', '洋', '超', '鹏', '杰', '鑫',
      '浩', '明', '亮', '建', '波', '宇', '飞', '凯', '帅', '晨',
      '阳', '龙', '华', '斌', '辉', '敏', '静', '丽', '娟', '艳',
      '娜', '芳', '颖', '玲', '婷', '慧', '洁', '琳', '雪', '怡',
      '梅', '燕', '丹', '萍', '莹', '蕾', '雯', '欣', '璐', '薇'
    ],
    lastNames: [
      '王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴',
      '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗',
      '梁', '宋', '郑', '谢', '韩', '唐', '冯', '于', '董', '萧',
      '程', '曹', '袁', '邓', '许', '傅', '沈', '曾', '彭', '吕',
      '苏', '卢', '蒋', '蔡', '魏', '贾', '丁', '薛', '叶', '阎'
    ]
  }
} as const

export default defineCommand({
  meta: {
    name: 'contacts',
    description: 'Generate random contacts in Bitrix24'
  },
  args: {
    total: { description: 'Number of contacts to create', required: true },
    assignedById: { description: 'Assigned user ID', default: '1' }
  },
  async setup({ args }) {
    const params = {
      total: Number.parseInt(args.total),
      assignedById: Number.parseInt(args.assignedById)
    }

    let createdCount = 0

    // region Logger ////
    const logger = Logger.create('contacts')
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
     * Generates a realistic email address based on name and localization.
     *
     * @param {string} firstName - Contact's first name.
     * @param {string} lastName - Contact's last name.
     * @param {Language} language - Used to determine naming convention (e.g., Pinyin for Chinese).
     * @returns {string} Formatted email address.
     */
    function generateEmail(firstName: string, lastName: string, language: Language): string {
      const domain = pickRandom(EMAIL_DOMAINS)

      // For Chinese names, use Pinyin-like format
      if (language === 'chinese') {
        return `${lastName.toLowerCase()}${firstName.toLowerCase()}@${domain}`
      }

      // For other languages, use first.last format
      return `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`
    }

    /**
     * Picks a random first and last name from the dictionary based on the specified language.
     *
     * @param {Language} language - The target language for name generation.
     * @returns {{ firstName: string, lastName: string }} An object containing the generated name pair.
     */
    function generateContactName(language: Language): { firstName: string, lastName: string } {
      const languageData = names[language]
      const firstName = pickRandom(languageData.firstNames)
      const lastName = pickRandom(languageData.lastNames)

      return { firstName, lastName }
    }

    /**
     * Generates a complete contact payload for the Bitrix24 CRM.
     * Includes randomized phone numbers, emails, job titles, and lead sources.
     *
     * @returns {ContactFields} Validated contact object for crm.item.add.
     */
    function generateRandomContact(): ContactFields {
      const language = pickRandom(LANGUAGES)
      const { firstName, lastName } = generateContactName(language)

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
          value: generateEmail(firstName, lastName, language),
          typeId: 'EMAIL'
        })
      }

      return {
        name: firstName,
        lastName,
        assignedById: params.assignedById,
        open: 'Y',
        typeId: 'CLIENT',
        sourceId: pickRandom(SOURCES),
        post: pickRandom(POSTS),
        fm
      }
    }

    /**
     * Sends a request to Bitrix24 to create a contact and handles API responses.
     *
     * @param {number} contactNumber - Current sequence number for tracking.
     * @returns {Promise<Result>} A Result instance containing the contact ID or error details.
     */
    async function createContact(contactNumber: number): Promise<Result> {
      const result = new Result()

      try {
        const contactData = generateRandomContact()

        const response = await b24.actions.v2.call.make<CrmItemAddResult>({
          method: 'crm.item.add',
          params: {
            entityTypeId: EnumCrmEntityTypeId.contact,
            fields: contactData
          }
        })

        if (!response.isSuccess) {
          return result.addError(new SdkError({
            code: 'PLAYGROUND_CLI_ERROR',
            description: response.getErrorMessages().join(';'),
            status: 404
          }))
        }

        const resultData = response.getData() as GetPayload<CrmItemAddResult> | undefined
        const contactId = resultData?.result?.item?.id ?? 0

        if (!contactId) {
          return result.addError(new SdkError({
            code: 'PLAYGROUND_CLI_ERROR',
            description: 'No contact ID returned from API',
            status: 404
          }))
        }

        createdCount++
        return result.setData({ contactId })
      } catch (error: unknown) {
        return result.addError(SdkError.fromException(
          `Error creating contact ${contactNumber}: ${error instanceof Error ? error.message : error}`, {
            code: 'PLAYGROUND_CLI_ERROR',
            status: 404
          }))
      }
    }

    /**
     * Orchestrator function that manages the execution flow:
     * 1. Validates connection (Health Check).
     * 2. Loops through the creation process.
     * 3. Reports progress and final execution statistics to the console.
     *
     * @returns {Promise<void>}
     */
    async function createRandomContacts(): Promise<void> {
      logger.notice('🚀 Starting creation of random contacts in Bitrix24')
      logger.notice(`📊 Planned to create: ${params.total} contacts`)
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
        const contactResult = await createContact(i + 1)
        errors.push(...contactResult.getErrorMessages())
        showProgress(createdCount, params.total)
      }

      const endTime = Date.now()
      const duration = ((endTime - startTime) / 1000).toFixed(2)

      logger.notice('\n')
      logger.notice('─'.repeat(50))
      logger.notice('✅ Completed!')
      logger.notice(`📈 Successfully created: ${createdCount} contacts`)
      logger.notice(`⏱️ Total execution time: ${duration} seconds`)
      logger.notice(`📊 Average time per contact: ${(Number(duration) / params.total).toFixed(2)} seconds`)

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
