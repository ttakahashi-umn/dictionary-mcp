#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDictionaryServer } from "./server.js";

async function main() {
  const server = createDictionaryServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("dictionary-mcp server started (stdio)");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
