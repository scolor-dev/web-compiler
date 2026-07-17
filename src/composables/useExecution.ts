import { onBeforeUnmount, ref } from 'vue'
import type { ExecuteRequest, ExecuteResult, ExecutionAction, LanguageId, WorkerResponse } from '../types/execution'

const TIMEOUT_MS = 5_000

export function useExecution() {
  const running = ref(false)
  const result = ref<ExecuteResult | null>(null)
  const activeAction = ref<ExecutionAction>('run')
  let worker: Worker | null = null
  let sequence = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  function createWorker() {
    worker?.terminate()
    worker = new Worker(new URL('../workers/execution.worker.ts', import.meta.url), { type: 'module' })
    worker.onerror = (event) => {
      finish({ stdout: '', stderr: event.message || 'Workerの初期化に失敗しました', exitCode: 1, diagnostics: [] })
    }
  }

  function finish(next: ExecuteResult) {
    clearTimeout(timer)
    running.value = false
    result.value = next
  }

  function perform(action: ExecutionAction, language: LanguageId, code: string, stdin: string) {
    if (running.value) return
    if (!worker) createWorker()
    running.value = true
    activeAction.value = action
    result.value = null
    const id = ++sequence
    worker!.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id === id) finish(event.data)
    }
    const request: ExecuteRequest = { id, action, language, code, stdin }
    worker!.postMessage(request)
    timer = setTimeout(() => {
      createWorker()
      finish({
        stdout: '',
        stderr: `${TIMEOUT_MS / 1000}秒の実行時間制限を超えたため停止しました`,
        exitCode: 124,
        diagnostics: [{ severity: 'error', message: '処理時間制限を超えました', line: 1, column: 1 }],
        action,
      })
    }, TIMEOUT_MS)
  }

  function stop() {
    if (!running.value) return
    createWorker()
    finish({ stdout: '', stderr: 'ユーザーが処理を停止しました', exitCode: 130, diagnostics: [], action: activeAction.value })
  }

  onBeforeUnmount(() => { clearTimeout(timer); worker?.terminate() })
  const run = (language: LanguageId, code: string, stdin: string) => perform('run', language, code, stdin)
  const lint = (language: LanguageId, code: string) => perform('lint', language, code, '')
  return { running, result, activeAction, run, lint, stop }
}
