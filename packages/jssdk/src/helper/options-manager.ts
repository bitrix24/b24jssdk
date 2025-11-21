import type { DateTime } from 'luxon'
import { AbstractHelper } from './abstract-helper'
import type { TypeB24 } from '../types/b24'
import type { Result } from '../core/result'
import { TypeOption } from '../types/b24-helper'
import Type from '../tools/type'
import Text from '../tools/text'

export class OptionsManager extends AbstractHelper {
  protected override _data: Map<string, any>
  protected _type: 'app' | 'user'

  // region static ////
  static getSupportTypes(): TypeOption[] {
    return [
      TypeOption.NotSet,
      TypeOption.JsonArray,
      TypeOption.JsonObject,
      TypeOption.FloatVal,
      TypeOption.IntegerVal,
      TypeOption.BoolYN,
      TypeOption.StringVal
    ]
  }

  static prepareArrayList(list: any): any[] {
    if (Type.isArray(list)) {
      return list
    }

    if (Type.isObject(list)) {
      return Object.values(list)
    }

    return []
  }

  // endregion ////

  // region Init ////
  constructor(b24: TypeB24, type: 'app' | 'user') {
    super(b24)
    this._type = type
    this._data = new Map()
  }

  get data(): Map<string, any> {
    return this._data
  }

  reset() {
    this.data.clear()
  }

  /**
   * @inheritDoc
   */
  override async initData(data: any): Promise<void> {
    this.reset()

    if (Type.isObject(data)) {
      for (const [key, value] of Object.entries(data)) {
        this.data.set(key, value)
      }
    }
  }

  // endregion ////

  // region Get ////
  getJsonArray(key: string, defValue: any[] = []): any[] {
    if (!this.data.has(key)) {
      return defValue
    }

    let data = this.data.get(key)

    try {
      data = JSON.parse(data)

      if (!Type.isArray(data) && !Type.isObject(data)) {
        data = defValue
      }
    } catch (error) {
      this.getLogger().error(error)
      data = defValue
    }

    return OptionsManager.prepareArrayList(data)
  }

  getJsonObject(key: string, defValue: object = {}): object {
    if (!this.data.has(key)) {
      return defValue
    }

    let data = this.data.get(key)

    try {
      data = JSON.parse(data)
    } catch (error) {
      this.getLogger().error(error)
      data = defValue
    }

    if (!Type.isObject(data)) {
      data = defValue
    }

    return data
  }

  getFloat(key: string, defValue: number = 0.0): number {
    if (!this.data.has(key)) {
      return defValue
    }

    return Text.toNumber(this.data.get(key))
  }

  getInteger(key: string, defValue: number = 0): number {
    if (!this.data.has(key)) {
      return defValue
    }

    return Text.toInteger(this.data.get(key))
  }

  getBoolYN(key: string, defValue: boolean = true): boolean {
    if (!this.data.has(key)) {
      return defValue
    }

    return Text.toBoolean(this.data.get(key))
  }

  getBoolNY(key: string, defValue: boolean = false): boolean {
    if (!this.data.has(key)) {
      return defValue
    }

    return Text.toBoolean(this.data.get(key))
  }

  getString(key: string, defValue: string = ''): string {
    if (!this.data.has(key)) {
      return defValue
    }

    return this.data.get(key).toString()
  }

  getDate(key: string, defValue: null | DateTime = null): null | DateTime {
    if (!this.data.has(key)) {
      return defValue
    }

    try {
      const result = Text.toDateTime(this.data.get(key).toString())
      if (result.isValid) {
        return result
      } else {
        return defValue
      }
    } catch {
      return defValue
    }
  }

  // endregion ////

  // region Tools ////
  encode(value: any): string {
    return JSON.stringify(value)
  }

  decode(data: string, defaultValue: any): any {
    try {
      if (data.length > 0) {
        return JSON.parse(data)
      }

      return defaultValue
    } catch (error) {
      this.getLogger().warn(error, data)
    }

    return defaultValue
  }

  // endregion ////

  // region Save ////
  protected getMethodSave(): string {
    switch (this._type) {
      case 'app':
        return 'app.option.set'
      case 'user':
        return 'user.option.set'
    }
  }

  public async save(
    options: any,
    optionsPull?: {
      moduleId: string
      command: string
      params: any
    }
  ): Promise<Result> {
    const commands = []
    commands.push({
      method: this.getMethodSave(),
      params: {
        options
      }
    })

    if (Type.isObject(optionsPull)) {
      commands.push({
        method: 'pull.application.event.add',
        params: {
          COMMAND: optionsPull?.command,
          PARAMS: optionsPull?.params,
          MODULE_ID: optionsPull?.moduleId
        }
      })
    }

    return this._b24.callBatch(commands, true)
  }

  // endregion ////
}
