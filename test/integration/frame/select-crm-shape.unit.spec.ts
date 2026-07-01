/**
 * #57 — `frame.dialog.selectCRM` must resolve each present entity bucket
 * (`lead`, `contact`, `company`, `deal`, `quote`) as a real `Array`.
 *
 * v1.1.0 (BC #21) changed the resolved shape: the parent window historically
 * returned each bucket as a `Record<string, SelectedCRMEntity>` (e.g.
 * `{ '0': {...}, '1': {...} }`); `DialogManager.selectCRM` now normalises that
 * to a real array via `Object.values` in `packages/jssdk/src/frame/dialog.ts`.
 *
 * This is a MOCKED unit spec (portal-free, `.unit.spec.ts` → jsSdk:unit
 * project) because the iframe-only `postMessage` round-trip with a real
 * parent window is not reachable in CI. We stub the parent-window message
 * dispatcher (`MessageManager.send`) so it returns the RAW, Record-shaped
 * payload, exercising the real `Object.values` normalisation in `dialog.ts`.
 */
import { describe, it, expect } from 'vitest'
import { DialogManager } from '../../../packages/jssdk/src/frame/dialog'
import { MessageManager } from '../../../packages/jssdk/src/frame/message/controller'
import { MessageCommands } from '../../../packages/jssdk/src/frame/message'

/**
 * Build a `DialogManager` whose `MessageManager.send` is stubbed to return the
 * given RAW parent-window payload (Record-shaped buckets), capturing the
 * command it was invoked with.
 */
function buildDialogManager(rawPayload: unknown): {
  dialog: DialogManager
  getSentCommand: () => unknown
} {
  const mgr = new MessageManager({ getTargetOrigin: () => 'https://portal.bitrix24.com' } as never)
  let sentCommand: unknown
  ;(mgr as unknown as { send: (command: unknown) => Promise<unknown> }).send = async (command) => {
    sentCommand = command
    return rawPayload
  }
  return {
    dialog: new DialogManager(mgr),
    getSentCommand: () => sentCommand
  }
}

describe('#57 frame.dialog.selectCRM normalises Record buckets to arrays (v1.1.0 BC #21)', () => {
  it('resolves each present bucket as a real Array from a Record-shaped parent payload', async () => {
    // RAW parent-window form: each bucket is `Record<string, SelectedCRMEntity>`.
    const rawPayload = {
      lead: {
        0: { id: 'L_1', type: 'lead', place: '', title: 'Lead 1', desc: '', url: '' },
        1: { id: 'L_2', type: 'lead', place: '', title: 'Lead 2', desc: '', url: '' }
      },
      contact: {
        0: { id: 'C_10', type: 'contact', place: '', title: 'Contact 10', desc: '', url: '', image: '' }
      },
      company: {
        0: { id: 'CO_20', type: 'company', place: '', title: 'Company 20', desc: '', url: '', image: '' }
      },
      deal: {
        0: { id: 'D_30', type: 'deal', place: '', title: 'Deal 30', desc: '', url: '' }
      },
      quote: {
        0: { id: 'Q_40', type: 'quote', place: '', title: 'Quote 40', desc: '', url: '' }
      }
    }

    const { dialog, getSentCommand } = buildDialogManager(rawPayload)
    const result = await dialog.selectCRM({
      entityType: ['lead', 'contact', 'company', 'deal', 'quote'],
      multiple: true
    })

    // The dispatcher was invoked with the selectCRM command.
    expect(getSentCommand()).toBe(MessageCommands.selectCRM)

    // Every present bucket must be a real Array (v1.1.0 BC, not a Record).
    for (const bucket of [result.lead, result.contact, result.company, result.deal, result.quote]) {
      expect(Array.isArray(bucket)).toBe(true)
    }

    // At least one bucket carries entities with the documented id shape.
    expect(result.lead!.length).toBeGreaterThan(0)
    expect(result.lead![0].id).toMatch(/^([LCDQ]|CO)_\d+$/)
    expect(result.contact![0].id).toMatch(/^([LCDQ]|CO)_\d+$/)
  })

  it('leaves buckets that were not returned as undefined (not empty arrays)', async () => {
    const rawPayload = {
      contact: {
        0: { id: 'C_10', type: 'contact', place: '', title: 'Contact 10', desc: '', url: '', image: '' }
      }
    }

    const { dialog } = buildDialogManager(rawPayload)
    const result = await dialog.selectCRM({ entityType: ['contact'], multiple: false })

    expect(Array.isArray(result.contact)).toBe(true)
    expect(result.contact![0].id).toMatch(/^([LCDQ]|CO)_\d+$/)
    expect(result.lead).toBeUndefined()
    expect(result.deal).toBeUndefined()
  })

  it('returns an empty object when the parent payload is null', async () => {
    const { dialog } = buildDialogManager(null)
    const result = await dialog.selectCRM({ entityType: ['lead'], multiple: false })
    expect(result).toEqual({})
  })
})
