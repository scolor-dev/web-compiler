# Local Code Studio

ブラウザだけでコードを書き、実行結果とエラーを確認できる、完全ローカル動作の静的Webアプリです。

## 対応言語

- **Whitespace**: Rust/WASM製のパーサー・VMで実行
- **C**: Clang WASMでGNU C17をコンパイルし、WASI上で実行
- **JavaScript**: Acornとeslint-scopeで静的検査し、専用Web Worker内で実行

入力したコードや実行結果をサーバーへ送信しません。ビルド成果物を静的ホスティングするだけで利用できます。

## 主な機能

- 言語切り替え付きコードエディター
- 標準入力の指定
- 実行、停止、実行時間制限
- 標準出力・標準エラー・終了状態の表示
- 行・列付きのコンパイル／実行エラー表示
- 3言語対応の切り替え式ロジック解説表示
- サンプルプログラム
- エディター内容と言語設定のブラウザ内保存
- レスポンシブUIとダーク／ライトテーマ
- キーボードショートカット（`Ctrl/Cmd + Enter` で実行）

## 技術構成

- Vue 3 + TypeScript + Vite
- Tailwind CSS
- Rust + wasm-bindgen + WebAssembly（Whitespace）
- Clang WebAssembly + WASI（C）
- Acorn + eslint-scope（JavaScript Lint）
- Web Worker（UIをブロックしない実行とタイムアウト制御）
- Vitest（フロントエンド） / cargo test（Rust）

## アーキテクチャ

```text
src/
├── components/        # 表示に専念するVueコンポーネント
├── composables/       # エディター状態、永続化、実行制御
├── constants/         # 言語情報とサンプルコード
├── types/             # フロントエンド共通型
├── workers/           # C/JSツールチェーンと隔離実行Worker
└── wasm/              # wasm-pack生成物の読み込み境界
crates/compiler/
├── src/c.rs           # 旧Cインタープリターの回帰テスト資産
├── src/whitespace.rs  # Whitespace parser/VM
└── src/lib.rs         # wasm-bindgen公開API
docs/                  # 言語対応状況と設計上の制約
example/               # 言語別の正常・エラーサンプル
public/                # 静的アセット
```

UIは実行エンジンを直接参照せず、型付きメッセージでWorkerと通信します。WorkerがCのコンパイル、WASI実行、JavaScript実行、Rust/WASMの初期化を担当し、メインスレッドはタイムアウト時にWorkerを破棄・再生成します。

## 言語対応範囲

実装状況、受け入れ条件、完全ローカル実行のための制約は[言語対応チェックリスト](docs/language-support-checklist.md)を参照してください。

Cは標準ヘッダーとlibcを含むClang WASM資産を同梱するため、初回の読み込み量が大きくなります。コンパイル後のプログラムはブラウザ内のWASIで動作し、ファイルは実行ごとに破棄されるメモリ内ファイルシステムへ保存されます。

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
- Cは30秒、JavaScriptとWhitespaceは5秒でWorkerごと停止
- Cの標準出力・標準エラーとコンパイラ診断は各100,000バイトで省略
- ユーザーコードをHTMLとして描画しない

## ライセンス

Private / Unlicensed
