import { parse } from 'acorn'
import { analyze } from 'eslint-scope'
import type { Diagnostic, ExecuteResult } from '../types/execution'

type Node = {
  type: string
  start: number
  end: number
  loc?: { start: { line: number, column: number } }
  [key: string]: unknown
}

type Edit = { start: number, end: number, text: string }

const knownGlobals = new Set([
  'Array', 'ArrayBuffer', 'BigInt', 'BigInt64Array', 'BigUint64Array', 'Boolean', 'DataView', 'Date',
  'Error', 'EvalError', 'FinalizationRegistry', 'Float32Array', 'Float64Array', 'Infinity', 'Int16Array',
  'Int32Array', 'Int8Array', 'Intl', 'JSON', 'Map', 'Math', 'NaN', 'Number', 'Object', 'Promise', 'Proxy',
  'RangeError', 'ReferenceError', 'Reflect', 'RegExp', 'Set', 'String', 'Symbol', 'SyntaxError', 'TextDecoder',
  'TextEncoder', 'TypeError', 'URIError', 'URL', 'URLSearchParams', 'Uint16Array', 'Uint32Array', 'Uint8Array',
  'Uint8ClampedArray', 'WeakMap', 'WeakRef', 'WeakSet', 'WebAssembly', 'atob', 'btoa', 'clearInterval',
  'clearTimeout', 'console', 'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'escape',
  'eval', 'globalThis', 'isFinite', 'isNaN', 'parseFloat', 'parseInt', 'queueMicrotask', 'setInterval',
  'setTimeout', 'stdin', 'structuredClone', 'undefined', 'unescape',
])

function diagnostic(message: string, node?: Node): Diagnostic {
  return {
    severity: 'error',
    message,
    line: node?.loc?.start.line ?? 1,
    column: (node?.loc?.start.column ?? 0) + 1,
  }
}

function childNodes(node: Node): Node[] {
  const children: Node[] = []
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'range' || key === 'start' || key === 'end') continue
    if (Array.isArray(value)) {
      for (const item of value) if (item && typeof item === 'object' && 'type' in item) children.push(item as Node)
    } else if (value && typeof value === 'object' && 'type' in value) children.push(value as Node)
  }
  return children
}

function unreachableDiagnostics(root: Node): Diagnostic[] {
  const results: Diagnostic[] = []
  const visit = (node: Node) => {
    if (node.type === 'BlockStatement' || node.type === 'Program' || node.type === 'SwitchCase') {
      const statements = (node.type === 'SwitchCase' ? node.consequent : node.body) as Node[] | undefined
      let terminated = false
      for (const statement of statements ?? []) {
        if (terminated && statement.type !== 'FunctionDeclaration') {
          results.push(diagnostic('このコードには到達できません', statement))
          terminated = false
        }
        visit(statement)
        if (['ReturnStatement', 'ThrowStatement', 'BreakStatement', 'ContinueStatement'].includes(statement.type)) terminated = true
      }
      return
    }
    for (const child of childNodes(node)) visit(child)
  }
  visit(root)
  return results
}

function runtimeImport(specifiers: Node[]): string {
  const declarations: string[] = []
  for (const specifier of specifiers) {
    const local = specifier.local as Node & { name: string }
    if (specifier.type === 'ImportNamespaceSpecifier') declarations.push(`const ${local.name} = __moduleRuntime;`)
    else if (specifier.type === 'ImportDefaultSpecifier') declarations.push(`const ${local.name} = __moduleRuntime;`)
    else {
      const imported = specifier.imported as Node & { name?: string, value?: string }
      declarations.push(`const ${local.name} = __moduleRuntime[${JSON.stringify(imported.name ?? imported.value)}];`)
    }
  }
  return declarations.join(' ')
}

function moduleEdits(root: Node, diagnostics: Diagnostic[]): Edit[] {
  const edits: Edit[] = []
  const visit = (node: Node) => {
    if (node.type === 'ImportDeclaration') {
      const source = node.source as Node & { value: string }
      if (source.value !== 'local:runtime') diagnostics.push(diagnostic('外部モジュールは読み込めません。ローカル実行APIには "local:runtime" を使用してください', node))
      else edits.push({ start: node.start, end: node.end, text: runtimeImport(node.specifiers as Node[]) })
      return
    }
    if (node.type === 'ImportExpression') {
      const source = node.source as Node & { value?: string }
      if (source.type !== 'Literal' || source.value !== 'local:runtime') diagnostics.push(diagnostic('動的import()は "local:runtime" のみ使用できます', node))
      else edits.push({ start: node.start, end: node.end, text: 'Promise.resolve(__moduleRuntime)' })
      return
    }
    if (node.type === 'ExportAllDeclaration') {
      diagnostics.push(diagnostic('単一ファイル実行ではexport *の参照先がありません', node))
      return
    }
    if (node.type === 'ExportNamedDeclaration') {
      const declaration = node.declaration as Node | null
      edits.push(declaration
        ? { start: node.start, end: declaration.start, text: '' }
        : { start: node.start, end: node.end, text: '' })
    }
    if (node.type === 'ExportDefaultDeclaration') {
      const declaration = node.declaration as Node
      const namedDeclaration = ['FunctionDeclaration', 'ClassDeclaration'].includes(declaration.type) && Boolean(declaration.id)
      edits.push({ start: node.start, end: declaration.start, text: namedDeclaration ? '' : 'void ' })
    }
    for (const child of childNodes(node)) visit(child)
  }
  visit(root)
  return edits
}

function applyEdits(code: string, edits: Edit[]): string {
  return edits.sort((a, b) => b.start - a.start).reduce(
    (current, edit) => current.slice(0, edit.start) + edit.text + current.slice(edit.end),
    code,
  )
}

export interface JavaScriptAnalysis {
  code: string
  diagnostics: Diagnostic[]
}

export function analyzeJavaScript(code: string): JavaScriptAnalysis {
  let root: Node
  try {
    root = parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true, ranges: true }) as unknown as Node
  } catch (error) {
    const item = error as Error & { loc?: { line: number, column: number } }
    return {
      code,
      diagnostics: [{ severity: 'error', message: item.message.replace(/ \(\d+:\d+\)$/, ''), line: item.loc?.line ?? 1, column: (item.loc?.column ?? 0) + 1 }],
    }
  }

  const diagnostics: Diagnostic[] = []
  const scopeManager = analyze(root as never, { ecmaVersion: 2022, sourceType: 'module' })
  for (const reference of scopeManager.globalScope?.through ?? []) {
    if (!knownGlobals.has(reference.identifier.name)) {
      const identifier = reference.identifier as unknown as Node & { name: string }
      diagnostics.push(diagnostic(`未定義の識別子「${identifier.name}」です`, identifier))
    }
  }
  diagnostics.push(...unreachableDiagnostics(root))
  const edits = moduleEdits(root, diagnostics)
  return { code: applyEdits(code, edits), diagnostics }
}

export function lintJavaScript(code: string): ExecuteResult {
  const result = analyzeJavaScript(code)
  return {
    stdout: '',
    stderr: result.diagnostics.map((item) => `${item.line}:${item.column} ${item.message}`).join('\n'),
    exitCode: result.diagnostics.some((item) => item.severity === 'error') ? 1 : 0,
    diagnostics: result.diagnostics,
  }
}
