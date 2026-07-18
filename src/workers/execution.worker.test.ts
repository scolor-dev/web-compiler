import { afterAll, describe, expect, it, vi } from 'vitest'
import type { WorkerResponse } from '../types/execution'

const postMessage = vi.fn<(response: WorkerResponse) => void>()
const workerScope = { postMessage, onmessage: null as ((event: MessageEvent) => Promise<void>) | null }
vi.stubGlobal('self', workerScope)

await import('./execution.worker')

afterAll(() => vi.unstubAllGlobals())

describe('execution worker startup', () => {
  it('starts without eagerly initializing every language engine', async () => {
    expect(workerScope.onmessage).toBeTypeOf('function')
    await workerScope.onmessage?.({
      data: { id: 1, action: 'run', language: 'javascript', code: 'console.log("ready")', stdin: '' },
    } as MessageEvent)
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 1, exitCode: 0, stdout: 'ready\n' }))
  })
})
