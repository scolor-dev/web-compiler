import type { FlowEdge, FlowGraph, FlowNode, FlowNodeKind } from '../types/flow'
import type { LanguageId } from '../types/execution'
import { describeLogicLine } from './logicAnnotations'

function sourceKind(source: string): FlowNodeKind {
  if (/^(?:if|else\s+if|for|while|switch)\b/.test(source)) return 'decision'
  if (/\b(?:printf|puts|scanf|getchar|console\.(?:log|table|warn|error))\s*\(/.test(source)) return 'io'
  return 'process'
}

function blockEnd(lines: string[], start: number, searchFrom = 0) {
  let depth = 0
  let opened = false
  for (let index = start; index < lines.length; index++) {
    const line = lines[index]!
    for (let offset = index === start ? searchFrom : 0; offset < line.length; offset++) {
      const ch = line[offset]
      if (ch === '{') { depth++; opened = true }
      if (ch === '}' && opened) {
        depth--
        if (depth === 0) return index + 1
      }
    }
  }
  return start + 1
}

function elseBlock(lines: string[], trueCloseLine: number) {
  let lineIndex = trueCloseLine - 1
  let elseOffset = lines[lineIndex]?.indexOf('else') ?? -1
  if (elseOffset < 0) {
    lineIndex++
    while (lineIndex < lines.length && !lines[lineIndex]!.trim()) lineIndex++
    elseOffset = lines[lineIndex]?.indexOf('else') ?? -1
  }
  if (elseOffset < 0) return null
  return { startLine: lineIndex + 1, closeLine: blockEnd(lines, lineIndex, elseOffset) }
}

function displayLabel(source: string, fallback: string) {
  const condition = source.match(/^(if|while|switch)\s*\((.*)\)/)
  if (condition) return `${condition[1]} (${condition[2]})`
  const forCondition = source.match(/^for\s*\((.*)\)/)?.[1]
  if (forCondition) return `for (${forCondition})`
  const returned = source.match(/^return\s+(.+?);?$/)?.[1]
  if (returned) return `return ${returned}`
  return fallback
}

function sourceFlow(language: LanguageId, code: string): FlowGraph {
  const lines = code.split('\n')
  const nodes: FlowNode[] = [{ id: 'start', label: '開始', kind: 'start' }]
  const sourceNodes: Array<FlowNode & { source: string }> = []

  lines.forEach((line, index) => {
    if (sourceNodes.length >= 80) return
    const label = describeLogicLine(language, line)
    if (!label) return
    const source = line.trim()
    const node = { id: `line-${index + 1}`, label: displayLabel(source, label), detail: `L${index + 1}`, kind: sourceKind(source), line: index + 1, source, column: 0 as const }
    sourceNodes.push(node)
    nodes.push(node)
    const inlineReturn = source.match(/^if\s*\(.*\)\s*return\s+(.+?);?$/)?.[1]
    if (inlineReturn) {
      const returnNode = { id: `line-${index + 1}-return`, label: `return ${inlineReturn}`, detail: `L${index + 1}`, kind: 'process' as const, line: index + 1.1, source: `return ${inlineReturn}`, column: -1 as const }
      sourceNodes.push(returnNode)
      nodes.push(returnNode)
    }
  })
  nodes.push({ id: 'end', label: '終了', kind: 'end' })

  const edges: FlowEdge[] = []
  const first = sourceNodes[0]?.id ?? 'end'
  edges.push({ from: 'start', to: first })
  for (let index = 0; index < sourceNodes.length; index++) {
    const node = sourceNodes[index]!
    const next = sourceNodes[index + 1]?.id ?? 'end'
    if (node.kind === 'end') edges.push({ from: node.id, to: 'end' })
    else edges.push({ from: node.id, to: next })
  }

  for (const node of [...sourceNodes].reverse()) {
    if (node.kind !== 'decision' || !node.line) continue
    const next = sourceNodes.find((item) => (item.line ?? 0) > node.line!)
    const inlineReturn = sourceNodes.find((item) => item.id === `${node.id}-return`)
    if (inlineReturn) {
      const inlineReturnLine = inlineReturn.line ?? node.line
      const afterInline = sourceNodes.find((item) => (item.line ?? 0) > inlineReturnLine) ?? nodes.at(-1)!
      for (let index = edges.length - 1; index >= 0; index--) if (edges[index]!.from === node.id) edges.splice(index, 1)
      edges.push({ from: node.id, to: inlineReturn.id, label: 'Yes' })
      edges.push({ from: node.id, to: afterInline.id, label: 'No', direction: 'forward' })
      continue
    }
    const closingLine = blockEnd(lines, node.line - 1)
    const isLoop = /^(?:for|while)\b/.test(node.source)
    const alternate = !isLoop && /^if\b/.test(node.source) ? elseBlock(lines, closingLine) : null
    const finalLine = alternate?.closeLine ?? closingLine
    const after = sourceNodes.find((item) => (item.line ?? 0) > finalLine) ?? nodes.at(-1)!
    const trueNodes = sourceNodes.filter((item) => (item.line ?? 0) > node.line! && (item.line ?? 0) <= closingLine)
    const falseNodes = alternate ? sourceNodes.filter((item) => (item.line ?? 0) > alternate.startLine && (item.line ?? 0) <= alternate.closeLine) : []
    const trueFirst = trueNodes[0] ?? after
    const falseFirst = falseNodes[0] ?? after

    for (let index = edges.length - 1; index >= 0; index--) if (edges[index]!.from === node.id) edges.splice(index, 1)
    edges.push({ from: node.id, to: trueFirst.id, label: isLoop ? '繰り返す' : 'Yes' })
    edges.push({ from: node.id, to: falseFirst.id, label: isLoop ? '終了' : 'No', direction: 'forward' })

    if (isLoop) {
      for (const inside of trueNodes) {
        const outgoing = edges.filter((edge) => edge.from === inside.id && edge.to === after.id)
        for (const edge of outgoing) Object.assign(edge, { to: node.id, label: '次へ', direction: 'back' as const })
      }
    } else {
      trueNodes.forEach((item) => { item.column = (item.column ?? 0) - 1 })
      falseNodes.forEach((item) => { item.column = (item.column ?? 0) + 1 })
      const trueLast = trueNodes.at(-1)
      const falseLast = falseNodes.at(-1)
      if (trueLast) {
        const outgoing = edges.find((edge) => edge.from === trueLast.id)
        if (outgoing) outgoing.to = after.id
      }
      if (falseLast) {
        const outgoing = edges.find((edge) => edge.from === falseLast.id)
        if (outgoing) outgoing.to = after.id
      }
    }
  }
  return { nodes, edges }
}

type WsInstruction = { id: string, label: string, kind: FlowNodeKind, op: string, target?: string }

function whitespaceFlow(code: string): FlowGraph {
  const tokens = [...code].filter((ch) => ch === ' ' || ch === '\t' || ch === '\n')
  const instructions: WsInstruction[] = []
  const stack: Array<bigint | null> = []
  let cursor = 0
  const take = () => tokens[cursor++]
  const pop = () => stack.pop() ?? null
  const operand = () => {
    let bits = ''
    while (cursor < tokens.length) {
      const ch = take()
      if (ch === '\n') return { complete: true, bits }
      bits += ch === '\t' ? 'T' : 'S'
    }
    return { complete: false, bits }
  }
  const number = () => {
    const sign = take()
    const valueBits = operand()
    let value = 0n
    for (const bit of valueBits.bits) value = value * 2n + (bit === 'T' ? 1n : 0n)
    return sign === '\t' ? -value : value
  }
  const add = (label: string, kind: FlowNodeKind, op: string, target?: string) => instructions.push({ id: `ws-${instructions.length + 1}`, label, kind, op, target })
  const outputCharacter = (value: bigint | null) => {
    if (value === null) return '文字を表示'
    const codePoint = Number(BigInt.asUintN(32, value))
    if (codePoint === 10) return '改行を表示'
    if (codePoint === 32) return '空白を表示'
    if (codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)) return `「${String.fromCodePoint(codePoint)}」を表示`
    return '置換文字を表示'
  }

  while (cursor < tokens.length && instructions.length < 100) {
    const before = cursor
    const first = take()
    if (first === ' ') {
      const second = take()
      if (second === ' ') { const value = number(); stack.push(value); add(`${value}をスタックへ積む`, 'process', 'push') }
      else if (second === '\n') {
        const third = take()
        if (third === ' ') { stack.push(stack.at(-1) ?? null); add('最上位を複製', 'process', 'dup') }
        else if (third === '\t') { const a = pop(); const b = pop(); stack.push(a, b); add('上位2値を交換', 'process', 'swap') }
        else if (third === '\n') { pop(); add('最上位を破棄', 'process', 'drop') }
      } else if (second === '\t') {
        const third = take(); const count = Number(number())
        if (third === ' ') { stack.push(stack.at(-1 - Math.max(0, count)) ?? null); add(`${count}番目を複製`, 'process', 'copy') }
        else if (third === '\n') { const top = pop(); stack.splice(Math.max(0, stack.length - count), count); stack.push(top); add(`${count}個を除去`, 'process', 'slide') }
      }
    } else if (first === '\t') {
      const second = take()
      if (second === ' ') {
        const third = take(); const fourth = take(); const b = pop(); const a = pop(); stack.push(a !== null && b !== null ? 0n : null)
        const names: Record<string, string> = { '  ': '加算', ' \t': '減算', ' \n': '乗算', '\t ': '除算', '\t\t': '剰余' }
        add(names[`${third}${fourth}`] ?? '算術演算', 'process', 'math')
      } else if (second === '\t') {
        const third = take(); if (third === ' ') { pop(); pop(); add('ヒープへ保存', 'process', 'store') } else { pop(); stack.push(null); add('ヒープから取得', 'process', 'load') }
      } else if (second === '\n') {
        const third = take(); const fourth = take()
        if (third === ' ' && fourth === ' ') add(outputCharacter(pop()), 'io', 'out-char')
        else if (third === ' ' && fourth === '\t') { const value = pop(); add(value === null ? '数値を表示' : `${value}を表示`, 'io', 'out-number') }
        else { pop(); add(fourth === ' ' ? '文字を入力' : '数値を入力', 'io', 'input') }
      }
    } else if (first === '\n') {
      const second = take(); const third = take()
      if (second === '\n' && third === '\n') add('プログラム終了', 'end', 'end')
      else if (second === '\t' && third === '\n') add('呼び出し元へ戻る', 'process', 'return')
      else {
        const value = operand(); const target = value.bits || '空'
        if (second === ' ' && third === ' ') add(`ラベル「${target}」`, 'process', 'label', target)
        else if (second === ' ' && third === '\t') add(`「${target}」を呼び出す`, 'process', 'call', target)
        else if (second === ' ' && third === '\n') add(`「${target}」へ移動`, 'process', 'jump', target)
        else if (second === '\t' && third === ' ') { pop(); add(`0なら「${target}」へ`, 'decision', 'jump-zero', target) }
        else if (second === '\t' && third === '\t') { pop(); add(`負数なら「${target}」へ`, 'decision', 'jump-negative', target) }
      }
    }
    if (cursor <= before) cursor = before + 1
  }

  const nodes: FlowNode[] = [{ id: 'start', label: '開始', kind: 'start' }, ...instructions.map((item, index) => ({ id: item.id, label: item.label, detail: `命令 ${index + 1}`, kind: item.kind })), { id: 'end', label: '終了', kind: 'end' }]
  const labels = new Map(instructions.filter((item) => item.op === 'label').map((item) => [item.target!, item.id]))
  const order = new Map(instructions.map((item, index) => [item.id, index]))
  const edges: FlowEdge[] = [{ from: 'start', to: instructions[0]?.id ?? 'end' }]
  instructions.forEach((item, index) => {
    const next = instructions[index + 1]?.id ?? 'end'
    if (item.op === 'end') edges.push({ from: item.id, to: 'end' })
    else if (item.op === 'jump') {
      const target = labels.get(item.target!) ?? next
      edges.push({ from: item.id, to: target, label: '移動', direction: (order.get(target) ?? index + 1) <= index ? 'back' : 'forward' })
    }
    else if (item.op === 'jump-zero' || item.op === 'jump-negative') {
      edges.push({ from: item.id, to: next, label: 'No' })
      const target = labels.get(item.target!) ?? next
      edges.push({ from: item.id, to: target, label: 'Yes', direction: (order.get(target) ?? index + 1) <= index ? 'back' : 'forward' })
    } else {
      edges.push({ from: item.id, to: next })
      if (item.op === 'call' && labels.has(item.target!)) edges.push({ from: item.id, to: labels.get(item.target!)!, label: '呼出' })
    }
  })
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  instructions.forEach((item, index) => {
    if (item.op !== 'jump-zero' && item.op !== 'jump-negative') return
    const next = instructions[index + 1]
    const targetId = labels.get(item.target!)
    const targetIndex = targetId ? order.get(targetId) : undefined
    if (next) nodeById.get(next.id)!.column = -1
    if (targetId && targetIndex !== undefined && targetIndex > index) nodeById.get(targetId)!.column = 1
  })
  return { nodes, edges }
}

export function buildFlowGraph(language: LanguageId, code: string): FlowGraph {
  return language === 'whitespace' ? whitespaceFlow(code) : sourceFlow(language, code)
}
