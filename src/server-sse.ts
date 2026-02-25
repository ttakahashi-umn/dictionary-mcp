#!/usr/bin/env node
import { createServer } from "node:http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createDictionaryServer } from "./server.js";

const PORT = parseInt(process.env.PORT ?? "3030", 10);
const MCP_PATH = "/mcp";

const sessions = new Map<
  string,
  { transport: SSEServerTransport; server: ReturnType<typeof createDictionaryServer> }
>();

async function main() {
  const httpServer = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const path = req.url?.split("?")[0];
    if (path !== MCP_PATH) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not Found");
      return;
    }

    try {
      if (req.method === "GET") {
        const server = createDictionaryServer();
        const transport = new SSEServerTransport(MCP_PATH, res);
        transport.onerror = (err) => {
          console.error("[dictionary-mcp] Transport error:", err);
        };
        transport.onclose = () => {
          sessions.delete(transport.sessionId);
        };
        await server.connect(transport);
        sessions.set(transport.sessionId, { transport, server });
      } else if (req.method === "POST") {
        const url = new URL(req.url ?? "", `http://${req.headers.host}`);
        const sessionId = url.searchParams.get("sessionId");
        const session = sessionId ? sessions.get(sessionId) : undefined;
        if (!session) {
          res.writeHead(404, { "Content-Type": "text/plain" }).end("Session not found");
          return;
        }
        await session.transport.handlePostMessage(req, res);
      } else {
        res.writeHead(405, { "Content-Type": "text/plain" }).end("Method Not Allowed");
      }
    } catch (err) {
      console.error("[dictionary-mcp] Request error:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(String(err));
      }
    }
  });

  httpServer.listen(PORT, () => {
    console.error(`dictionary-mcp server started (SSE) http://localhost:${PORT}${MCP_PATH}`);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
