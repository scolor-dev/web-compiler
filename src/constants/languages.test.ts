import { describe, expect, it } from 'vitest'
import { languageMap, languages } from './languages'

describe('language definitions', () => {
  it('provides every requested language exactly once', () => {
    expect(languages.map(({ id }) => id)).toEqual(['c', 'javascript', 'whitespace'])
  })

  it('provides runnable starter code', () => {
    expect(languageMap.c.sample).toContain('int main(void)')
    expect(languageMap.javascript.sample).toContain('console.log')
    expect(languageMap.whitespace.sample).toMatch(/[ \t\n]+/)
    expect(languageMap.whitespace.sample.endsWith('\n\n\n')).toBe(true)
  })
})
