import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { processC } from './c-toolchain'
import { lintJavaScript } from './javascript-toolchain'
import { lintReact } from './react-toolchain'

function example(path: string) {
  return readFileSync(new URL(`../../example/${path}`, import.meta.url), 'utf8')
}

describe('Lint showcase examples', () => {
  it('Cの制御フロー例から複数の問題を検出する', async () => {
    const result = await processC('lint', example('c/lint-control-flow.c'), '')
    const messages = result.diagnostics.map(({ message }) => message)

    expect(messages.length).toBeGreaterThanOrEqual(5)
    expect(messages.some((message) => message.includes('assignment as a condition'))).toBe(true)
    expect(messages.some((message) => message.includes('fallthrough'))).toBe(true)
    expect(messages.some((message) => message.includes('配列「values」'))).toBe(true)
    expect(messages.some((message) => message.includes('配列「matrix」'))).toBe(true)
  })

  it('Cのハードエラー例からタイプミス・case重複・不正なbreakを検出する', async () => {
    const messages = (await processC('lint', example('c/lint-hard-errors.c'), '')).diagnostics.map(({ message }) => message)

    expect(messages).toEqual(expect.arrayContaining([
      expect.stringContaining("undeclared identifier 'brake'"),
      expect.stringContaining('duplicate case value'),
      expect.stringContaining("'break' statement not in loop or switch statement"),
    ]))
  })

  it('JavaScriptの例から制御フローと配列の問題を検出する', () => {
    const messages = lintJavaScript(example('javascript/lint-control-flow.js')).diagnostics.map(({ message }) => message)

    expect(messages).toEqual(expect.arrayContaining([
      expect.stringContaining('未定義の識別子「brake」'),
      expect.stringContaining('到達できません'),
      expect.stringContaining('==='),
      expect.stringContaining('values.length'),
      expect.stringContaining('matrix.length'),
    ]))
  })

  it('Reactの例から固有の記述ミスを複数検出する', () => {
    const messages = lintReact(example('react/lint-control-flow.jsx')).diagnostics.map(({ message }) => message)

    expect(messages).toEqual(expect.arrayContaining([
      expect.stringContaining('summary-card'),
      expect.stringContaining('onClick'),
      expect.stringContaining('描画中に実行'),
      expect.stringContaining('key'),
      expect.stringContaining('==='),
    ]))
  })

  it('Reactの二次元データ例から部分処理とkey不足を検出する', () => {
    const messages = lintReact(example('react/lint-data-and-logic.jsx')).diagnostics.map(({ message }) => message)

    expect(messages).toEqual(expect.arrayContaining([
      expect.stringContaining('処理対象は先頭1件'),
      expect.stringContaining('key'),
    ]))
  })

  it('仕様依存の演算ミスはLintだけでは断定しない', async () => {
    expect((await processC('lint', example('c/lint-limit-business-logic.c'), '')).diagnostics).toEqual([])
    expect(lintJavaScript(example('javascript/lint-limit-business-logic.js')).diagnostics).toEqual([])
  })
})
