import type { Diagnostic } from '../types/execution'

function position(code: string, index: number) {
  const before = code.slice(0, index)
  const lines = before.split('\n')
  return { line: lines.length, column: lines.at(-1)!.length + 1 }
}

function warning(code: string, index: number, message: string): Diagnostic {
  return { severity: 'warning', message, ...position(code, index) }
}

function matchingBrace(code: string, open: number) {
  let depth = 0
  let quote = ''
  for (let index = open; index < code.length; index++) {
    const character = code[index]!
    if (quote) {
      if (character === '\\') index++
      else if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === "'") { quote = character; continue }
    if (character === '{') depth++
    else if (character === '}' && --depth === 0) return index
  }
  return code.length - 1
}

function countInitializerItems(text: string) {
  let count = 1
  let depth = 0
  let quote = ''
  let hasValue = false
  for (let index = 0; index < text.length; index++) {
    const character = text[index]!
    if (quote) {
      hasValue = true
      if (character === '\\') index++
      else if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === "'") { quote = character; hasValue = true }
    else if ('([{'.includes(character)) depth++
    else if (')]}'.includes(character)) depth--
    else if (character === ',' && depth === 0) count++
    else if (!/\s/.test(character)) hasValue = true
  }
  return hasValue ? count : 0
}

type ArrayInfo = { length: number, index: number }

function declaredArrays(code: string) {
  const arrays = new Map<string, ArrayInfo>()
  const initialized = /\b(?:char|short|int|long|float|double|size_t|\w+_t)\s+([A-Za-z_]\w*)\s*\[\s*(\d*)\s*\]\s*=\s*\{([^{}]*)\}/g
  for (const match of code.matchAll(initialized)) {
    const explicit = match[2] ? Number(match[2]) : undefined
    arrays.set(match[1]!, { length: explicit ?? countInitializerItems(match[3]!), index: match.index! })
  }
  const sized = /\b(?:char|short|int|long|float|double|size_t|\w+_t)\s+([A-Za-z_]\w*)\s*\[\s*(\d+)\s*\](?!\s*=\s*\{)/g
  for (const match of code.matchAll(sized)) arrays.set(match[1]!, { length: Number(match[2]), index: match.index! })
  return arrays
}

function parameterRangeSuggestions(code: string) {
  const results: Diagnostic[] = []
  const functions = /\b(?:void|char|short|int|long|float|double|size_t|\w+_t)\s+([A-Za-z_]\w*)\s*\(([^;{}]*)\)\s*\{/g
  for (const fn of code.matchAll(functions)) {
    const open = fn.index! + fn[0].lastIndexOf('{')
    const body = code.slice(open + 1, matchingBrace(code, open))
    const arrayParameters = [...fn[2]!.matchAll(/\b(?:const\s+)?(?:char|short|int|long|float|double|size_t|\w+_t)\s+\**\s*([A-Za-z_]\w*)\s*\[\s*\]/g)].map((match) => match[1]!)
    const scalarParameters = new Set([...fn[2]!.matchAll(/\b(?:char|short|int|long|size_t|\w+_t)\s+([A-Za-z_]\w*)\b(?!\s*\[)/g)].map((match) => match[1]!))
    if (!arrayParameters.length) continue

    const loop = /for\s*\(\s*(?:int\s+)?([A-Za-z_]\w*)\s*=\s*0\s*;\s*\1\s*<\s*([A-Za-z_]\w*)\s*-\s*(\d+)\s*;[^)]*\)/g
    for (const match of body.matchAll(loop)) {
      const [indexName, countName, omittedText] = [match[1]!, match[2]!, match[3]!]
      const omitted = Number(omittedText)
      const arrayName = arrayParameters.find((name) => new RegExp(`\\b${name}\\s*\\[\\s*${indexName}\\s*\\]`).test(body))
      if (!arrayName || !scalarParameters.has(countName) || omitted < 1) continue
      const absolute = open + 1 + match.index! + match[0].indexOf(`${countName} - ${omittedText}`)
      results.push(warning(
        code,
        absolute,
        `配列「${arrayName}」の要素数を「${countName}」で受け取っていますが、末尾${omitted}件を処理しません。全件を使う意図なら「${indexName} < ${countName}」ではありませんか？`,
      ))
    }
  }
  return results
}

function fixedArrayRangeSuggestions(code: string, arrays: Map<string, ArrayInfo>) {
  const results: Diagnostic[] = []
  const loop = /for\s*\(\s*(?:int\s+)?([A-Za-z_]\w*)\s*=\s*0\s*;\s*\1\s*(<|<=)\s*(\d+)\s*;[^)]*\)([\s\S]*?)(?=\n\s*}|\n\s*(?:return|for|while|if)\b|$)/g
  for (const match of code.matchAll(loop)) {
    const indexName = match[1]!
    const operator = match[2]!
    const bound = Number(match[3])
    for (const [name, array] of arrays) {
      if (!new RegExp(`\\b${name}\\s*\\[\\s*${indexName}\\s*\\]`).test(match[4]!)) continue
      const used = operator === '<' ? bound : bound + 1
      if (used < array.length) {
        results.push(warning(code, match.index! + match[0].indexOf(match[3]!), `配列「${name}」には${array.length}件ありますが、このループは先頭${used}件だけを使用します。「${indexName} < ${array.length}」ではありませんか？`))
      } else if (used > array.length) {
        results.push(warning(code, match.index! + match[0].indexOf(match[3]!), `配列「${name}」は${array.length}件ですが、この条件では${used}回アクセスします。範囲外アクセスになりませんか？`))
      }
    }
  }
  return results
}

export function cSuggestions(code: string) {
  const arrays = declaredArrays(code)
  return [...parameterRangeSuggestions(code), ...fixedArrayRangeSuggestions(code, arrays)]
}
