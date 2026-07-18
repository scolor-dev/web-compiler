import { transform } from 'sucrase'
import type { Diagnostic, ExecuteResult } from '../types/execution'
import { analyzeJavaScript, type JavaScriptAnalysis } from './javascript-toolchain'
import { reactSuggestions } from './react-suggestions'

export const reactGlobalNames = [
  'React', 'useActionState', 'useCallback', 'useContext', 'useDebugValue', 'useDeferredValue', 'useEffect',
  'useId', 'useImperativeHandle', 'useInsertionEffect', 'useLayoutEffect', 'useMemo', 'useOptimistic',
  'useReducer', 'useRef', 'useState', 'useSyncExternalStore', 'useTransition',
] as const

const reactGlobals = ['__reactRuntime', 'render', ...reactGlobalNames]

function transformDiagnostic(error: unknown): Diagnostic {
  const item = error as Error & { loc?: { line?: number, column?: number }, pos?: number }
  return {
    severity: 'error',
    message: item.message.replace(/ \(\d+:\d+\)$/, ''),
    line: item.loc?.line ?? 1,
    column: (item.loc?.column ?? 0) + 1,
  }
}

function normalizeReactImports(code: string) {
  return code.replace(
    /(\bfrom\s*|\bimport\s*)((["']))react\3/g,
    (_match, prefix: string, quoted: string) => `${prefix}${quoted[0]}local:runtime${quoted[0]}`,
  )
}

export function analyzeReact(code: string): JavaScriptAnalysis {
  try {
    const transformed = transform(code, {
      transforms: ['jsx'],
      production: true,
      jsxPragma: '__reactRuntime.createElement',
      jsxFragmentPragma: '__reactRuntime.Fragment',
    }).code
    const analysis = analyzeJavaScript(normalizeReactImports(transformed), reactGlobals)
    analysis.diagnostics.push(...reactSuggestions(code))
    return analysis
  } catch (error) {
    return { code, diagnostics: [transformDiagnostic(error)] }
  }
}

export function lintReact(code: string): ExecuteResult {
  const result = analyzeReact(code)
  const errors = result.diagnostics.filter((item) => item.severity === 'error')
  return {
    stdout: '',
    stderr: errors.map((item) => `${item.line}:${item.column} ${item.message}`).join('\n'),
    exitCode: errors.length ? 1 : 0,
    diagnostics: result.diagnostics,
  }
}
