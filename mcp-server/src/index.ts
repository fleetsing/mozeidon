#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createZenAiToolDependencies } from "./dependencies.js";
import { createZenMcpServer } from "./server.js";

async function main() {
  const server = createZenMcpServer(createZenAiToolDependencies());
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for the MCP protocol; readiness/errors go to stderr.
  console.error("zen-mcp-server ready (read-only)");
}

main().catch((error) => {
  console.error("zen-mcp-server failed to start:", error);
  process.exit(1);
});
