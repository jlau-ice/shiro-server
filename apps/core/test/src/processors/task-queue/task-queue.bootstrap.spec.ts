import { afterEach, describe, expect, it, vi } from 'vitest'

import { TaskQueueProcessor } from '~/processors/task-queue/task-queue.processor'
import { TaskQueueRecovery } from '~/processors/task-queue/task-queue.recovery'

afterEach(() => {
  vi.useRealTimers()
})

describe('Task queue bootstrap', () => {
  it('skips polling until redis is ready', async () => {
    const taskService = {
      isRedisReady: vi.fn(() => false),
      getRedisStatus: vi.fn(() => 'connecting'),
      isRedisUnavailableError: vi.fn(() => true),
      acquireTask: vi.fn(),
    }

    const processor = new TaskQueueProcessor(taskService as any)
    const warnSpy = vi
      .spyOn((processor as any).logger, 'warn')
      .mockImplementation(() => undefined)

    ;(processor as any).isRunning = true
    await (processor as any).poll()
    processor.stop()

    expect(taskService.acquireTask).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      JSON.stringify({
        module: 'TaskQueueProcessor',
        message: 'Task processor waiting for Redis connection',
        redisStatus: 'connecting',
      }),
    )
  })

  it('skips recovery until redis is ready', async () => {
    const taskService = {
      isRedisReady: vi.fn(() => false),
      getRedisStatus: vi.fn(() => 'connecting'),
      isRedisUnavailableError: vi.fn(() => true),
      recoverStaleTasks: vi.fn(),
    }

    const recovery = new TaskQueueRecovery(taskService as any)
    const warnSpy = vi
      .spyOn((recovery as any).logger, 'warn')
      .mockImplementation(() => undefined)

    await (recovery as any).recover()

    expect(taskService.recoverStaleTasks).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      JSON.stringify({
        module: 'TaskQueueRecovery',
        message: 'Task recovery waiting for Redis connection',
        redisStatus: 'connecting',
      }),
    )
  })

  it('backs off while idle and wakes immediately when work arrives', async () => {
    vi.useFakeTimers()
    const taskService = {
      isRedisReady: vi.fn(() => true),
      getRedisStatus: vi.fn(() => 'ready'),
      isRedisUnavailableError: vi.fn(() => false),
      acquireTask: vi.fn().mockResolvedValue(null),
    }

    const processor = new TaskQueueProcessor(taskService as any)
    ;(processor as any).isRunning = true
    await (processor as any).poll()

    expect((processor as any).nextPollIntervalMs).toBe(2000)
    expect(taskService.acquireTask).toHaveBeenCalledTimes(1)

    processor.wake()
    await vi.advanceTimersByTimeAsync(0)

    expect(taskService.acquireTask).toHaveBeenCalledTimes(2)
    processor.stop()
  })
})
