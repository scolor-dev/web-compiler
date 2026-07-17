import type { LanguageId } from '../types/execution'

export interface LanguageDefinition {
  id: LanguageId
  label: string
  extension: string
  color: string
  description: string
  sample: string
  stdin: string
}

const whitespacePush = (value: number) => `   ${value.toString(2).replaceAll('0', ' ').replaceAll('1', '\t')}\n`
const whitespaceHello = [...'Hello World!\n'].map((character) => `${whitespacePush(character.codePointAt(0)!)}\t\n  `).join('') + '\n\n\n'

export const languages: LanguageDefinition[] = [
  {
    id: 'c',
    label: 'C',
    extension: 'main.c',
    color: '#8b9eff',
    description: 'Rust製Cインタープリター',
    sample: `#include <stdio.h>

int square(int value) {
  return value * value;
}

int main() {
  puts("Hello from C + WASM!");

  for (int i = 1; i <= 5; i++) {
    printf("%d² = %d\\n", i, square(i));
  }

  return 0;
}`,
    stdin: '',
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    extension: 'main.js',
    color: '#f4d35e',
    description: 'WASM検査 + 隔離Worker',
    sample: `const languages = ['Whitespace', 'C', 'JavaScript']

console.log('Hello from JavaScript!')
console.table(
  languages.map((name, index) => ({
    id: index + 1,
    language: name,
    ready: true,
  })),
)

const answer = languages
  .map((name) => name.length)
  .reduce((sum, length) => sum + length, 0)

console.log({ answer })`,
    stdin: '',
  },
  {
    id: 'whitespace',
    label: 'Whitespace',
    extension: 'hello.ws',
    color: '#d8b4fe',
    description: 'Rust製スタックVM',
    sample: whitespaceHello,
    stdin: '',
  },
]

export const languageMap = Object.fromEntries(languages.map((language) => [language.id, language])) as Record<LanguageId, LanguageDefinition>
