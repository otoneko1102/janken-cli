# Janken CLI

WebSocket を使った対人型じゃんけん CLI です。  
サーバーを立ててクライアント同士でリアルタイムに対戦できます。

## Features

- WebSocket によるリアルタイム対戦
- **Node.js** と **Cloudflare Workers** の両方に対応
- 表示名の設定（`--name` オプションまたは config ファイル）
- テストモード（サーバー不要で CPU と対戦）
- 任意のパスの config ファイルを指定可能

## Requirements

- Node.js v22 以上
- pnpm v9 以上

## Installation

```bash
pnpm install
```

---

# Client

## Quick Start

```bash
pnpm client
```

## Configuration

`config.json` から設定を読み込みます。`config.json.example` をコピーして作成してください。

```bash
cp config.json.example config.json
```

### config.json フィールド一覧

| フィールド | デフォルト | 説明 |
|---|---|---|
| `name` | `"Anonymous"` | 対戦相手に表示されるプレイヤー名 |
| `host` | `ws://localhost:3000` | 接続先サーバーの URL |

### config.json 例

```json
{
  "name": "YourName",
  "host": "ws://127.0.0.1:3000"
}
```

> [!Note]
>   
> ドメインを割り当てている場合はそちらを使用できます。
> ```json
> {
>   "host": "wss://example.com"
> }
> ```

## Options

```
pnpm client [options]
```

| オプション | 説明 | デフォルト |
|---|---|---|
| `--name <name>` | 対戦相手に表示されるプレイヤー名 | config.json の `name` → `"Anonymous"` |
| `--host <url>` | 接続先サーバーの URL | config.json の `host` → `ws://localhost:3000` |
| `--config <path>` | 使用する config ファイルのパス | `config.json` |
| `--test` | テストモード（サーバー不要、CPU と対戦） | — |

### 優先順位

```
--name    >  config.json の name  >  "Anonymous"
--host    >  config.json の host  >  "ws://localhost:3000"
--config  →  指定したパスの JSON を読み込む
```

### 使用例

```bash
# 名前を指定して接続
pnpm client --name Alice

# 接続先を指定
pnpm client --host ws://example.com

# カスタム config ファイルを使用
pnpm client --config ./my-config.json

# サーバー不要のテストモード
pnpm client --test
```

---

# Host (Node.js)

## Quick Start

```bash
pnpm host
```

## Configuration

`config.json` から設定を読み込みます。`config.json.example` をコピーして作成してください。

```bash
cp config.json.example config.json
```

### config.json フィールド一覧

| フィールド | デフォルト | 説明 |
|---|---|---|
| `port` | `3000` | WebSocket サーバーのポート番号 |

### config.json 例

```json
{
  "port": 3000
}
```

## Options

```
pnpm host [options]
```

| オプション | 説明 | デフォルト |
|---|---|---|
| `--port <port>` | リッスンするポート番号 | config.json の `port` → `3000` |
| `--config <path>` | 使用する config ファイルのパス | `config.json` |

### 優先順位

```
--port    >  config.json の port  >  3000
--config  →  指定したパスの JSON を読み込む
```

### 使用例

```bash
# ポートを指定して起動
pnpm host --port 4000

# カスタム config ファイルを使用
pnpm host --config ./my-config.json
```

---

# Host (Cloudflare Workers)

## Quick Start

```bash
# 1. wrangler にログイン（初回のみ）
pnpm wrangler login

# 2. デプロイ
pnpm wrangler:deploy

# 3. クライアントで接続
pnpm client --host wss://janken-cli.<your-subdomain>.workers.dev
```

## Configuration

`wrangler.jsonc` でデプロイ先を設定します。

| フィールド | 説明 |
|---|---|
| `name` | Workers のプロジェクト名（サブドメインになります） |
| `compatibility_date` | Workers の互換性日付 |

### ローカル動作確認

```bash
pnpm dev:cf
```

---

# Development

```bash
# テスト実行
pnpm test

# フォーマット
pnpm format

# フォーマットチェック
pnpm format:check
```

## License

MIT

