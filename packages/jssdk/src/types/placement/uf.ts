import type { BoolString, NumberString, PlacementViewMode } from '../common'
import { EnumCrmEntityType } from '../crm'

/**
 * UF embedding properties interface
 *
 * @link https://dev.1c-bitrix.ru/learning/course/index.php?COURSE_ID=99&LESSON_ID=8633
 */
export interface IPlacementUF {
	/**
	 * UF ID
	 */
	FIELD_NAME: string

	/**
	 * The identifier of the entity to which the field is bound
	 */
	ENTITY_ID: EnumCrmEntityType

	/**
	 * The identifier of the entity element whose field value is being edited
	 */
	ENTITY_VALUE_ID: NumberString

	/**
	 * The mode in which the field is called
	 */
	MODE: PlacementViewMode

	/**
	 * Field Requirement Flag
	 */
	MANDATORY: BoolString

	/**
	 * Field multiplicity flag
	 */
	MULTIPLE: BoolString

	/**
	 * Current value of the field. For a multiple field, an array of values.
	 */
	VALUE: any

	/**
	 * External field code
	 */
	XML_ID: string
}
