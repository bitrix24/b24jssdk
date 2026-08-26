/**
 * #139b — the page↔worker message contract.
 *
 * The bug this guards: `docs/app/workers/prettier.js` had no error handling, so
 * a throw in `prettier.format` or a blocked CDN produced NO reply. A missing
 * reply is not a failed format — the pending entry stays in `handlers` and the
 * promise never settles, so `CodeExample.vue` awaits it forever.
 *
 * The worker itself needs a browser to run, but this half does not: the routing
 * takes anything with `addEventListener` / `postMessage`, so a plain object
 * stands in for the Worker and replies can be delivered by hand.
 *
 * Two things are NOT covered, stated so a green run is not read as more than it
 * is:
 *
 * - That the worker actually sends `{ uid, error }` on every failure path. That
 *   is the other side of the contract and needs a real browser. These tests pin
 *   what the page does with each reply shape, so a regression on either side has
 *   something to fail against.
 * - That a settled entry is removed from `handlers`. Its only effect is memory —
 *   a promise cannot settle twice, so leaving the entry behind is invisible
 *   through the public surface. Verified by mutation: deleting the
 *   `handlers.delete(uid)` line leaves this file fully green. Covering it would
 *   mean exposing the map for the test's benefit, which is not worth it for an
 *   entry holding two closures.
 *
 * Portal-free (jsSdk:unit).
 */
import { describe, it, expect, vi } from 'vitest'
import { createPrettierWorkerApi } from '../../../docs/app/utils/prettierWorkerApi'
import type { WorkerReply } from '../../../docs/app/utils/prettierWorkerApi'

/** A stand-in for the Worker that lets a test deliver replies on demand. */
function fakeWorker() {
  const sent: { uid: number, message: unknown }[] = []
  let listener: ((event: { data: WorkerReply }) => void) | undefined

  return {
    sent,
    worker: {
      addEventListener(_type: 'message', fn: (event: { data: WorkerReply }) => void) {
        listener = fn
      },
      postMessage(message: unknown) {
        sent.push(message as { uid: number, message: unknown })
      }
    },
    reply(data: WorkerReply) {
      listener!({ data })
    }
  }
}

describe('#139b createPrettierWorkerApi', () => {
  it('resolves with the formatted source', async () => {
    const { worker, sent, reply } = fakeWorker()
    const api = createPrettierWorkerApi(worker)

    const pending = api.format('# hi')
    reply({ uid: sent[0]!.uid, message: '# hi\n' })

    await expect(pending).resolves.toBe('# hi\n')
  })

  it('rejects when the reply carries an error', async () => {
    // The whole point of the worker rewrite. Before it, this reply never came.
    const { worker, sent, reply } = fakeWorker()
    const api = createPrettierWorkerApi(worker)

    const pending = api.format('const = ')
    reply({ uid: sent[0]!.uid, error: 'Unexpected token' })

    await expect(pending).rejects.toBe('Unexpected token')
  })

  it('sends the format request in the shape the worker switches on', async () => {
    const { worker, sent } = fakeWorker()
    const api = createPrettierWorkerApi(worker)

    void api.format('x', { printWidth: 100 })

    expect(sent).toHaveLength(1)
    expect(sent[0]).toEqual({
      uid: 1,
      message: { type: 'format', source: 'x', options: { printWidth: 100 } }
    })
  })

  it('routes concurrent calls by uid, not by arrival order', async () => {
    const { worker, sent, reply } = fakeWorker()
    const api = createPrettierWorkerApi(worker)

    const first = api.format('a')
    const second = api.format('b')

    // Second in, first out — formatting time varies with input, so replies are
    // not ordered.
    reply({ uid: sent[1]!.uid, message: 'B' })
    reply({ uid: sent[0]!.uid, message: 'A' })

    await expect(first).resolves.toBe('A')
    await expect(second).resolves.toBe('B')
  })

  it('ignores a reply for an unknown uid instead of throwing', () => {
    // A duplicate reply, or one arriving after its entry settled. There is no
    // caller left to tell, and throwing inside the listener would take out the
    // handler for every later message.
    const { worker, reply } = fakeWorker()
    createPrettierWorkerApi(worker)

    expect(() => reply({ uid: 999, message: 'nobody asked' })).not.toThrow()
  })

  it('does not settle a call twice', async () => {
    // Promise semantics do most of the work here — see the file header on what
    // this does not prove about `handlers` being cleared.
    const { worker, sent, reply } = fakeWorker()
    const api = createPrettierWorkerApi(worker)

    const onResolve = vi.fn()
    const onReject = vi.fn()
    api.format('a').then(onResolve, onReject)

    reply({ uid: sent[0]!.uid, message: 'first' })
    reply({ uid: sent[0]!.uid, error: 'late failure' })
    await Promise.resolve()

    expect(onResolve).toHaveBeenCalledExactlyOnceWith('first')
    expect(onReject).not.toHaveBeenCalled()
  })
})
