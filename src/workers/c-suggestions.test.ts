import { describe, expect, it } from 'vitest'
import { cSuggestions } from './c-suggestions'

describe('C lint suggestions', () => {
  it('suggests using the full count passed to an array function', () => {
    const code = `
int sum(int arr[], int n) {
  int total = 0;
  for (int i = 0; i < n - 1; i++) total += arr[i];
  return total;
}`
    expect(cSuggestions(code)).toEqual([
      expect.objectContaining({ severity: 'warning', line: 4, message: expect.stringContaining('i < n') }),
    ])
  })

  it('suggests checking literal loop bounds against fixed arrays', () => {
    const omitted = cSuggestions('int main(void) { int values[] = {1, 2, 3, 4, 5}; for (int i = 0; i < 4; i++) { printf("%d", values[i]); } }')
    const exceeded = cSuggestions('int main(void) { int values[5]; for (int i = 0; i <= 5; i++) { values[i] = i; } }')
    expect(omitted[0]?.message).toContain('先頭4件')
    expect(exceeded[0]?.message).toContain('範囲外アクセス')
  })

  it('does not warn when all elements are processed', () => {
    expect(cSuggestions('int sum(int arr[], int n) { int total = 0; for (int i = 0; i < n; i++) total += arr[i]; return total; }')).toEqual([])
  })
})
