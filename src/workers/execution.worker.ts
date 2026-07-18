/// <reference lib="webworker" />

import type { ExecuteRequest, ExecuteResult, WorkerResponse } from '../types/execution'
import type { ReactNode } from 'react'

const workerScope = self as DedicatedWorkerGlobalScope
let rustCompilerReady: ReturnType<typeof loadRustCompiler> | undefined

function loadRustCompiler() {
  return import('../wasm/compiler/local_code_compiler.js').then(async (module) => {
    await module.default()
    return module
  })
}

function getRustCompiler() {
  rustCompilerReady ??= loadRustCompiler()
  return rustCompilerReady
}

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

function formatTable(value: unknown): string {
  const rows = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.entries(value) : [value]
  const normalized: Record<string, string>[] = (rows as unknown[]).map((row, index) => {
    const cells = row && typeof row === 'object' ? row as Record<string, unknown> : { Values: row }
    return { '(index)': String(index), ...Object.fromEntries(Object.entries(cells).map(([key, item]) => [key, serialize(item)])) }
  })
  const headers = [...new Set(normalized.flatMap((row) => Object.keys(row)))]
  const widths = headers.map((header) => Math.max(header.length, ...normalized.map((row) => String(row[header] ?? '').length)))
  const line = (cells: string[]) => `| ${cells.map((cell, index) => cell.padEnd(widths[index])).join(' | ')} |`
  return [line(headers), line(widths.map((width) => '-'.repeat(width))), ...normalized.map((row) => line(headers.map((header) => String(row[header] ?? ''))))].join('\n')
}

async function runJavaScript(code: string, stdin: string): Promise<ExecuteResult> {
  const blockedApis = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'WebTransport', 'importScripts'] as const
  const descriptors = new Map<string, PropertyDescriptor | undefined>()
  for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'WebTransport', 'importScripts']) {
    descriptors.set(api, Object.getOwnPropertyDescriptor(workerScope, api))
    try { Object.defineProperty(workerScope, api, { value: undefined, configurable: true, writable: false }) } catch { /* already unavailable */ }
  }

  try {
    const { analyzeJavaScript } = await import('./javascript-toolchain')
    const output: string[] = []
    const errors: string[] = []
    const print = (...values: unknown[]) => output.push(values.map((value) => serialize(value)).join(' '))
    const printError = (...values: unknown[]) => errors.push(values.map((value) => serialize(value)).join(' '))
    const sandboxConsole = Object.freeze({ log: print, info: print, debug: print, warn: printError, error: printError, table: (value: unknown) => output.push(formatTable(value)) })

    const analysis = analyzeJavaScript(code)
    if (analysis.diagnostics.some((item) => item.severity === 'error')) {
      return { stdout: '', stderr: analysis.diagnostics.map((item) => `${item.line}:${item.column} ${item.message}`).join('\n'), exitCode: 1, diagnostics: analysis.diagnostics }
    }

    try {
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...values: unknown[]) => Promise<unknown>
      const runner = new AsyncFunction(
        'console', 'stdin', '__moduleRuntime', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts',
        `"use strict";\n${analysis.code}\n//# sourceURL=local-code-studio.js`,
      )
      const moduleRuntime = Object.freeze({ console: sandboxConsole, stdin })
      await runner(sandboxConsole, stdin, moduleRuntime, undefined, undefined, undefined, undefined, undefined)
      return { stdout: output.join('\n') + (output.length ? '\n' : ''), stderr: errors.join('\n'), exitCode: 0, diagnostics: analysis.diagnostics }
    } catch (error) {
      const item = error instanceof Error ? error : new Error(String(error))
      const match = item.stack?.match(/local-code-studio\.js:(\d+):(\d+)/)
      // AsyncFunction adds its function wrapper and this worker adds the strict-mode line.
      const line = Math.max(1, Number(match?.[1] ?? 4) - 3)
      const column = Number(match?.[2] ?? 1)
      return {
        stdout: output.join('\n') + (output.length ? '\n' : ''),
        stderr: `${item.name}: ${item.message}`,
        exitCode: 1,
        diagnostics: [...analysis.diagnostics, { severity: 'error', message: item.message, line, column }],
      }
    }
  } finally {
    for (const api of blockedApis) {
      const descriptor = descriptors.get(api)
      try {
        if (descriptor) Object.defineProperty(workerScope, api, descriptor)
        else delete (workerScope as unknown as Record<string, unknown>)[api]
      } catch { /* the host owns this property */ }
    }
  }
}

