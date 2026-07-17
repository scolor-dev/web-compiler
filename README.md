# Local Code Studio

ブラウザだけでコードを書き、実行結果とエラーを確認できる、完全ローカル動作の静的Webアプリです。

## 対応言語

- **Whitespace**: Rust/WASM製のパーサー・VMで実行
- **C**: 学習用途のCサブセットをRust/WASMで字句解析・構文解析・評価
- **JavaScript**: Rust/WASMで構文の事前検査を行い、専用Web Worker内で実行

入力したコードや実行結果をサーバーへ送信しません。ビルド成果物を静的ホスティングするだけで利用できます。

## 主な機能

- 言語切り替え付きコードエディター
- 標準入力の指定
- 実行、停止、実行時間制限
- 標準出力・標準エラー・終了状態の表示
- 行・列付きのコンパイル／実行エラー表示
- サンプルプログラム
- エディター内容と言語設定のブラウザ内保存
- レスポンシブUIとダーク／ライトテーマ
- キーボードショートカット（`Ctrl/Cmd + Enter` で実行）

## 技術構成

- Vue 3 + TypeScript + Vite
- Tailwind CSS
- Rust + wasm-bindgen + WebAssembly
- Web Worker（UIをブロックしない実行とタイムアウト制御）
- Vitest（フロントエンド） / cargo test（Rust）

## アーキテクチャ

```text
src/
├── components/        # 表示に専念するVueコンポーネント
├── composables/       # エディター状態、永続化、実行制御
├── constants/         # 言語情報とサンプルコード
├── types/             # フロントエンド共通型
├── workers/           # WASMとJavaScriptを隔離実行するWorker
└── wasm/              # wasm-pack生成物の読み込み境界
crates/compiler/
├── src/c.rs           # Cサブセットのlexer/parser/interpreter
├── src/whitespace.rs  # Whitespace parser/VM
├── src/javascript.rs  # JavaScript事前検査
└── src/lib.rs         # wasm-bindgen公開API
public/                # 静的アセット
```

UIは実行エンジンを直接参照せず、型付きメッセージでWorkerと通信します。WorkerがWASMを初期化してコンパイル・実行を担当し、メインスレッドはタイムアウト時にWorkerを破棄・再生成します。

## Cサブセット

ローカル完結かつ小さなWASMバイナリを保つため、システムCコンパイラではなく学習用インタープリターを実装します。

対応予定:

- `int` / `char` 型の変数と整数演算
- 関数定義・呼び出し・`return`
- `if` / `else` / `while` / `for`
- `printf` / `puts` / `putchar` / `getchar`
- `//` と `/* ... */` コメント

非対応の機能には、行・列付きで明示的なエラーを返します。ポインター、構造体、プリプロセッサ、外部ライブラリ、ファイル／ネットワークI/Oは対象外です。

## 開発

必要環境:

- Node.js 20以降
- Rust stable
- wasm-pack

```bash
npm install
npm run dev
```

`npm run dev` と `npm run build` は、フロントエンドより先にRustクレートをWASMへビルドします。

## 検証

```bash
npm test
npm run typecheck
npm run build
cargo test --manifest-path crates/compiler/Cargo.toml
```

## 静的配信

```bash
npm run build
```

生成された `dist/` を任意の静的ホスティングへ配置します。実行時のAPIサーバー、CDNライブラリ、外部通信は不要です。

## セキュリティ方針

- JavaScriptはDOMへ触れない専用Workerで実行
- `fetch`、`XMLHttpRequest`、`WebSocket`、`importScripts`等のネットワークAPIをWorker内で無効化
- 無限ループはメインスレッド側のタイムアウトでWorkerごと停止
- CとWhitespaceはWASM内の命令数上限・出力量上限で停止
- ユーザーコードをHTMLとして描画しない

## ライセンス

Private / Unlicensed
