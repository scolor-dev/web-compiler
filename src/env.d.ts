/// <reference types="vite/client" />

declare module '@/wasm/compiler/local_code_compiler.js' {
  export default function init(input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module): Promise<unknown>
  export function execute(request: string): string
}
