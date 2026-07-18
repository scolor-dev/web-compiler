import assert from 'node:assert/strict'
import { commands } from '@yowasp/clang'
import { ConsoleStdout, File, OpenFile, PreopenDirectory, WASI } from '@bjorn3/browser_wasi_shim'

const source = String.raw`
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define BASE 0x10
typedef struct { int value; } Box;
union Number { int integer; float real; };
enum Mode { ADD = 1 };
static const unsigned long global_value = BASE;

int main(int argc, char **argv) {
  int input = 0, count = 0;
  int values[3] = { 01, 0b10, 3 };
  int *pointer = values;
  Box box = { .value = 4 };
  union Number number = { .integer = 5 };
  double ratio = 1.5;
  char *text = malloc(8);
  strcpy(text, "ok");
  scanf("%d", &input);
  do { ++count; } while (count < 1);
  switch (ADD) { case 1: pointer[0] += 1; break; default: goto failed; }
  pointer[1] = (int)ratio + ((global_value >> 3) & 3);
  count = (argc > 0 ? count : 0), count++;
  FILE *file = fopen("result.txt", "w+");
  fprintf(file, "%s", text);
  rewind(file);
  char readback[8] = {0};
  fscanf(file, "%7s", readback);
  fclose(file);
  printf("%zu %.1f %d %d %d %s %s\n", sizeof(Box), ratio, input, pointer[0], box.value + number.integer, readback, argv[0]);
  free(text);
  return 0;
failed:
  return 2;
}`

let compilerError = ''
const files = await commands.clang(
  ['main.c', '-std=gnu17', '-Wall', '-Wextra', '-O0', '-o', 'program.wasm'],
  { 'main.c': source },
  { stderr: (bytes) => { if (bytes) compilerError += new TextDecoder().decode(bytes, { stream: true }) }, fetchProgress: () => {} },
)
assert.equal(compilerError, '')
assert.ok(files?.['program.wasm'] instanceof Uint8Array)

let stdout = ''
let stderr = ''
const decoder = new TextDecoder()
const root = new PreopenDirectory('.', new Map())
const wasi = new WASI(['program.wasm'], [], [
  new OpenFile(new File(new TextEncoder().encode('7\n'))),
  new ConsoleStdout((bytes) => { stdout += decoder.decode(bytes, { stream: true }) }),
  new ConsoleStdout((bytes) => { stderr += decoder.decode(bytes, { stream: true }) }),
  root,
])
const module = await WebAssembly.compile(files['program.wasm'])
const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport })
assert.equal(wasi.start(instance), 0)
assert.equal(stderr, '')
assert.match(stdout, /^4 1\.5 7 2 9 ok program\.wasm\n$/)

let invalidError = ''
await assert.rejects(
  commands.clang(['main.c', '-std=gnu17', '-fsyntax-only'], { 'main.c': 'int main( {' }, {
    stderr: (bytes) => { if (bytes) invalidError += decoder.decode(bytes, { stream: true }) },
    fetchProgress: () => {},
  }),
)
assert.match(invalidError, /main\.c:1:\d+: error:/)
