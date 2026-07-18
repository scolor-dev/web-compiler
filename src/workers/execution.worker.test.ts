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

  it('transforms and renders React JSX locally', async () => {
    await workerScope.onmessage?.({
      data: { id: 2, action: 'run', language: 'react', code: "import React from 'react'\nfunction App() { return <h1>Hello React</h1> }\nrender(<App />)", stdin: '' },
    } as MessageEvent)
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 2, exitCode: 0, previewHtml: '<h1>Hello React</h1>' }))
  })

  it('renders components using a global hook without an import', async () => {
    await workerScope.onmessage?.({
      data: { id: 3, action: 'run', language: 'react', code: 'function Counter() { const [count] = useState(2); return <b>{count}</b> }\nrender(<Counter />)', stdin: '' },
    } as MessageEvent)
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 3, exitCode: 0, previewHtml: '<b>2</b>' }))
  })
})
