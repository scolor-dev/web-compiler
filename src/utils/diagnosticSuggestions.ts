import type { Diagnostic, LanguageId } from '../types/execution'

type SuggestionRule = {
  pattern: RegExp
  suggestion: string | ((match: RegExpMatchArray) => string)
}

const commonRules: SuggestionRule[] = [
  { pattern: /処理時間制限|time limit|timed out/i, suggestion: '終了条件が成立するか、入力サイズや繰り返し回数が大きすぎないか確認してください。' },
  { pattern: /0で除算|division by zero|divide by zero/i, suggestion: '除数が0にならないか事前に確認し、必要なら0の場合を分岐で処理してください。' },
  { pattern: /実行エンジンを読み込めません|Workerの初期化/i, suggestion: 'ページを再読み込みしてください。改善しない場合は開発サーバーを再起動し、生成済みWASMが配信されているか確認してください。' },
]

const cRules: SuggestionRule[] = [
  { pattern: /(?:use of undeclared identifier|undeclared identifier|未定義の変数)\s*[`'「]?([^`'」\s]+)?/i, suggestion: (match) => `「${match[1] ?? 'その名前'}」の宣言漏れやスペルミスを確認してください。使用前に型付きで宣言する必要があります。` },
  { pattern: /implicit declaration of function\s+['‘]?([^'’\s]+)?/i, suggestion: (match) => `「${match[1] ?? '関数'}」を宣言したヘッダーをincludeするか、呼び出し前にプロトタイプ宣言を追加してください。` },
  { pattern: /expected ['‘]?[;}]['’]?|`;` が必要|`}` が必要/i, suggestion: '示された位置の直前を確認し、足りないセミコロンや閉じ波括弧を追加してください。' },
  { pattern: /expected (?:expression|identifier)|式が必要|識別子が必要/i, suggestion: '演算子の前後に値があるか、余分な記号やカンマがないか確認してください。' },
  { pattern: /too (?:few|many) arguments|引数.*(?:必要|個)/i, suggestion: '関数の宣言を確認し、引数の個数と順序を呼び出し側で合わせてください。' },
  { pattern: /format specifies|format string|書式/i, suggestion: 'printf/scanfの書式指定子と、対応する引数の型・個数を揃えてください。' },
  { pattern: /main関数が見つかりません/i, suggestion: 'プログラムの入口として `int main(void) { ... }` を追加してください。' },
  { pattern: /redefinition|重複しています/i, suggestion: '同じスコープで同名の変数や関数を複数回定義していないか確認してください。' },
  { pattern: /array.*bounds|範囲外アクセス/i, suggestion: '配列の添字が0以上かつ要素数未満になるよう、ループ条件を見直してください。' },
  { pattern: /assignment as a condition/i, suggestion: '代入が意図したものか確認してください。比較する場合は `=` ではなく `==` を使用します。' },
  { pattern: /fallthrough/i, suggestion: '次のcaseも続けて実行する意図がなければ、現在のcase末尾へ `break;` を追加してください。' },
  { pattern: /duplicate case value/i, suggestion: 'switch内のcase値が重複しています。各caseを一意な値に変更してください。' },
  { pattern: /['‘]break['’] statement not in loop or switch/i, suggestion: '`break;` をfor・while・do-while・switchの内側へ移動するか、不要なら削除してください。' },
]

const javascriptRules: SuggestionRule[] = [
  { pattern: /未定義の識別子「([^」]+)」|(?:is not defined|Can't find variable:?)\s*['‘]?([^'’\s]+)?/i, suggestion: (match) => `「${match[1] ?? match[2] ?? 'その名前'}」のスペルを確認し、使用前に const・let・function などで宣言してください。` },
  { pattern: /Unexpected token|Unexpected character|予期しない/i, suggestion: 'エラー位置の直前にある括弧・波括弧・カンマ・演算子の対応を確認してください。' },
  { pattern: /Unterminated|終端されていません/i, suggestion: '文字列の引用符、テンプレートリテラル、括弧の閉じ忘れがないか確認してください。' },
  { pattern: /already been declared|Identifier .* has already been declared/i, suggestion: '同じスコープの重複宣言を削除するか、片方の変数名を変更してください。' },
  { pattern: /Cannot read propert|Cannot read properties|undefined.*(?:property|reading)|null.*(?:property|reading)/i, suggestion: '値が null / undefined でないことを確認してからプロパティへアクセスしてください。必要なら条件分岐や `?.` を使えます。' },
  { pattern: /is not a function|not callable/i, suggestion: '呼び出している値が関数か確認してください。関数名のスペルや、変数による上書きも見直してください。' },
  { pattern: /条件式の中で代入/i, suggestion: '代入が意図したものか確認してください。比較したい場合は `=` ではなく `===` を使います。' },
  { pattern: /到達できません/i, suggestion: 'return・throw・break・continueより後の処理を、その命令より前へ移動するか削除してください。' },
  { pattern: /外部モジュール|動的import/i, suggestion: 'この静的Web環境では外部パッケージを取得できません。標準APIか `local:runtime` の機能に置き換えてください。' },
  { pattern: /render\(<App \/>\)/i, suggestion: '表示したいReact要素を最後に `render(<App />)` へ渡してください。' },
  { pattern: /Each child.*unique.*key|key.*prop/i, suggestion: '配列から生成する要素に、データを一意に識別できる `key` を指定してください。' },
]

const whitespaceRules: SuggestionRule[] = [
  { pattern: /スタックが空|swapには2つ|複製する深さがスタック/i, suggestion: 'この命令までに必要な値がpushされているか確認してください。分岐ごとのスタック残量にも注意してください。' },
  { pattern: /未定義のラベル\s*[`「]([^`」]+)[`」]/i, suggestion: (match) => `ジャンプ先「${match[1]}」と同じSpace/Tab列のラベル定義を追加するか、ラベル指定を修正してください。` },
  { pattern: /ラベル.*重複/i, suggestion: '同じSpace/Tab列のラベル定義を1つだけにし、どちらかのラベルを変更してください。' },
  { pattern: /命令が途中|数値の符号がありません|終端されていません/i, suggestion: '命令や数値・ラベルの末尾に必要なLFがあるか、Space/Tab/LFの並びを確認してください。' },
  { pattern: /未知の.*命令/i, suggestion: '可視化された記号を確認し、命令プレフィックスのSpace・Tab・LFの並びを修正してください。' },
  { pattern: /callなしでreturn/i, suggestion: 'returnはcallで呼び出した処理内だけで使い、通常の移動にはjumpを使用してください。' },
  { pattern: /入力.*(?:不足|ありません|読み込)/i, suggestion: '「標準入力」または「コンソール」に、入力命令が必要とする文字・数値を追加してください。' },
]

function rulesFor(language: LanguageId) {
  if (language === 'c') return cRules
  if (language === 'whitespace') return whitespaceRules
  return javascriptRules
}

export function diagnosticSuggestion(language: LanguageId, diagnostic: Diagnostic): string {
  for (const rule of [...commonRules, ...rulesFor(language)]) {
    const match = diagnostic.message.match(rule.pattern)
    if (match) return typeof rule.suggestion === 'function' ? rule.suggestion(match) : rule.suggestion
  }

  if (diagnostic.severity === 'warning') return '意図した動作か確認し、問題がなければそのままにできます。'
  if (language === 'whitespace') return 'エラー位置までの命令列とスタック・ヒープ・ラベルの状態を順番に確認してください。'
  if (language === 'c') return '示された行だけでなく、その直前の宣言・区切り記号・括弧の対応も確認してください。'
  return '示された行と直前の行を確認し、値の型・宣言・括弧の対応を見直してください。'
}
