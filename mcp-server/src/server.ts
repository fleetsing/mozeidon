import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import {
  zenGetActiveContext,
  zenGetSelectionOrPage,
  zenGetTabContent,
  zenListTabs,
  zenSearchTabs,
  type ZenAiToolDependencies,
} from "./zenAiToolsCore.js";
import {
  zenGetActiveContextSchema,
  zenGetSelectionOrPageSchema,
  zenGetTabContentSchema,
  zenListTabsSchema,
  zenSearchTabsSchema,
} from "./schemas.js";
import { toCallToolResult } from "./toolResult.js";

const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export function createZenMcpServer(dependencies: ZenAiToolDependencies): McpServer {
  const server = new McpServer({ name: "zen-mcp-server", version: "0.1.0" });

  server.registerTool(
    "zen_get_active_context",
    {
      title: "Get Active Zen Context",
      description: "Get the active Zen tab page context using Mozeidon. Use it to summarize or inspect the current page.",
      inputSchema: zenGetActiveContextSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input) => toCallToolResult(await zenGetActiveContext(input, dependencies)),
  );

  server.registerTool(
    "zen_get_selection_or_page",
    {
      title: "Get Zen Selection or Page",
      // Unlike Raycast's own build of this tool, there is no OS-level
      // "read the frontmost app's selection" capability outside Raycast, so
      // this tool only ever resolves Zen's own DOM selection or its active
      // page content (spec 020) - never an unrelated app's selected text.
      description: "Get Zen's own DOM selection if present, otherwise the active Zen page content.",
      inputSchema: zenGetSelectionOrPageSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input) => toCallToolResult(await zenGetSelectionOrPage(input, dependencies)),
  );

  server.registerTool(
    "zen_list_tabs",
    {
      title: "List Zen Tabs",
      description: "List currently open Zen tabs with stable tab and window metadata.",
      inputSchema: zenListTabsSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input) => toCallToolResult(await zenListTabs(input, dependencies)),
  );

  server.registerTool(
    "zen_search_tabs",
    {
      title: "Search Zen Tabs",
      description: "Search currently open Zen tabs by title and URL.",
      inputSchema: zenSearchTabsSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input) => toCallToolResult(await zenSearchTabs(input, dependencies)),
  );

  server.registerTool(
    "zen_get_tab_content",
    {
      title: "Get Zen Tab Content",
      description: "Get content for the active or unambiguously identified Zen tab using the context API.",
      inputSchema: zenGetTabContentSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (input) => toCallToolResult(await zenGetTabContent(input, dependencies)),
  );

  return server;
}
