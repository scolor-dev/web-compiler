# Example programs

各言語に、正常に動作するアルゴリズム、明確なエラー、Lintの検出範囲を確認するコードがあります。

| 言語 | 正常例 | エラー例 |
| --- | --- | --- |
| C | Fibonacci、素数判定 | セミコロン不足、未定義変数 |
| JavaScript | マージソート、二分探索 | 閉じ括弧不足、未定義関数 |
| React | リスト表示、条件付きカード | JSX閉じタグ不足、未定義コンポーネント |
| Whitespace | 1〜10の合計、6の階乗 | スタック不足、未定義ラベル |

`error-syntax` / `error-undefined-label` はLintで検出できます。未定義変数・未定義関数・未定義コンポーネント・スタック不足はエラー検出の例です。

## Lint確認用サンプル

| ファイル | Lintで確認できる主な問題 |
| --- | --- |
| `c/lint-control-flow.c` | forの配列範囲、if/while内の代入、caseのフォールスルー、二次元配列の処理漏れ |
| `c/lint-hard-errors.c` | `brake`のタイプミス、case値の重複、不正なbreak |
| `javascript/lint-control-flow.js` | 配列の処理漏れ、if/while内の代入、break後の到達不能コード、`brake`のタイプミス、二次元配列 |
| `javascript/lint-data-structures.js` | 配列の部分集計。動的な連想オブジェクト参照は現在の限界も確認可能 |
| `react/lint-control-flow.jsx` | JavaScriptの条件代入に加え、className・属性名・イベントハンドラー・mapのkey |
| `react/lint-data-and-logic.jsx` | 二次元のオブジェクト配列、部分処理、mapのkey |
| `whitespace/error-incomplete-instruction.ws` | 途中で終わった命令 |
| `whitespace/error-duplicate-label.ws` | 同じラベルの重複定義 |

`lint-limit-business-logic` と `lint-limit-sub-instead-of-add.ws` は、構文として正しいものの仕様とは異なる計算の例です。たとえば「本来は `+` なのに `-`」という誤りは、期待する計算式やテスト結果が与えられない限りLintだけでは判定できません。

Whitespaceの `.ws` ファイルは空白・タブ・改行だけで構成されています。通常のテキスト表示では内容が見えないため、Local Code Studioの空白可視化付きエディターで開いてください。
