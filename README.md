# dictionary-mcp
プロジェクトの中で用語を統一するための辞書MCP

## 概要

`dictionary-mcp` は、プロジェクト固有の用語を管理するための [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) サーバーです。
用語の追加・検索・更新・削除が可能で、**同じ用語でもコンテキスト（文脈・分野）によって異なる訳を使い分け**できます。

## 提供ツール

| ツール名 | 説明 |
|---|---|
| `lookup_term` | 用語の定義を検索。`context` を指定するとその文脈に合った訳を返します |
| `list_terms` | 登録済み用語の一覧を返します（コンテキスト別の訳も表示） |
| `add_term` | 新しい用語を追加。`context` で文脈を指定可能 |
| `update_term` | 定義を更新。`context` を指定すると文脈別の定義を追加・更新 |
| `delete_term` | 辞書から用語を削除します |

### コンテキスト（instructions）

MCP の `instructions` により、AI クライアント（Claude など）に辞書の使い方を案内しています。翻訳・執筆のタイミングや推奨ワークフローを伝えることで、適切な場面でツールが利用されるようになります。

## セットアップ

### 前提条件

- Node.js 18 以上
- pnpm

### インストール

```bash
pnpm install
pnpm build
```

### 開発用起動

```bash
pnpm dev
```

## MCP クライアントへの設定

### 方式1: stdio（ローカル）

Claude Desktop などの MCP クライアントに以下の設定を追加してください。

```json
{
  "mcpServers": {
    "dictionary-mcp": {
      "command": "node",
      "args": ["/path/to/dictionary-mcp/dist/index.js"]
    }
  }
}
```

### 方式2: SSE（HTTP / リモート公開）

SSE で HTTP サーバーとして起動し、URL 経由で MCP に接続できます。

**起動:**
```bash
pnpm build
pnpm start:sse
# デフォルトで http://localhost:3030/mcp で待ち受け
# ポートは環境変数 PORT で変更可能（例: PORT=8080 pnpm start:sse）
```

**クライアント設定例（mcp-proxy 経由）:**

Claude Desktop など stdio のみサポートするクライアントは、[mcp-proxy](https://github.com/modelcontextprotocol/mcp-proxy) を使ってリモート SSE サーバーに接続できます。

```json
{
  "mcpServers": {
    "dictionary-mcp": {
      "command": "npx",
      "args": [
        "mcp-proxy",
        "--transport",
        "streamablehttp",
        "http://localhost:3030/mcp"
      ]
    }
  }
}
```

**Claude Code の場合:** Streamable HTTP との互換性問題があるため、`type: "sse"` を指定してください。

```json
{
  "mcpServers": {
    "dictionary-mcp": {
      "type": "sse",
      "url": "http://localhost:3030/mcp"
    }
  }
}
```

URL ベースの MCP を直接サポートするクライアント（Cursor など）では、`http://localhost:3030/mcp` をそのまま指定できる場合があります。

## 辞書データ

用語データは `dictionary.json` に保存されます。このファイルはリポジトリにコミットすることで、チーム全体で辞書を共有できます。

### dictionary.json のフォーマット

```json
{
  "terms": {
    "用語名": {
      "definitions": [
        { "description": "デフォルトの訳" },
        { "context": "文脈名", "description": "その文脈での訳" }
      ],
      "aliases": ["別名1", "別名2"],
      "updatedAt": "2025-02-25T12:00:00.000Z"
    }
  }
}
```

| フィールド | 必須 | 説明 |
|-----------|------|------|
| `terms` | ○ | 用語名をキーとするオブジェクト |
| `terms[用語名].definitions` | ○ | 定義の配列。コンテキスト別に複数持てる |
| `terms[用語名].definitions[].description` | ○ | 訳・定義 |
| `terms[用語名].definitions[].context` | - | 文脈・分野（例: 行政・ビジネス、プロジェクト・技術） |
| `terms[用語名].aliases` | - | 別名・別表記の配列 |
| `terms[用語名].updatedAt` | ○ | 更新日時（ISO 8601 形式） |

`context` を持たない定義がデフォルトとして扱われます。`lookup_term` で `context` を指定した場合、一致するコンテキストの定義を返し、なければデフォルトを返します。

**例（コンテキスト別の訳）:**

```json
{
  "terms": {
    "実施": {
      "definitions": [
        { "description": "administration" },
        { "context": "プロジェクト・技術", "description": "implementation" }
      ],
      "updatedAt": "2025-02-25T12:00:00.000Z"
    },
    "帳票": {
      "definitions": [{ "description": "report" }],
      "aliases": ["レポート", "一覧表"],
      "updatedAt": "2025-02-25T11:00:00.000Z"
    }
  }
}
```

`add_term` や `update_term` ツールで用語を追加・更新すると、`updatedAt` は自動で設定されます。旧フォーマット（`description` 単体）で書かれた辞書も読み込み時に自動で新フォーマットへ変換されます。
