import type { Language } from '../types'

export const LANGUAGES: readonly Language[] = ['english', 'russian', 'spanish', 'chinese'] as const

export const COUNTRY_CODES: Record<Language, string> = {
  english: '+1', // USA
  russian: '+7', // Russia
  spanish: '+34', // Spain
  chinese: '+86' // China
} as const

export const EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'company.com'] as const

export const PRIORITY_VALUES = ['low', 'average', 'high'] as const
export const STATUS_VALUES = ['pending', 'in_progress', 'supposedly_completed', 'completed', 'deferred', 'declined'] as const

export const SOURCES = ['WEBFORM', 'CALL', 'OTHER', 'RC_GENERATOR'] as const
export const POSTS = ['Manager', 'Developer', 'Director', 'Analyst', 'Specialist'] as const

export const THEMES_PRODUCTS = {
  industrial: {
    ru: ['Конвейер', 'Датчик', 'Клапан', 'Турбина', 'Привод', 'Модуль', 'Станок'],
    en: ['Conveyor', 'Sensor', 'Valve', 'Turbine', 'Actuator', 'Module', 'Lathe'],
    zh: ['传送带', '传感器', '阀门', '涡轮机', '执行器', '模块', '车床'],
    es: ['Transportador', 'Sensor', 'Válvula', 'Turbina', 'Actuador', 'Módulo', 'Torno']
  },
  fashion: {
    ru: ['Худи', 'Футболка', 'Брюки', 'Жилет', 'Куртка', 'Ремень', 'Кроссовки'],
    en: ['Hoodie', 'T-shirt', 'Pants', 'Vest', 'Jacket', 'Belt', 'Sneakers'],
    zh: ['连帽衫', 'T恤', '裤子', '背心', '夹克', '腰带', '运动鞋'],
    es: ['Sudadera', 'Camiseta', 'Pantalones', 'Chaleco', 'Chaqueta', 'Cinturón', 'Zapatillas']
  }
}
