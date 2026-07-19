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

function diagnostic(message: string, node?: Node, severity: Diagnostic['severity'] = 'error'): Diagnostic {
  return {
    severity,
    message,
    line: node?.loc?.start.line ?? 1,
    column: (node?.loc?.start.column ?? 0) + 1,
  }
}

function identifierName(node: Node | null | undefined) {
  return node?.type === 'Identifier' ? (node as Node & { name: string }).name : undefined
}

function literalNumber(node: Node | null | undefined) {
  const value = node?.type === 'Literal' ? (node as Node & { value: unknown }).value : undefined
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

function containsArrayIndex(node: Node, arrayName: string, indexName: string): boolean {
  if (node.type === 'MemberExpression') {
    const object = node.object as Node
    const property = node.property as Node
    if (identifierName(object) === arrayName && identifierName(property) === indexName) return true
  }
  return childNodes(node).some((child) => containsArrayIndex(child, arrayName, indexName))
}

function suspiciousArrayDiagnostics(root: Node): Diagnostic[] {
  const arrays = new Map<string, { length: number, node: Node }>()
  const results: Diagnostic[] = []

  const collect = (node: Node) => {
    if (node.type === 'VariableDeclarator') {
      const name = identifierName(node.id as Node)
      const init = node.init as Node | null
      const elements = init?.type === 'ArrayExpression' ? init.elements as Array<Node | null> : undefined
      if (name && elements && elements.every(Boolean)) arrays.set(name, { length: elements.length, node })
    }
    for (const child of childNodes(node)) collect(child)
  }
  collect(root)

  const visit = (node: Node) => {
    if (node.type === 'ForStatement') {
      const init = node.init as Node | null
      const declaration = init?.type === 'VariableDeclaration' ? (init.declarations as Node[])?.[0] : undefined
      const indexName = identifierName(declaration?.id as Node)
      const start = literalNumber(declaration?.init as Node)
      const test = node.test as Node | null
      const operator = test?.type === 'BinaryExpression' ? (test as Node & { operator: string }).operator : undefined
      const testedIndex = identifierName(test?.left as Node)
      const bound = literalNumber(test?.right as Node)
      const body = node.body as Node
      if (indexName && testedIndex === indexName && start === 0 && bound !== undefined && (operator === '<' || operator === '<=')) {
        const usedCount = operator === '<' ? bound : bound + 1
        for (const [name, array] of arrays) {
          if (usedCount >= 0 && usedCount < array.length && containsArrayIndex(body, name, indexName)) {
            results.push(diagnostic(
              `配列「${name}」には${array.length}件ありますが、このループは先頭${usedCount}件だけを使用します。全件なら「${indexName} < ${name}.length」ではありませんか？`,
              test ?? node,
              'warning',
            ))
          }
        }
      }
    }

    if (node.type === 'CallExpression') {
      const reduceMember = node.callee as Node
      const collectionMethod = reduceMember?.type === 'MemberExpression' ? identifierName(reduceMember.property as Node) : undefined
      const sliceCall = reduceMember?.type === 'MemberExpression' ? reduceMember.object as Node : undefined
      const sliceMember = sliceCall?.type === 'CallExpression' ? sliceCall.callee as Node : undefined
      const sliceName = sliceMember?.type === 'MemberExpression' ? identifierName(sliceMember.property as Node) : undefined
      const arrayName = sliceMember?.type === 'MemberExpression' ? identifierName(sliceMember.object as Node) : undefined
      if (collectionMethod && ['reduce', 'map', 'forEach', 'filter'].includes(collectionMethod) && sliceName === 'slice' && arrayName && arrays.has(arrayName)) {
        const args = sliceCall!.arguments as Node[]
        const start = args.length > 1 ? literalNumber(args[0]) : 0
        const end = literalNumber(args[1])
        const length = arrays.get(arrayName)!.length
        if ((start === 0 || start === undefined) && end !== undefined && end >= 0 && end < length) {
          const purpose = collectionMethod === 'reduce' ? '集計対象' : '処理対象'
          results.push(diagnostic(
            `配列「${arrayName}」には${length}件ありますが、${purpose}は先頭${end}件です。全件を使うなら slice(0, ${end}) は不要ではありませんか？`,
            args[1] ?? node,
            'warning',
          ))
        }
      }
    }

    if (node.type === 'IfStatement' || node.type === 'WhileStatement') {
      const test = node.test as Node
      if (test?.type === 'AssignmentExpression' && (test as Node & { operator: string }).operator === '=') {
        results.push(diagnostic('条件式の中で代入しています。比較する意図なら「===」ではありませんか？', test, 'warning'))
      }
    }
    for (const child of childNodes(node)) visit(child)
  }
  visit(root)
  return results
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

export function analyzeJavaScript(code: string, extraGlobals: Iterable<string> = []): JavaScriptAnalysis {
  const allowedGlobals = new Set(extraGlobals)
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
    if (!knownGlobals.has(reference.identifier.name) && !allowedGlobals.has(reference.identifier.name)) {
      const identifier = reference.identifier as unknown as Node & { name: string }
      diagnostics.push(diagnostic(`未定義の識別子「${identifier.name}」です`, identifier))
    }
  }
  diagnostics.push(...unreachableDiagnostics(root))
  diagnostics.push(...suspiciousArrayDiagnostics(root))
  const edits = moduleEdits(root, diagnostics)
  return { code: applyEdits(code, edits), diagnostics }
}

export function lintJavaScript(code: string): ExecuteResult {
  const result = analyzeJavaScript(code)
  const errors = result.diagnostics.filter((item) => item.severity === 'error')
  return {
    stdout: '',
    stderr: errors.map((item) => `${item.line}:${item.column} ${item.message}`).join('\n'),
    exitCode: errors.length ? 1 : 0,
    diagnostics: result.diagnostics,
  }
}
