import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Injectable, Logger } from '@nestjs/common'

import { CompanionPresenceStore } from './companion-presence.store'

const REAPER_INTERVAL_MS = 1_000

@Injectable()
export class CompanionPresenceReaper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CompanionPresenceReaper.name)
  private timer?: ReturnType<typeof setInterval>
  private running = false

  constructor(private readonly store: CompanionPresenceStore) {}

  onModuleInit() {
    if (!this.store.isAvailable) return

    const disabledByEnv = process.env.MX_DISABLE_COMPANION_PRESENCE_REAPER
    const disabled =
      disabledByEnv === undefined
        ? Boolean(process.env.VERCEL)
        : disabledByEnv === 'true'
    if (disabled) {
      this.logger.log('Companion presence reaper disabled')
      return
    }

    this.timer = setInterval(() => void this.reap(), REAPER_INTERVAL_MS)
    this.timer.unref?.()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async reap(now = new Date()) {
    if (this.running) return
    this.running = true
    try {
      await this.store.getPublicState(now)
      await this.store.flushPendingBroadcast()
    } catch (error) {
      this.logger.warn(
        `Companion presence expiry pass failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      this.running = false
    }
  }
}
