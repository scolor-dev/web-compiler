import { describe, expect, it } from 'vitest'
import { processC } from './c-toolchain'

describe('C toolchain integration', () => {
  it('collects stdout after the WASI program has finished', async () => {
    const result = await processC('run', `
      #include <stdio.h>
      int main(void) {
        puts("Hello from C + WASM!");
        return 0;
      }
    `, '')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('Hello from C + WASM!\n')
    expect(result.stderr).toBe('')
  }, 30_000)

  it('returns Clang diagnostics without executing invalid code', async () => {
    const result = await processC('lint', 'int main(void) { return missing; }', '')
    expect(result.exitCode).toBe(1)
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', line: 1 })
  }, 30_000)

  it('adds a warning when an array count deliberately-looking expression omits the last item', async () => {
    const result = await processC('lint', `
      int sum(int arr[], int n) {
        int total = 0;
        for (int i = 0; i < n - 1; i++) total += arr[i];
        return total;
      }
      int main(void) { int arr[] = {1, 2, 3, 4, 5}; return sum(arr, 5); }
    `, '')
    expect(result.exitCode).toBe(0)
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: 'warning', message: expect.stringContaining('i < n') }))
  }, 30_000)
})
