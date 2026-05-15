import type { MessageManager } from './message'
import { MessageCommands } from './message'
import type { NumberString } from '../types/common'

export type SelectedUser = {
  /**
   * user identifier
   */
  id: NumberString

  /**
   * formatted username
   */
  name: string

  photo: string

  position: string

  url: string

  /**
   * The flag indicates that the selected user is a subordinate of the current user
   */
  sub: boolean

  /**
   * The flag indicates that the selected user is the manager of the current user
   */
  sup: boolean
}

export type SelectedAccess = {
  /**
   * access permission identifier. Examples of identifiers:
   * - U1 — user with identifier 1
   * - IU1 — employees with identifier 1
   * - DR2 — all department and subdepartment employees with identifier 2
   * - D6 — all department employees with identifier 6
   * - G2 — group with identifier 2 (all visitors)
   * - SG4 — social network group with identifier 4
   * - AU — all authorized users
   * - CR — current user
   */
  id:
    | `AU`
    | `CR`
    | `U${number}`
    | `IU${number}`
    | `DR${number}`
    | `D${number}`
    | `G${number}`
    | `SG${number}`

  /**
   * name of the access permission
   */
  name: string
}

export type SelectCRMParamsEntityType
  = | 'lead'
    | 'contact'
    | 'company'
    | 'deal'
    | 'quote'

export type SelectCRMParamsValue = {
  lead?: number[]
  contact?: number[]
  company?: number[]
  deal?: number[]
  quote?: number[]
}

export type SelectCRMParams = {
  /**
   * Which types of objects to display in the dialog. Possible values:
   * - lead — Leads
   * - contact — Contacts
   * - company — Companies
   * - deal — Deals
   * - quote — Estimates
   */
  entityType: SelectCRMParamsEntityType[]

  /**
   * Whether multiple objects can be selected. Default is `false`
   */
  multiple: boolean

  /**
   * Which objects to initially add to the selected in the dialog. Works only if `multiple = true`
   */
  value?: SelectCRMParamsValue
}

export type SelectedCRMEntity = {
  id: string
  type: SelectCRMParamsEntityType
  place: string
  title: string
  desc: string
  url: string
}

export type SelectedCRM = {
  lead?: (SelectedCRMEntity & { id: `L_${number}` })[]
  contact?: (SelectedCRMEntity & { id: `C_${number}`, image: string })[]
  company?: (SelectedCRMEntity & { id: `CO_${number}`, image: string })[]
  deal?: (SelectedCRMEntity & { id: `D_${number}` })[]
  quote?: (SelectedCRMEntity & { id: `Q_${number}` })[]
}

/**
 * Select dialog manager
 *
 * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/system-dialogues/index.html
 */
export class DialogManager {
  #messageManager: MessageManager

  constructor(messageManager: MessageManager) {
    this.#messageManager = messageManager
  }

  /**
   * Method displays the standard single user selection dialog
   * It only shows company employees
   *
   * @return {Promise<null|SelectedUser>}
   *
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/system-dialogues/bx24-select-user.html
   */
  async selectUser(): Promise<null | SelectedUser> {
    return this.#messageManager.send(MessageCommands.selectUser, {
      mult: false
    })
  }

  /**
   * Method displays the standard multiple user selection dialog
   * It only shows company employees
   *
   * @return {Promise<SelectedUser[]>}
   *
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/system-dialogues/bx24-select-users.html
   */
  async selectUsers(): Promise<SelectedUser[]> {
    return this.#messageManager.send(MessageCommands.selectUser, {
      mult: true
    })
  }

  /**
   * Method displays a standard access permission selection dialog
   *
   * @param {string[]} blockedAccessPermissions
   * @return {Promise<SelectedAccess[]>}
   *
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/system-dialogues/bx24-select-access.html
   */
  async selectAccess(
    blockedAccessPermissions: string[] = []
  ): Promise<SelectedAccess[]> {
    return this.#messageManager.send(MessageCommands.selectAccess, {
      value: blockedAccessPermissions
    })
  }

  /**
   * Invokes the system dialog for selecting CRM entities
   * (leads, contacts, companies, deals, quotes).
   *
   * The resolved `SelectedCRM` object contains a separate bucket per
   * entity type. Each present bucket is a real `Array`, so consumers can
   * use `.length`, `.map()`, `for..of`, etc. directly. Buckets for entity
   * types that were not selected (or not requested via `entityType`) are
   * left `undefined` rather than being set to an empty array.
   *
   * Note: the parent window historically returned each bucket as a
   * `Record<string, SelectedCRMEntity>` (e.g. `{ 0: {...}, 1: {...} }`).
   * The SDK normalizes that response to a real array before returning it.
   *
   * @param {SelectCRMParams} [params] - Filter and behavior options.
   *   - `entityType`: which entity types are shown in the dialog.
   *   - `multiple`: allow multiple selection (default `false`).
   *   - `value`: pre-selected entities (only applied when `multiple` is `true`).
   * @return {Promise<SelectedCRM>} Resolves to an object whose properties
   *   (`lead`, `contact`, `company`, `deal`, `quote`) are arrays of
   *   {@link SelectedCRMEntity} objects.
   *
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/system-dialogues/bx24-select-crm.html
   */
  async selectCRM(params?: SelectCRMParams): Promise<SelectedCRM> {
    const response = await this.#messageManager.send(MessageCommands.selectCRM, {
      entityType: params?.entityType,
      multiple: params?.multiple,
      value: params?.value
    }) as Partial<Record<SelectCRMParamsEntityType, unknown>> | null | undefined

    // The parent window returns each entity bucket as a Record<string, SelectedCRMEntity>
    // (e.g. { 0: {...}, 1: {...} }) rather than a real array. Normalize to arrays so
    // the runtime shape matches the documented `SelectedCRM` types.
    const result: SelectedCRM = {}
    if (!response) {
      return result
    }

    const toArray = <T>(bucket: unknown): T[] | undefined => {
      if (bucket === undefined || bucket === null) {
        return undefined
      }
      if (Array.isArray(bucket)) {
        return bucket as T[]
      }
      return Object.values(bucket as Record<string, T>)
    }

    const lead = toArray<SelectedCRMEntity & { id: `L_${number}` }>(response.lead)
    if (lead) result.lead = lead

    const contact = toArray<SelectedCRMEntity & { id: `C_${number}`, image: string }>(response.contact)
    if (contact) result.contact = contact

    const company = toArray<SelectedCRMEntity & { id: `CO_${number}`, image: string }>(response.company)
    if (company) result.company = company

    const deal = toArray<SelectedCRMEntity & { id: `D_${number}` }>(response.deal)
    if (deal) result.deal = deal

    const quote = toArray<SelectedCRMEntity & { id: `Q_${number}` }>(response.quote)
    if (quote) result.quote = quote

    return result
  }
}
