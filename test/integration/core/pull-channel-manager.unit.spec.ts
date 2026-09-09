/**
 * `ChannelManager.getPublicIds` — the request it sends, and both branches of
 * what comes back.
 *
 * Written for #277. The pull client was the SDK's own last caller of the
 * deprecated `AbstractB24.callMethod`, and removing that method forced the call
 * onto `actions.v2.call.make`. Nothing covered it: mutating the method name to
 * `'wrong.method.name'` left all 1000 tests green, and the source still carries
 * a `// @memo test this` next to the very line that reads the response.
 *
 * So this pins the request *shape* rather than just "it resolves" — the method
 * name, the params, and that it goes out on `restApi:v2`. `getPublicIds`
 * swallows its own failures by design (it resolves `{}` rather than rejecting,
 * so a pull channel cannot take an application down), which is exactly why an
 * assertion on the answer alone cannot tell a right request from a wrong one.
 */
import { describe, expect, it, vi } from 'vitest'
import { ChannelManager } from '../../../packages/jssdk/src/pullClient/channel-manager'
import type { TypeB24 } from '../../../packages/jssdk/src/types/b24'

type Recorded = { method: string, params: unknown }

function makeB24(answer: () => Promise<unknown>) {
  const calls: Recorded[] = []
  const v2Call = {
    make: vi.fn((options: Recorded) => {
      calls.push(options)
      return answer()
    })
  }
  const v3Call = {
    make: vi.fn(() => {
      throw new Error('the pull client must not use restApi:v3')
    })
  }

  const b24 = {
    actions: { v2: { call: v2Call }, v3: { call: v3Call } }
  } as unknown as TypeB24

  return { b24, calls, v2Call, v3Call }
}

// The portal's own shape: snake_case, ISO strings. `setPublicIds` maps it to
// the camelCase `TypeChanel` with real `Date`s — asserting on the mapped form is
// what makes the "already held" case meaningful.
const DESCRIPTOR = {
  user_id: '7',
  public_id: 'public-7',
  signature: 'sig-7',
  start: new Date(Date.now() - 60_000).toISOString(),
  end: new Date(Date.now() + 3_600_000).toISOString()
}

describe('#277 ChannelManager.getPublicIds after the callMethod removal', () => {
  it('asks the configured method, on restApi:v2, with the unknown user ids', async () => {
    const { b24, calls, v3Call } = makeB24(async () => ({
      getData: () => ({ result: { 7: DESCRIPTOR } })
    }))

    const manager = new ChannelManager({ b24, getPublicListMethod: 'pull.channel.public.list' } as never)
    await manager.getPublicIds([7])

    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      method: 'pull.channel.public.list',
      params: { users: [7] }
    })
    // The channel methods are v2-only; `callMethod` resolved to v2, and the
    // replacement has to keep doing so rather than follow the client's version.
    expect(v3Call.make).not.toHaveBeenCalled()
  })

  it('returns the channels the portal answered with', async () => {
    const { b24 } = makeB24(async () => ({
      getData: () => ({ result: { 7: DESCRIPTOR } })
    }))

    const manager = new ChannelManager({ b24, getPublicListMethod: 'pull.channel.public.list' } as never)
    const answer = await manager.getPublicIds([7])

    expect(answer[7]).toMatchObject({ userId: 7, publicId: 'public-7' })
  })

  it('does not ask again for a channel it already holds', async () => {
    const { b24, calls } = makeB24(async () => ({
      getData: () => ({ result: { 7: DESCRIPTOR } })
    }))

    const manager = new ChannelManager({ b24, getPublicListMethod: 'pull.channel.public.list' } as never)
    await manager.getPublicIds([7])
    await manager.getPublicIds([7])

    // Second call is served from the cache — one request, not two.
    expect(calls).toHaveLength(1)
  })

  it('resolves empty rather than rejecting when the request fails', async () => {
    const { b24 } = makeB24(async () => {
      throw new Error('portal is down')
    })

    const manager = new ChannelManager({ b24, getPublicListMethod: 'pull.channel.public.list' } as never)

    // Deliberate: a failed channel lookup must not reject into the caller's
    // pull loop. The empty object is the documented outcome, not an oversight.
    await expect(manager.getPublicIds([7])).resolves.toEqual({})
  })
})
