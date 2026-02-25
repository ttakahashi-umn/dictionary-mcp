#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Dictionary storage
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const DICTIONARY_PATH = resolve(__dirname, "../dictionary.json");

interface Term {
  description: string;
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
  return JSON.parse(raw) as Dictionary;
}

function saveDictionary(dict: Dictionary): void {
  writeFileSync(DICTIONARY_PATH, JSON.stringify(dict, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "dictionary-mcp",
  version: "1.0.0",
});

// ---- lookup_term -----------------------------------------------------------

server.tool(
  "lookup_term",
  "指定した用語の定義をプロジェクト辞書から検索します。",
  {
    term: z.string().describe("検索する用語名"),
  },
  async ({ term }) => {
    const dict = loadDictionary();
    const entry = dict.terms[term];

    if (!entry) {
      // Try case-insensitive match
      const key = Object.keys(dict.terms).find(
        (k) => k.toLowerCase() === term.toLowerCase()
      );
      if (key) {
        const found = dict.terms[key];
        return {
          content: [
            {
              type: "text",
              text: formatTerm(key, found),
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `用語 "${term}" は辞書に登録されていません。`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: formatTerm(term, entry),
        },
      ],
    };
  }
);

// ---- list_terms ------------------------------------------------------------

server.tool(
  "list_terms",
  "辞書に登録されている全用語の一覧を返します。",
  {},
  async () => {
    const dict = loadDictionary();
    const terms = Object.keys(dict.terms);

    if (terms.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "辞書にはまだ用語が登録されていません。",
          },
        ],
      };
    }

    const lines = terms
      .sort()
      .map((term) => `- **${term}**: ${dict.terms[term].description}`);

    return {
      content: [
        {
          type: "text",
          text: `## 登録用語一覧 (${terms.length} 件)\n\n${lines.join("\n")}`,
        },
      ],
    };
  }
);

// ---- add_term --------------------------------------------------------------

server.tool(
  "add_term",
  "新しい用語と定義を辞書に追加します。既に存在する用語の場合はエラーを返します。",
  {
    term: z.string().describe("追加する用語名"),
    description: z.string().describe("用語の説明・定義"),
    aliases: z
      .array(z.string())
      .optional()
      .describe("用語の別名・別表記 (任意)"),
  },
  async ({ term, description, aliases }) => {
    const dict = loadDictionary();

    if (dict.terms[term]) {
      return {
        content: [
          {
            type: "text",
            text: `用語 "${term}" は既に登録されています。更新する場合は update_term を使用してください。`,
          },
        ],
      };
    }

    dict.terms[term] = {
      description,
      ...(aliases && aliases.length > 0 ? { aliases } : {}),
      updatedAt: new Date().toISOString(),
    };

    saveDictionary(dict);

    return {
      content: [
        {
          type: "text",
          text: `用語 "${term}" を辞書に追加しました。\n\n${formatTerm(term, dict.terms[term])}`,
        },
      ],
    };
  }
);

// ---- update_term -----------------------------------------------------------

server.tool(
  "update_term",
  "辞書に登録済みの用語の定義を更新します。",
  {
    term: z.string().describe("更新する用語名"),
    description: z.string().optional().describe("新しい説明・定義 (任意)"),
    aliases: z
      .array(z.string())
      .optional()
      .describe("新しい別名・別表記リスト (任意)"),
  },
  async ({ term, description, aliases }) => {
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

    if (description !== undefined) {
      dict.terms[term].description = description;
    }
    if (aliases !== undefined) {
      if (aliases.length > 0) {
        dict.terms[term].aliases = aliases;
      } else {
        delete dict.terms[term].aliases;
      }
    }
    dict.terms[term].updatedAt = new Date().toISOString();

    saveDictionary(dict);

    return {
      content: [
        {
          type: "text",
          text: `用語 "${term}" を更新しました。\n\n${formatTerm(term, dict.terms[term])}`,
        },
      ],
    };
  }
);

// ---- delete_term -----------------------------------------------------------

server.tool(
  "delete_term",
  "辞書から用語を削除します。",
  {
    term: z.string().describe("削除する用語名"),
  },
  async ({ term }) => {
    const dict = loadDictionary();

    if (!dict.terms[term]) {
      return {
        content: [
          {
            type: "text",
            text: `用語 "${term}" は辞書に登録されていません。`,
          },
        ],
      };
    }

    delete dict.terms[term];
    saveDictionary(dict);

    return {
      content: [
        {
          type: "text",
          text: `用語 "${term}" を辞書から削除しました。`,
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTerm(term: string, entry: Term): string {
  const lines: string[] = [
    `## ${term}`,
    ``,
    `**説明:** ${entry.description}`,
  ];
  if (entry.aliases && entry.aliases.length > 0) {
    lines.push(`**別名:** ${entry.aliases.join(", ")}`);
  }
  lines.push(`**更新日時:** ${entry.updatedAt}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("dictionary-mcp server started");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
