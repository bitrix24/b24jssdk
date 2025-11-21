/**
 * String which is actually a number, like `'20.23'`
 */
export type NumberString = string

/**
 * Like `'2018-06-07T03:00:00+03:00'`
 */
export type ISODate = string
export type BoolString = 'Y' | 'N'
export type GenderString = 'M' | 'F' | ''

export type PlacementViewMode = 'view' | 'edit'
export type TextType = 'text' | 'html'

export type Fields = {
  readonly [key: string]: {
    readonly type: string
    readonly isRequired: boolean
    readonly isReadOnly: boolean
    readonly isImmutable: boolean
    readonly isMultiple: boolean
    readonly isDynamic: boolean
    readonly title: string
    readonly upperName?: string
  }
}

export type MultiField = {
  readonly ID: NumberString
  readonly VALUE_TYPE: string
  readonly VALUE: string
  readonly TYPE_ID: string
}

export type MultiFieldArray = ReadonlyArray<
  Pick<MultiField, 'VALUE' | 'VALUE_TYPE'>
>

/**
 * Describes the inline settings in UF
 */
export type UserFieldType = {
  USER_TYPE_ID: string
  HANDLER: string
  TITLE: string
  DESCRIPTION: string
  OPTIONS?: {
    height: number
  }
}

/**
 * Data types
 * @link https://apidocs.bitrix24.ru/api-reference/data-types.html
 * @link https://dev.1c-bitrix.ru/rest_help/crm/dynamic/methodscrmitem/crm_item_fields.php
 */
export enum DataType {
  undefined = 'undefined',
  any = 'any',
  integer = 'integer',
  boolean = 'boolean',
  double = 'double',
  date = 'date',
  datetime = 'datetime',
  string = 'string',
  text = 'text',
  file = 'file',
  array = 'array',
  object = 'object',
  user = 'user',
  location = 'location',
  crmCategory = 'crm_category',
  crmStatus = 'crm_status',
  crmCurrency = 'crm_currency'
}
