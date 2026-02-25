import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Dictionary storage
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const DICTIONARY_PATH = resolve(__dirname, "../dictionary.json");

interface ContextDefinition {
  context?: string;
  description: string;
}

interface Term {
  definitions: ContextDefinition[];
  aliases?: string[];
  updatedAt: string;
}

interface Dictionary {
  terms: Record<string, Term>;
}

function loadDictionary(): Dictionary {
  if (!existsSync(DICTIONARY_PATH)) {
    return { terms: {} };
  }
  const raw = readFileSync(DICTIONARY_PATH, "utf-8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return migrateToNewFormat(parsed);
}

function migrateToNewFormat(parsed: Record<string, unknown>): Dictionary {
  const terms = parsed.terms as Record<string, unknown> | undefined;
  if (!terms || typeof terms !== "object") {
    return { terms: {} };
  }
  const result: Dictionary = { terms: {} };
  for (const [key, val] of Object.entries(terms)) {
    if (val === null || typeof val !== "object") {
      result.terms[key] = {
        definitions: [{ description: String(val ?? "") }],
        updatedAt: new Date().toISOString(),
      };
    } else {
      const t = val as Record<string, unknown>;
      if (Array.isArray(t.definitions) && t.definitions.length > 0) {
        result.terms[key] = {
          definitions: t.definitions as ContextDefinition[],
          aliases: Array.isArray(t.aliases) ? (t.aliases as string[]) : undefined,
          updatedAt: typeof t.updatedAt === "string" ? t.updatedAt : new Date().toISOString(),
        };
      } else if (typeof t.description === "string") {
        result.terms[key] = {
          definitions: [{ context: typeof t.context === "string" ? t.context : undefined, description: t.description }],
          aliases: Array.isArray(t.aliases) ? (t.aliases as string[]) : undefined,
          updatedAt: typeof t.updatedAt === "string" ? t.updatedAt : new Date().toISOString(),
        };
      }
    }
  }
  return result;
}

function saveDictionary(dict: Dictionary): void {
  writeFileSync(DICTIONARY_PATH, JSON.stringify(dict, null, 2) + "\n", "utf-8");
}

function findDefinition(entry: Term, context?: string): ContextDefinition | undefined {
  if (context) {
    const match = entry.definitions.find((d) => d.context && d.context === context);
    if (match) return match;
  }
  const defaultDef = entry.definitions.find((d) => !d.context || d.context === "");
  return defaultDef ?? entry.definitions[0];
}

function formatTerm(term: string, entry: Term, def?: ContextDefinition): string {
  const target = def ?? entry.definitions[0];
  const lines: string[] = [`## ${term}`, ``];
  if (target.context) {
    lines.push(`**コンテキスト:** ${target.context}`);
    lines.push(``);
  }
  lines.push(`**説明:** ${target.description}`);
  if (entry.aliases && entry.aliases.length > 0) {
    lines.push(`**別名:** ${entry.aliases.join(", ")}`);
  }
  if (entry.definitions.length > 1) {
    lines.push(`**その他の定義:**`);
    for (const d of entry.definitions) {
      if (d !== target) {
        lines.push(`  - ${d.context ?? "デフォルト"}: ${d.description}`);
      }
    }
  }
  lines.push(`**更新日時:** ${entry.updatedAt}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// MCP server factory
// ---------------------------------------------------------------------------

const SERVER_INSTRUCTIONS = `
このサーバーはプロジェクト用語辞書を管理します。コードやドキュメントの翻訳・執筆時に用語の統一を支援します。
同じ用語でもコンテキスト（分野・文脈）によって異なる訳を使い分けることができます。

## 利用のタイミング
- 日本語↔英語など多言語の翻訳を行うとき
- プロジェクト固有の用語の定義を確認したいとき
- 新しい用語をチームで統一したいとき
- 曖昧な用語の適切な表現を調べたいとき（文脈に応じた訳を検索可能）

## 推奨ワークフロー
1. 翻訳・執筆の前に \`list_terms\` で登録済み用語を確認する
2. 不明な用語があれば \`lookup_term\` で検索する（必要に応じて context を指定）
3. 辞書にない用語は \`add_term\` で登録し、以後はその定義に従う
4. 文脈別の訳を追加する場合は \`update_term\` で context を指定して追加
`;

export function createDictionaryServer(): McpServer {
  const server = new McpServer(
    {
      name: "dictionary-mcp",
      version: "1.0.0",
    },
    { instructions: SERVER_INSTRUCTIONS.trim() }
  );

  server.tool(
    "lookup_term",
    "指定した用語の定義をプロジェクト辞書から検索します。コンテキストを指定すると、その文脈に合った訳を返します。",
    {
      term: z.string().describe("検索する用語名"),
      context: z.string().optional().describe("文脈・分野（例: 行政・ビジネス, プロジェクト・技術）。指定しない場合はデフォルトの定義を返します。"),
    },
    async ({ term, context }) => {
      const dict = loadDictionary();
      let entry = dict.terms[term];
      let matchedKey = term;
      if (!entry) {
        const key = Object.keys(dict.terms).find(
          (k) => k.toLowerCase() === term.toLowerCase()
        );
        if (key) {
          entry = dict.terms[key];
          matchedKey = key;
        }
      }
      if (!entry) {
        return {
          content: [
            { type: "text", text: `用語 "${term}" は辞書に登録されていません。` },
          ],
        };
      }
      const def = findDefinition(entry, context);
      return { content: [{ type: "text", text: formatTerm(matchedKey, entry, def) }] };
    }
  );

  server.tool(
    "list_terms",
    "辞書に登録されている全用語の一覧を返します。コンテキスト別の定義がある用語は、複数の訳を表示します。",
    {},
    async () => {
      const dict = loadDictionary();
      const termKeys = Object.keys(dict.terms);
      if (termKeys.length === 0) {
        return {
          content: [
            { type: "text", text: "辞書にはまだ用語が登録されていません。" },
          ],
        };
      }
      const lines = termKeys.sort().flatMap((term) => {
        const entry = dict.terms[term];
        if (entry.definitions.length === 1) {
          return [`- **${term}**: ${entry.definitions[0].description}`];
        }
        return entry.definitions.map((d) => {
          const ctx = d.context ? ` [${d.context}]` : "";
          return `- **${term}**${ctx}: ${d.description}`;
        });
      });
      return {
        content: [
          {
            type: "text",
            text: `## 登録用語一覧 (${termKeys.length} 件)\n\n${lines.join("\n")}`,
          },
        ],
      };
    }
  );

  server.tool(
    "add_term",
    "新しい用語と定義を辞書に追加します。既に存在する用語の場合はエラーを返します。",
    {
      term: z.string().describe("追加する用語名"),
      description: z.string().describe("用語の説明・定義"),
      context: z.string().optional().describe("文脈・分野（例: 行政・ビジネス）。省略時はデフォルト定義として登録されます。"),
      aliases: z.array(z.string()).optional().describe("用語の別名・別表記 (任意)"),
    },
    async ({ term, description, context, aliases }) => {
      const dict = loadDictionary();
      if (dict.terms[term]) {
        return {
          content: [
            {
              type: "text",
              text: `用語 "${term}" は既に登録されています。文脈別の訳を追加する場合は update_term を使用してください。`,
            },
          ],
        };
      }
      dict.terms[term] = {
        definitions: [{ ...(context ? { context } : {}), description }],
        ...(aliases && aliases.length > 0 ? { aliases } : {}),
        updatedAt: new Date().toISOString(),
      };
      saveDictionary(dict);
      const def = findDefinition(dict.terms[term], context);
      return {
        content: [
          {
            type: "text",
            text: `用語 "${term}" を辞書に追加しました。\n\n${formatTerm(term, dict.terms[term], def)}`,
          },
        ],
      };
    }
  );

  server.tool(
    "update_term",
    "辞書に登録済みの用語の定義を更新します。context を指定すると、その文脈用の定義を追加・更新します。",
    {
      term: z.string().describe("更新する用語名"),
      description: z.string().optional().describe("新しい説明・定義 (任意)"),
      context: z.string().optional().describe("文脈・分野。指定するとそのコンテキストの定義を追加/更新します。省略時はデフォルト定義を更新します。"),
      aliases: z.array(z.string()).optional().describe("新しい別名・別表記リスト (任意)"),
    },
    async ({ term, description, context, aliases }) => {
      const dict = loadDictionary();
      if (!dict.terms[term]) {
        return {
          content: [
            {
              type: "text",
              text: `用語 "${term}" は辞書に登録されていません。追加する場合は add_term を使用してください。`,
            },
          ],
        };
      }
      const entry = dict.terms[term];
      if (description !== undefined) {
        const idx = entry.definitions.findIndex(
          (d) => (d.context ?? "") === (context ?? "")
        );
        if (idx >= 0) {
          entry.definitions[idx].description = description;
        } else {
          entry.definitions.push({ ...(context ? { context } : {}), description });
        }
      }
      if (aliases !== undefined) {
        if (aliases.length > 0) {
          entry.aliases = aliases;
        } else {
          delete entry.aliases;
        }
      }
      entry.updatedAt = new Date().toISOString();
      saveDictionary(dict);
      const def = findDefinition(entry, context);
      return {
        content: [
          {
            type: "text",
            text: `用語 "${term}" を更新しました。\n\n${formatTerm(term, entry, def)}`,
          },
        ],
      };
    }
  );

  server.tool(
    "delete_term",
    "辞書から用語を削除します。",
    { term: z.string().describe("削除する用語名") },
    async ({ term }) => {
      const dict = loadDictionary();
      if (!dict.terms[term]) {
        return {
          content: [
            { type: "text", text: `用語 "${term}" は辞書に登録されていません。` },
          ],
        };
      }
      delete dict.terms[term];
      saveDictionary(dict);
      return {
        content: [{ type: "text", text: `用語 "${term}" を辞書から削除しました。` }],
      };
    }
  );

  return server;
}