async function runReact(code: string, stdin: string): Promise<ExecuteResult> {
  const { analyzeReact, reactGlobalNames } = await import('./react-toolchain')
  const React = await import('react')
  const { renderToReadableStream } = await import('react-dom/server.browser')
  const output: string[] = []
  const errors: string[] = []
  const print = (...values: unknown[]) => output.push(values.map((value) => serialize(value)).join(' '))
  const printError = (...values: unknown[]) => errors.push(values.map((value) => serialize(value)).join(' '))
  const sandboxConsole = Object.freeze({ log: print, info: print, debug: print, warn: printError, error: printError, table: (value: unknown) => output.push(formatTable(value)) })
  const analysis = analyzeReact(code)

  if (analysis.diagnostics.some((item) => item.severity === 'error')) {
    return { stdout: '', stderr: analysis.diagnostics.map((item) => `${item.line}:${item.column} ${item.message}`).join('\n'), exitCode: 1, diagnostics: analysis.diagnostics }
  }

  let root: ReactNode | undefined
  const render = (element: ReactNode) => { root = element }
  const moduleRuntime = Object.freeze({ ...React, default: React, React, render, console: sandboxConsole, stdin })
  const reactApi = React as unknown as Record<string, unknown>
  const reactGlobalValues = reactGlobalNames.map((name) => name === 'React' ? React : reactApi[name])
  const blockedApis = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'WebTransport', 'importScripts'] as const
  const descriptors = new Map<string, PropertyDescriptor | undefined>()
  for (const api of blockedApis) {
    descriptors.set(api, Object.getOwnPropertyDescriptor(workerScope, api))
    try { Object.defineProperty(workerScope, api, { value: undefined, configurable: true, writable: false }) } catch { /* already unavailable */ }
  }

  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...values: unknown[]) => Promise<unknown>
    const runner = new AsyncFunction(
      'console', 'stdin', '__moduleRuntime', '__reactRuntime', 'render', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', ...reactGlobalNames,
      `"use strict";\nreturn await (async () => {\n${analysis.code}\n})();\n//# sourceURL=local-code-studio-react.jsx`,
    )
    await runner(sandboxConsole, stdin, moduleRuntime, React, render, undefined, undefined, undefined, undefined, undefined, ...reactGlobalValues)
    if (root === undefined) {
      const message = 'プレビューする要素を render(<App />) へ渡してください'
      return { stdout: output.join('\n') + (output.length ? '\n' : ''), stderr: message, exitCode: 1, diagnostics: [{ severity: 'error', message, line: 1, column: 1 }] }
    }

    const renderErrors: string[] = []
    const stream = await renderToReadableStream(root, { onError: (error) => { renderErrors.push(serialize(error)) } })
    await stream.allReady
    const previewHtml = await new Response(stream).text()
    errors.push(...renderErrors)
    return {
      stdout: output.join('\n') + (output.length ? '\n' : ''),
      stderr: errors.join('\n'),
      exitCode: renderErrors.length ? 1 : 0,
      diagnostics: [...analysis.diagnostics, ...renderErrors.map((message) => ({ severity: 'error' as const, message, line: 1, column: 1 }))],
      previewHtml,
    }
  } catch (error) {
    const item = error instanceof Error ? error : new Error(String(error))
    const match = item.stack?.match(/local-code-studio-react\.jsx:(\d+):(\d+)/)
    const line = Math.max(1, Number(match?.[1] ?? 5) - 4)
    const column = Number(match?.[2] ?? 1)
    return {
      stdout: output.join('\n') + (output.length ? '\n' : ''),
      stderr: `${item.name}: ${item.message}`,
      exitCode: 1,
      diagnostics: [...analysis.diagnostics, { severity: 'error', message: item.message, line, column }],
    }
  } finally {
    for (const api of blockedApis) {
      const descriptor = descriptors.get(api)
      try {
        if (descriptor) Object.defineProperty(workerScope, api, descriptor)
        else delete (workerScope as unknown as Record<string, unknown>)[api]
      } catch { /* the host owns this property */ }
    }
  }
}

workerScope.onmessage = async (event: MessageEvent<ExecuteRequest>) => {
  const request = event.data
  const started = performance.now()
  let result: ExecuteResult
  try {
    if (request.language === 'c') {
      const { processC } = await import('./c-toolchain')
      result = await processC(request.action, request.code, request.stdin)
    } else if (request.language === 'javascript' && request.action === 'lint') {
      const { lintJavaScript } = await import('./javascript-toolchain')
      result = lintJavaScript(request.code)
    } else if (request.language === 'javascript') {
      result = await runJavaScript(request.code, request.stdin)
    } else if (request.language === 'react' && request.action === 'lint') {
      const { lintReact } = await import('./react-toolchain')
      result = lintReact(request.code)
    } else if (request.language === 'react') {
      result = await runReact(request.code, request.stdin)
    } else {
      const { execute, lint } = await getRustCompiler()
      result = JSON.parse((request.action === 'lint' ? lint : execute)(JSON.stringify(request))) as ExecuteResult
    }
  } catch (error) {
    const item = error instanceof Error ? error : new Error(String(error))
    result = {
      stdout: '',
      stderr: `${item.name}: ${item.message}`,
      exitCode: 1,
      diagnostics: [{ severity: 'error', message: `実行エンジンを読み込めませんでした: ${item.message}`, line: 1, column: 1 }],
    }
  }
  const response: WorkerResponse = { ...result, id: request.id, action: request.action, durationMs: performance.now() - started }
  workerScope.postMessage(response)
}

export {}
