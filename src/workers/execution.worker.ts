/// <reference lib="webworker" />

import init, { execute, lint } from '../wasm/compiler/local_code_compiler.js'
import type { ExecuteRequest, ExecuteResult, WorkerResponse } from '../types/execution'

const wasmReady = init()
const workerScope = self as DedicatedWorkerGlobalScope

function serialize(value: unknown, seen = new WeakSet<object>()): string {
  if (typeof value === 'string') return value
  if (typeof value === 'bigint') return `${value}n`
  if (typeof value === 'undefined') return 'undefined'
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`
  if (value instanceof Error) return `${value.name}: ${value.message}`
  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) return '[Circular]'
    seen.add(value)
    try {
      return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? `${item}n` : item, 2)
    } catch {
      return Object.prototype.toString.call(value)
    }
  }
  return String(value)
}

async function runJavaScript(code: string, stdin: string): Promise<ExecuteResult> {
  for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'WebTransport', 'importScripts']) {
    try { Object.defineProperty(workerScope, api, { value: undefined, configurable: false, writable: false }) } catch { /* already unavailable */ }
  }
  const output: string[] = []
  const errors: string[] = []
  const print = (...values: unknown[]) => output.push(values.map((value) => serialize(value)).join(' '))
  const printError = (...values: unknown[]) => errors.push(values.map((value) => serialize(value)).join(' '))
  const sandboxConsole = Object.freeze({ log: print, info: print, debug: print, warn: printError, error: printError, table: print })

  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...values: unknown[]) => Promise<unknown>
    const runner = new AsyncFunction(
      'console', 'stdin', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts',
      `"use strict";\n${code}\n//# sourceURL=local-code-studio.js`,
    )
    await runner(sandboxConsole, stdin, undefined, undefined, undefined, undefined, undefined)
    return { stdout: output.join('\n') + (output.length ? '\n' : ''), stderr: errors.join('\n'), exitCode: 0, diagnostics: [] }
  } catch (error) {
    const item = error instanceof Error ? error : new Error(String(error))
    const match = item.stack?.match(/local-code-studio\.js:(\d+):(\d+)/)
    const line = Math.max(1, Number(match?.[1] ?? 3) - 2)
    const column = Number(match?.[2] ?? 1)
    return {
      stdout: output.join('\n') + (output.length ? '\n' : ''),
      stderr: `${item.name}: ${item.message}`,
      exitCode: 1,
      diagnostics: [{ severity: 'error', message: item.message, line, column }],
    }
  }
}

workerScope.onmessage = async (event: MessageEvent<ExecuteRequest>) => {
  const request = event.data
  const started = performance.now()
  await wasmReady
  let result = JSON.parse((request.action === 'lint' ? lint : execute)(JSON.stringify(request))) as ExecuteResult
  if (request.action === 'run' && request.language === 'javascript' && result.exitCode === 0) result = await runJavaScript(request.code, request.stdin)
  const response: WorkerResponse = { ...result, id: request.id, action: request.action, durationMs: performance.now() - started }
  workerScope.postMessage(response)
}

export {}
