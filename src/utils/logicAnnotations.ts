import type { LanguageId } from '../types/execution'

function quotedValue(text: string) {
  return text.match(/^["'`]([^"'`]*)["'`]$/)?.[1]
}

function describeC(line: string): string | null {
  const source = line.trim()
  if (!source || source === '{' || source === '}' || source.startsWith('//') || source.startsWith('/*') || source.startsWith('*')) return null

  const include = source.match(/^#include\s*[<"]([^>"]+)[>"]/)?.[1]
  if (include) return `${include}の機能を読み込む`
  const macro = source.match(/^#define\s+([A-Za-z_]\w*)/)?.[1]
  if (macro) return `マクロ${macro}を定義`
  if (/\bmain\s*\([^)]*\)\s*\{?/.test(source)) return 'プログラムの開始地点を定義'
  const fn = source.match(/^(?:[\w*]+\s+)+([A-Za-z_]\w*)\s*\([^;]*\)\s*\{/)?.[1]
  if (fn && !['if', 'for', 'while', 'switch'].includes(fn)) return `関数${fn}を定義`
  if (/^else\s+if\b/.test(source)) return '前の条件が偽なら、次の条件を確認'
  if (/^if\s*\(/.test(source)) return '条件が真の場合だけ中の処理を行う'
  if (/^else\b/.test(source)) return '条件が偽だった場合の処理'
  if (/^for\s*\(/.test(source)) return '初期化・条件・更新を使って繰り返す'
  if (/^while\s*\(/.test(source)) return '条件が真の間、処理を繰り返す'
  if (/^do\b/.test(source)) return '処理を一度行ってから条件を確認'
  if (/^switch\s*\(/.test(source)) return '値に一致する分岐を選ぶ'
  const caseValue = source.match(/^case\s+(.+?):/)?.[1]
  if (caseValue) return `${caseValue}の場合の処理`
  if (/^default\s*:/.test(source)) return 'どの値にも一致しない場合の処理'
  if (/^break\s*;/.test(source)) return '現在のループまたは分岐を抜ける'
  if (/^continue\s*;/.test(source)) return '次の繰り返しへ進む'
  const returnStatement = source.match(/^return(?:\s+(.+?))?\s*;/)
  if (returnStatement) return returnStatement[1] ? `${returnStatement[1]}を呼び出し元へ返す` : '呼び出し元へ戻る'

  const puts = source.match(/\bputs\s*\((.+)\)\s*;/)?.[1]
  if (puts) return quotedValue(puts) !== undefined ? `「${quotedValue(puts)}」を出力して改行` : `${puts}を出力して改行`
  const printf = source.match(/\bprintf\s*\((.+)\)\s*;/)?.[1]
  if (printf) return '書式を適用して値を出力'
  if (/\b(scanf|getchar)\s*\(/.test(source)) return '標準入力から値を読み取る'

  const declaration = source.match(/^(?:const\s+)?(?:signed\s+|unsigned\s+)?(?:short\s+|long\s+)*(?:int|char|float|double|size_t|\w+_t)\s+\**\s*([A-Za-z_]\w*)\s*(?:=\s*(.+?))?;/)
  if (declaration) return declaration[2] ? `変数${declaration[1]}を${declaration[2]}で初期化` : `変数${declaration[1]}を宣言`
  const assignment = source.match(/^([A-Za-z_]\w*(?:\[[^\]]+\])?)\s*([+\-*/%]?=)\s*(.+);/)
  if (assignment) return `${assignment[1]}を${assignment[3]}で更新`
  const increment = source.match(/^([A-Za-z_]\w*)(\+\+|--);?$/)
  if (increment) return `${increment[1]}を1${increment[2] === '++' ? '増やす' : '減らす'}`
  const call = source.match(/^([A-Za-z_]\w*)\s*\(/)?.[1]
  if (call) return `関数${call}を呼び出す`
  return null
}

function describeJavaScript(line: string): string | null {
  const source = line.trim()
  if (!source || source === '{' || source === '}' || source.startsWith('//') || source.startsWith('/*') || source.startsWith('*')) return null

  const imported = source.match(/^import\s+.+?\s+from\s+["'](.+?)["']/)?.[1]
  if (imported) return `${imported}から機能を読み込む`
  if (/^export\s+default\b/.test(source)) return 'この値を既定の公開値にする'
  if (/^export\b/.test(source)) return '宣言した値を外部へ公開する'
  const fn = source.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/)?.[1]
  if (fn) return `関数${fn}を定義`
  const arrow = source.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=.*=>/)?.[1]
  if (arrow) return `関数${arrow}を定義`
  if (/^else\s+if\b/.test(source)) return '前の条件が偽なら、次の条件を確認'
  if (/^if\s*\(/.test(source)) return '条件が真の場合だけ中の処理を行う'
  if (/^else\b/.test(source)) return '条件が偽だった場合の処理'
  if (/^for\s*\([^)]*\bof\b/.test(source)) return 'コレクションの各要素について繰り返す'
  if (/^for\s*\(/.test(source)) return '初期化・条件・更新を使って繰り返す'
  if (/^while\s*\(/.test(source)) return '条件が真の間、処理を繰り返す'
  if (/^switch\s*\(/.test(source)) return '値に一致する分岐を選ぶ'
  if (/^try\b/.test(source)) return '失敗する可能性がある処理を試す'
  if (/^catch\b/.test(source) || /^}\s*catch\b/.test(source)) return '発生したエラーを処理する'
  if (/^throw\b/.test(source)) return 'エラーを発生させる'
  const returnStatement = source.match(/^return(?:\s+(.+?))?;?$/)
  if (returnStatement) return returnStatement[1] ? `${returnStatement[1]}を呼び出し元へ返す` : '呼び出し元へ戻る'

  const log = source.match(/console\.log\s*\((.+)\)\s*;?/)?.[1]
  if (log) return quotedValue(log) !== undefined ? `「${quotedValue(log)}」をコンソールへ表示` : `${log}をコンソールへ表示`
  if (/console\.table\s*\(/.test(source)) return '値を表形式でコンソールへ表示'
  if (/console\.(?:warn|error)\s*\(/.test(source)) return '警告またはエラーをコンソールへ表示'
  if (/\bawait\b/.test(source)) return '非同期処理の完了を待つ'

  const declaration = source.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?:=\s*(.+?))?;?$/)
  if (declaration) return declaration[2] ? `変数${declaration[1]}を${declaration[2]}で初期化` : `変数${declaration[1]}を宣言`
  if (/\.(?:map|flatMap)\s*\(/.test(source)) return '各要素を変換して新しい配列を作る'
  if (/\.filter\s*\(/.test(source)) return '条件に合う要素だけを取り出す'
  if (/\.reduce\s*\(/.test(source)) return '各要素を1つの値へ集約する'
  const push = source.match(/^([A-Za-z_$][\w$]*)\.push\s*\((.+)\)\s*;?$/)
  if (push) return `${push[1]}へ${push[2]}を追加`
  const increment = source.match(/^([A-Za-z_$][\w$]*)(\+\+|--);?$/)
  if (increment) return `${increment[1]}を1${increment[2] === '++' ? '増やす' : '減らす'}`
  const assignment = source.match(/^([A-Za-z_$][\w$]*(?:\[[^\]]+\])?)\s*([+\-*/%]?=)\s*(.+);?$/)
  if (assignment) return `${assignment[1]}を${assignment[3]}で更新`
  const call = source.match(/^(?:await\s+)?([A-Za-z_$][\w$]*)\s*\(/)?.[1]
  if (call) return `関数${call}を呼び出す`
  const method = source.match(/^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/)
  if (method) return `${method[1]}の${method[2]}を呼び出す`
  return null
}

export function describeLogicLine(language: LanguageId, line: string) {
  if (language === 'c') return describeC(line)
  if (language === 'javascript') return describeJavaScript(line)
  return null
}
