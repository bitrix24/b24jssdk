/**
 * String which is actually a number, like `'20.23'`
 */
export type NumberString = string

/**
 * Like `'2018-06-07T03:00:00+03:00'`
 */
export type ISODate = string;
export type BoolString = 'Y' | 'N';
export type GenderString = 'M' | 'F' | '';

export type PlacementViewMode = 'view' | 'edit';

export type Fields = {
	readonly [key: string]: {
		readonly type: string
		readonly isRequired: boolean
		readonly isReadOnly: boolean
		readonly isImmutable: boolean
		readonly isMultiple: boolean
		readonly isDynamic: boolean
		readonly title: string
	}
}

export type MultiField = {
	readonly ID: NumberString
	readonly VALUE_TYPE: string
	readonly VALUE: string
	readonly TYPE_ID: string
}

export type MultiFieldArray = ReadonlyArray<Pick<MultiField, 'VALUE' | 'VALUE_TYPE'>>

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