import { consola } from 'consola'
import { B24Hook, EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'
import { defineCommand } from 'citty'

// Arrays for generating realistic contact names
const names = {
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
}

const languages = ['english', 'russian', 'spanish', 'chinese']

const sources = ['WEBFORM', 'CALL', 'OTHER', 'RC_GENERATOR']

/**
 * Command for generating random contacts in Bitrix24
 * Usage: node -r dotenv/config ./cli/index.mjs make contacts --total=10
 */
export default defineCommand({
  meta: {
    name: 'contacts',
    description: 'Generate random contacts in Bitrix24'
  },
  args: {
    total: {
      description: 'Number of contacts to create',
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
    function generateEmail(firstName, lastName, language) {
      const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'company.com']
      const domain = domains[Math.floor(Math.random() * domains.length)]

      // For Chinese names, use Pinyin-like format
      if (language === 'chinese') {
        return `${lastName.toLowerCase()}${firstName.toLowerCase()}@${domain}`
      }

      // For other languages, use first.last format
      return `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`
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
     * Generates a realistic contact name by combining
     */
    function generateContactName(language) {
      const languageData = names[language]
      const firstName = languageData.firstNames[Math.floor(Math.random() * languageData.firstNames.length)]
      const lastName = languageData.lastNames[Math.floor(Math.random() * languageData.lastNames.length)]

      return { firstName, lastName }
    }

    /**
     * Generates random contact data
     */
    function generateRandomContact() {
      const language = languages[Math.floor(Math.random() * languages.length)]

      const { firstName, lastName } = generateContactName(language)

      return {
        name: firstName,
        lastName: lastName,
        assignedById: args.assignedById,
        open: 'Y',
        typeId: 'CLIENT',
        sourceId: sources[Math.floor(Math.random() * sources.length)],
        // Additional optional fields for more realistic data
        post: ['Manager', 'Developer', 'Director', 'Analyst', 'Specialist'][Math.floor(Math.random() * 5)],
        fm: [
          (Math.random() > 0.5 && {
            valueType: 'WORK',
            value: generatePhoneNumber(language),
            typeId: 'PHONE'
          }) || undefined,
          (Math.random() > 0.7 && {
            valueType: 'WORK',
            value: generateEmail(firstName, lastName, language),
            typeId: 'EMAIL'
          }) || undefined
        ].filter(Boolean)
      }
    }

    /**
     * Creates a single contact in Bitrix24
     */
    async function createContact(contactNumber) {
      try {
        const contactData = generateRandomContact()

        const response = await b24.callMethod(
          'crm.item.add',
          {
            entityTypeId: EnumCrmEntityTypeId.contact,
            fields: contactData
          }
        )

        if (!response.isSuccess) {
          throw new Error(response.getErrorMessages().join(';\n'))
        }

        const result = response.getData()
        const contactId = result?.result || 0

        if (!contactId) {
          throw new Error('No contact ID returned from API')
        }

        createdCount++
        return { success: true, contactId }
      } catch (error) {
        const errorMessage = `Error creating contact ${contactNumber}: ${error.message}`
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
     * Main function for creating random contacts
     */
    async function createRandomContacts() {
      consola.log('🚀 Starting creation of random contacts in Bitrix24')
      consola.log(`📊 Planned to create: ${args.total} contacts`)
      consola.log(`👤 Responsible: user ID ${args.assignedById}`)
      consola.log('─'.repeat(50))

      const startTime = Date.now()

      for (let i = 0; i < args.total; i++) {
        await createContact(i + 1)
        showProgress()
      }

      const endTime = Date.now()
      const duration = ((endTime - startTime) / 1000).toFixed(2)

      consola.log('\n\n' + '─'.repeat(50))
      consola.log('✅ Completed!')
      consola.log(`📈 Successfully created: ${createdCount} contacts`)
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
