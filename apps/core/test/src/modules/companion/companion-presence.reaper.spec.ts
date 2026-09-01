import { afterEach, describe, expect, it, vi } from 'vitest'

import { CompanionPresenceReaper } from '~/modules/companion/companion-presence.reaper'

describe('CompanionPresenceReaper', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('is disabled by default on Vercel', () => {
    vi.stubEnv('VERCEL', '1')
    const store = { isAvailable: true }
    const reaper = new CompanionPresenceReaper(store as any)

    reaper.onModuleInit()

    expect((reaper as any).timer).toBeUndefined()
  })

  it('can be explicitly enabled on Vercel', () => {
    vi.useFakeTimers()
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('MX_DISABLE_COMPANION_PRESENCE_REAPER', 'false')
    const store = { isAvailable: true }
    const reaper = new CompanionPresenceReaper(store as any)

    reaper.onModuleInit()

    expect((reaper as any).timer).toBeDefined()
    reaper.onModuleDestroy()
  })
})
