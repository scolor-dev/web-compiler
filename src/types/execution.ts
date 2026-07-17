export type LanguageId = 'c' | 'javascript' | 'whitespace'
export type ExecutionAction = 'run' | 'lint'

export interface Diagnostic {
  severity: 'error' | 'warning'
  message: string
  line: number
  column: number
}

export interface ExecuteRequest {
  id: number
  action: ExecutionAction
  language: LanguageId
  code: string
  stdin: string
}

export interface ExecuteResult {
  stdout: string
  stderr: string
  exitCode: number
  diagnostics: Diagnostic[]
  durationMs?: number
  action?: ExecutionAction
}

export interface WorkerResponse extends ExecuteResult {
  id: number
}
