import { commands, Exit, type Tree } from '@yowasp/clang'
import { ConsoleStdout, File, OpenFile, PreopenDirectory, WASI } from '@bjorn3/browser_wasi_shim'
import type { Diagnostic, ExecuteResult, ExecutionAction } from '../types/execution'
import { cSuggestions } from './c-suggestions'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const OUTPUT_LIMIT = 100_000

function createOutput() {
  const chunks: Uint8Array[] = []
  let length = 0
  let truncated = false
  return {
    write(bytes: Uint8Array | null) {
      if (!bytes?.length || truncated) return
      const remaining = OUTPUT_LIMIT - length
      if (bytes.length > remaining) {
        if (remaining > 0) chunks.push(bytes.slice(0, remaining))
        length = OUTPUT_LIMIT
        truncated = true
      } else {
        chunks.push(bytes.slice())
        length += bytes.length
      }
    },
    text() {
      const joined = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) {
        joined.set(chunk, offset)
        offset += chunk.length
      }
      return decoder.decode(joined) + (truncated ? '\n[出力が100,000バイトを超えたため省略しました]' : '')
    },
  }
}

function parseDiagnostics(output: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const pattern = /^(?:[^:\n]+\/)?main\.c:(\d+):(\d+):\s+(warning|error|fatal error):\s+(.+)$/gm
  for (const match of output.matchAll(pattern)) {
    diagnostics.push({
      severity: match[3] === 'warning' ? 'warning' : 'error',
      message: match[4].trim(),
      line: Number(match[1]),
      column: Number(match[2]),
    })
  }
  return diagnostics
}

function compilerFailure(error: unknown, stderr: string): ExecuteResult {
  const message = stderr.trim() || (error instanceof Error ? error.message : String(error))
  const diagnostics = parseDiagnostics(stderr)
  if (!diagnostics.length) diagnostics.push({ severity: 'error', message, line: 1, column: 1 })
  return {
    stdout: '',
    stderr: message,
    exitCode: error instanceof Exit ? error.code : 1,
    diagnostics,
  }
}

async function compile(code: string, action: ExecutionAction) {
  const stdout = createOutput()
  const stderr = createOutput()
  const args = [
    'main.c',
    '-std=gnu17',
    '-Wall',
    '-Wextra',
    '-Wpedantic',
    '-Wno-unused-parameter',
  ]
  if (action === 'lint') args.push('-fsyntax-only')
  else args.push('-O0', '-o', 'program.wasm')

  try {
    const files = await commands.clang(args, { 'main.c': code }, {
      stdout: stdout.write,
      stderr: stderr.write,
      fetchProgress: () => undefined,
    })
    return { files, stdout: stdout.text(), stderr: stderr.text() }
  } catch (error) {
    return { failure: compilerFailure(error, stderr.text()) }
  }
}

function wasmFile(files: Tree | undefined): Uint8Array | null {
  const output = files?.['program.wasm']
  return output instanceof Uint8Array ? output : null
}

async function runWasi(bytes: Uint8Array, stdin: string): Promise<Pick<ExecuteResult, 'stdout' | 'stderr' | 'exitCode'>> {
  const stdout = createOutput()
  const stderr = createOutput()
  const root = new PreopenDirectory('.', new Map())
  const wasi = new WASI(
    ['program.wasm'],
    [],
    [
      new OpenFile(new File(encoder.encode(stdin))),
      new ConsoleStdout((chunk) => stdout.write(chunk)),
      new ConsoleStdout((chunk) => stderr.write(chunk)),
      root,
    ],
  )

  try {
    const module = await WebAssembly.compile(bytes)
    const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport })
    const wasiInstance = instance as unknown as Parameters<typeof wasi.start>[0]
    const exitCode = wasi.start(wasiInstance)
    return { stdout: stdout.text(), stderr: stderr.text(), exitCode }
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    return { stdout: stdout.text(), stderr: [stderr.text(), message].filter(Boolean).join('\n'), exitCode: 1 }
  }
}

export async function processC(action: ExecutionAction, code: string, stdin: string): Promise<ExecuteResult> {
  const compiled = await compile(code, action)
  if (compiled.failure) return compiled.failure

  const diagnostics = parseDiagnostics(compiled.stderr)
  diagnostics.push(...cSuggestions(code))
  if (action === 'lint') {
    return { stdout: '', stderr: compiled.stderr.trim(), exitCode: 0, diagnostics }
  }

  const bytes = wasmFile(compiled.files)
  if (!bytes) {
    return {
      stdout: '',
      stderr: 'Cコンパイラが実行ファイルを生成しませんでした',
      exitCode: 1,
      diagnostics: [{ severity: 'error', message: '実行ファイルを生成できませんでした', line: 1, column: 1 }],
    }
  }
  const result = await runWasi(bytes, stdin)
  return { ...result, diagnostics }
}
