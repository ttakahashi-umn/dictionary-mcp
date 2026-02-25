# dictionary-mcp
プロジェクトの中で用語を統一するための辞書MCP

## 概要

`dictionary-mcp` は、プロジェクト固有の用語を管理するための [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) サーバーです。
用語の追加・検索・更新・削除が可能で、プロジェクト内の用語統一を支援します。

## 提供ツール

| ツール名 | 説明 |
|---|---|
| `lookup_term` | 指定した用語の定義を辞書から検索します |
| `list_terms` | 辞書に登録されている全用語の一覧を返します |
| `add_term` | 新しい用語と定義を辞書に追加します |
| `update_term` | 登録済みの用語の定義を更新します |
| `delete_term` | 辞書から用語を削除します |

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

## 辞書データ

用語データは `dictionary.json` に保存されます。このファイルはリポジトリにコミットすることで、チーム全体で辞書を共有できます。
