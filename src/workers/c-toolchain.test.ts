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
})
