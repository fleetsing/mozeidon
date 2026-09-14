import assert from "node:assert/strict";
import { test } from "node:test";
import { toCallToolResult } from "../src/toolResult.js";

test("toCallToolResult maps a successful response to content and structuredContent", () => {
  const data = { tabs: [{ id: 1, title: "Example", url: "https://example.com" }] };
  const response = {
    ok: true as const,
    tool: "zen_list_tabs" as const,
    data,
    warnings: [] as string[],
  };

  const result = toCallToolResult(response);

  assert.equal(result.isError, undefined);
  assert.deepEqual(result.structuredContent, data);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.deepEqual(JSON.parse((result.content[0] as { text: string }).text), data);
});

test("toCallToolResult maps a failure response to an isError text result", () => {
  const response = {
    ok: false as const,
    tool: "zen_list_tabs" as const,
    error: { code: "content_unavailable", message: "Active page content is unavailable." },
    warnings: [] as string[],
  };

  const result = toCallToolResult(response);

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent, undefined);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.match((result.content[0] as { text: string }).text, /content_unavailable/);
  assert.match((result.content[0] as { text: string }).text, /Active page content is unavailable\./);
});
