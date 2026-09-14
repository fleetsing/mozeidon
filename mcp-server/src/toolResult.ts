import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ZenToolResponse } from "./zenAiToolsCore.js";

export function toCallToolResult<T extends object>(response: ZenToolResponse<T>): CallToolResult {
  if (response.ok) {
    return {
      content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
      structuredContent: response.data as Record<string, unknown>,
    };
  }

  return {
    content: [{ type: "text", text: `Error (${response.error.code}): ${response.error.message}` }],
    isError: true,
  };
}
