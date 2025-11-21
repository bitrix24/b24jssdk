import { consola } from 'consola'
import { B24Hook } from '@bitrix24/b24jssdk'
import { defineCommand } from 'citty'

// Списки случайных имен и фамилий
const firstNames = [
  'Александр', 'Алексей', 'Андрей', 'Антон', 'Артем', 'Борис', 'Вадим', 'Валентин',
  'Валерий', 'Василий', 'Виктор', 'Виталий', 'Владимир', 'Владислав', 'Геннадий',
  'Георгий', 'Григорий', 'Даниил', 'Денис', 'Дмитрий', 'Евгений', 'Егор', 'Иван',
  'Игорь', 'Илья', 'Кирилл', 'Константин', 'Леонид', 'Максим', 'Михаил', 'Никита',
  'Николай', 'Олег', 'Павел', 'Петр', 'Роман', 'Руслан', 'Сергей', 'Станислав',
  'Степан', 'Тимофей', 'Федор', 'Юрий', 'Ярослав'
]

const lastNames = [
  'Иванов', 'Смирнов', 'Кузнецов', 'Попов', 'Васильев', 'Петров', 'Соколов',
  'Михайлов', 'Новиков', 'Федоров', 'Морозов', 'Волков', 'Алексеев', 'Лебедев',
  'Семенов', 'Егоров', 'Павлов', 'Козлов', 'Степанов', 'Николаев', 'Орлов',
  'Андреев', 'Макаров', 'Никитин', 'Захаров', 'Зайцев', 'Соловьев', 'Борисов',
  'Яковлев', 'Григорьев', 'Романов', 'Воробьев', 'Сергеев', 'Кузьмин', 'Фролов',
  'Александров', 'Дмитриев', 'Королев', 'Гусев', 'Киселев', 'Ильин', 'Максимов',
  'Поляков', 'Сорокин', 'Виноградов', 'Ковалев', 'Белов', 'Медведев', 'Антонов',
  'Тарасов'
]

/**
 * node -r dotenv/config ./cli/index.mjs make contacts --total=10
 */
export default defineCommand({
  meta: {
    name: 'contacts',
    description: 'Make a new contacts.'
  },
  args: {
    total: {
      description: 'Сколько создать',
      required: true
    },
    assignedById: {
      description: 'Ответственный пользователь',
      default: 1
    }
  },
  async setup({ args }) {
    let createdCount = 0
    let errors = []

    // Генерация случайного контакта
    function generateRandomContact() {
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)]
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)]

      return {
        NAME: firstName,
        LAST_NAME: lastName,
        ASSIGNED_BY_ID: args.assignedById,
        OPENED: 'Y',
        TYPE_ID: 'CLIENT',
        SOURCE_ID: 'OTHER'
      }
    }

    // Создание одного контакта
    async function createContact(contactNumber) {
      try {
        const contactData = generateRandomContact()

        const response = await b24.callMethod(
          'crm.contact.add',
          {
            fields: contactData
          }
        )

        if (!response.isSuccess) {
          throw new Error(response.data.error_description || 'Unknown error')
        }

        createdCount++
        const newId = Number.parseInt(response.getData()?.result || '0')
        // consola.info(`✅ Контакт ${contactNumber} создан: ${contactData.NAME} ${contactData.LAST_NAME} (ID: ${newId})`)

        return { success: true, contactId: newId }
      } catch (error) {
        const errorMessage = `Ошибка при создании контакта ${contactNumber}: ${error.message}`
        errors.push(errorMessage)
        consola.error(`❌ ${errorMessage}`)
        return { success: false, error: errorMessage }
      }
    }

    // Отображение прогресса
    function showProgress() {
      const percentage = Math.round((createdCount / args.total) * 100)
      const progressBar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5))
      process.stdout.clearLine()
      process.stdout.cursorTo(0)
      process.stdout.write(`\rПрогресс: [${progressBar}] ${percentage}% (${createdCount}/${args.total})`)
    }

    // Основная функция создания контактов
    async function createRandomContacts() {
      consola.log('🚀 Запуск создания случайных контактов в Bitrix24')
      consola.log(`📊 Планируется создать: ${args.total} контактов`)
      consola.log(`👤 Ответственный: пользователь ID ${args.assignedById}`)
      consola.log('─'.repeat(50))

      const startTime = Date.now()

      for (let i = 0; i < args.total; i++) {
        await createContact(i + 1)
        showProgress()
      }

      const endTime = Date.now()
      const duration = ((endTime - startTime) / 1000).toFixed(2)

      consola.log('\n\n' + '─'.repeat(50))
      consola.log('✅ Завершено!')
      consola.log(`📈 Успешно создано: ${createdCount} контактов`)
      consola.log(`⏱️ Время выполнения: ${duration} секунд`)

      if (errors.length > 0) {
        consola.log(`❌ Ошибок: ${errors.length}`)
        consola.log('\nСписок ошибок:')
        errors.forEach((error, index) => {
          consola.log(`${index + 1}. ${error}`)
        })
      }
    }

    let hookPath = ''
    hookPath = process.env?.B24_HOOK || ''
    if (hookPath.length < 1) {
      consola.error(`🚨 Wrong hook! Set it on .env file`)
      process.exit(1)
    }
    const b24 = B24Hook.fromWebhookUrl(hookPath)
    consola.info(`Используемый Битрикс24 : ${b24.getTargetOrigin()}`)

    await createRandomContacts()
  }
})
