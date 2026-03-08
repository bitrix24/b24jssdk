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
