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
  assert.deepEqual(result.structuredContent, { ...data, warnings: [] });
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.deepEqual(JSON.parse((result.content[0] as { text: string }).text), data);
});

test("toCallToolResult preserves warnings on a successful response, in both text and structuredContent", () => {
  const data = { focusChanged: true, focusRestored: false };
  const response = {
    ok: true as const,
    tool: "zen_get_tab_content" as const,
    data,
    warnings: ["focus_restore_failed"],
  };

  const result = toCallToolResult(response);

  assert.equal(result.isError, undefined);
  assert.deepEqual(result.structuredContent, { ...data, warnings: ["focus_restore_failed"] });
  const text = (result.content[0] as { text: string }).text;
  assert.match(text, /focus_restore_failed/);
  assert.deepEqual(JSON.parse(text.split("\n\nWarnings:")[0]), data);
});

test("toCallToolResult maps a failure response to an isError text result and structured error payload", () => {
  const response = {
    ok: false as const,
    tool: "zen_list_tabs" as const,
    error: { code: "content_unavailable", message: "Active page content is unavailable." },
    warnings: [] as string[],
  };

  const result = toCallToolResult(response);

  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent, {
    code: "content_unavailable",
    message: "Active page content is unavailable.",
    warnings: [],
  });
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.match((result.content[0] as { text: string }).text, /content_unavailable/);
  assert.match((result.content[0] as { text: string }).text, /Active page content is unavailable\./);
});

test("toCallToolResult preserves warnings and details on a failure response, in both text and structuredContent", () => {
  const response = {
    ok: false as const,
    tool: "zen_get_tab_content" as const,
    error: { code: "target_tab_mismatch", message: "The extracted content reports a different tab than requested." },
    warnings: ["focus_restore_failed"],
    details: { actualTab: { tabId: 99, windowId: 99 } },
  };

  const result = toCallToolResult(response);

  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent, {
    code: "target_tab_mismatch",
    message: "The extracted content reports a different tab than requested.",
    warnings: ["focus_restore_failed"],
    details: { actualTab: { tabId: 99, windowId: 99 } },
  });
  const text = (result.content[0] as { text: string }).text;
  assert.match(text, /focus_restore_failed/);
  assert.match(text, /"tabId":99/);
});
