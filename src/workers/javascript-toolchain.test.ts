import { describe, expect, it } from 'vitest'
import { analyzeJavaScript, lintJavaScript } from './javascript-toolchain'

describe('JavaScript static analysis', () => {
  it('parses regular expressions, templates, scopes, and module exports', () => {
    const result = analyzeJavaScript(`
      const name = 'Ada'
      const pattern = /A.+/
      export const greeting = \`Hello, \${name}\`
      if (pattern.test(name)) console.log(greeting)
    `)
    expect(result.diagnostics).toEqual([])
    expect(result.code).not.toContain('export const')
  })

  it('transforms the isolated local runtime module', () => {
    const result = analyzeJavaScript(`
      import runtime, { stdin as input } from 'local:runtime'
      const later = await import('local:runtime')
      runtime.console.log(input, later.stdin)
    `)
    expect(result.diagnostics).toEqual([])
    expect(result.code).toContain('__moduleRuntime')
    expect(result.code).toContain('Promise.resolve(__moduleRuntime)')
  })

  it('finds syntax errors, undefined names, and unreachable code without executing', () => {
    expect(lintJavaScript('const = 1').diagnostics[0].message).toContain('Unexpected token')
    const result = lintJavaScript('function run() { return missing; console.log("never") }')
    expect(result.diagnostics.map(({ message }) => message)).toEqual(expect.arrayContaining([
      '未定義の識別子「missing」です',
      'このコードには到達できません',
    ]))
  })

  it('rejects non-local static and dynamic imports', () => {
    const staticResult = lintJavaScript("import value from './other.js'")
    const dynamicResult = lintJavaScript("import('https://example.com/mod.js')")
    expect(staticResult.exitCode).toBe(1)
    expect(dynamicResult.exitCode).toBe(1)
    expect(staticResult.diagnostics[0].message).toContain('外部モジュール')
    expect(dynamicResult.diagnostics[0].message).toContain('local:runtime')
  })
})
