import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ZenToolResponse } from "./zenAiToolsCore.js";

export function toCallToolResult<T extends object>(response: ZenToolResponse<T>): CallToolResult {
  if (response.ok) {
    return {
      content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
      structuredContent: response.data as Record<string, unknown>,
    };
  }

  const { code, message } = response.error;
  const extraLines = [
    response.warnings.length ? `Warnings: ${response.warnings.join(", ")}` : undefined,
    response.details ? `Details: ${JSON.stringify(response.details)}` : undefined,
  ].filter((line): line is string => Boolean(line));

  return {
    content: [{ type: "text", text: [`Error (${code}): ${message}`, ...extraLines].join("\n") }],
    structuredContent: {
      code,
      message,
      warnings: response.warnings,
      ...(response.details ? { details: response.details } : {}),
    },
    isError: true,
  };
}
