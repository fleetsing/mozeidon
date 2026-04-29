import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getSmartSummarizeTitle,
  resolveSmartSummarizeContext,
  summarizeSmartContext,
  type SmartSummarizeDependencies,
  type ZenContext,
} from "../src/smartSummarize";
import { RaycastAiUnavailableError } from "../src/raycastAiCore";
import { MozeidonClientError } from "../src/mozeidonClient";

test("Smart Summarize uses Zen DOM selection when available", async () => {
  const context = await resolveSmartSummarizeContext(
    createDependencies({
      zenSelection: createZenSelectionContext({
        text: "Selected Zen DOM text",
        title: "Zen Article",
        url: "https://example.com/article",
      }),
      raycastSelectedText: "Raycast selected text",
      activePage: createActivePageContext("Full page markdown"),
    }),
  );

  assert.deepEqual(context, {
    source: "zen-selection",
    text: "Selected Zen DOM text",
    title: "Zen Article",
    url: "https://example.com/article",
  });
});

test("Smart Summarize uses Zen user-selection payloads from the add-on", async () => {
  const context = await resolveSmartSummarizeContext(
    createDependencies({
      zenSelection: {
        ok: true,
        status: "ok",
        page: {
          title: "Mean",
          url: "https://en.wikipedia.org/wiki/Mean",
        },
        content: {
          selection: {
            text: "Triangular sets selected text",
            source: "user-selection",
          },
        },
        extraction: {
          contentSource: "selection",
          domRead: true,
          warnings: [],
        },
      },
      raycastSelectedText: undefined,
      activePage: createActivePageContext("Full page markdown"),
    }),
  );

  assert.deepEqual(context, {
    source: "zen-selection",
    text: "Triangular sets selected text",
    title: "Mean",
    url: "https://en.wikipedia.org/wiki/Mean",
  });
});

test("Smart Summarize falls back to Raycast selected text when Zen selection is permission-unavailable", async () => {
  const calls: string[] = [];
  const context = await resolveSmartSummarizeContext({
    getZenSelection: async () => {
      calls.push("zen-selection");
      return createPermissionUnavailableSelectionContext({
        title: "Permissioned Article",
        url: "https://example.com/permissioned",
      });
    },
    getRaycastSelectedText: async () => {
      calls.push("raycast-selection");
      return "Raycast selected fallback";
    },
    getActivePageMarkdown: async () => {
      calls.push("active-page");
      return createActivePageContext("Full page markdown");
    },
  });

  assert.deepEqual(calls, ["zen-selection", "raycast-selection"]);
  assert.deepEqual(context, {
    source: "raycast-selection",
    text: "Raycast selected fallback",
    title: "Permissioned Article",
    url: "https://example.com/permissioned",
  });
});

test("Smart Summarize attaches Zen title and URL metadata to Raycast selected text when available", async () => {
  const context = await resolveSmartSummarizeContext(
    createDependencies({
      zenSelection: createPermissionUnavailableSelectionContext({
        title: "Zen Source",
        url: "https://example.com/source",
      }),
      raycastSelectedText: "Selected outside DOM grant",
      activePage: createActivePageContext("Full page markdown"),
    }),
  );

  assert.equal(context.source, "raycast-selection");
  assert.equal(context.text, "Selected outside DOM grant");
  assert.equal(context.title, "Zen Source");
  assert.equal(context.url, "https://example.com/source");
});

test("Smart Summarize attaches active page metadata to Raycast selected text when Zen metadata is missing", async () => {
  const calls: string[] = [];
  const context = await resolveSmartSummarizeContext({
    getZenSelection: async () => {
      calls.push("zen-selection");
      return createPermissionUnavailableSelectionContext({});
    },
    getRaycastSelectedText: async () => {
      calls.push("raycast-selection");
      return "Selected outside DOM grant";
    },
    getActivePageMarkdown: async () => {
      calls.push("active-page");
      return createActivePageContext("Full page markdown", {
        title: "Active Source",
        url: "https://example.com/active",
      });
    },
  });

  assert.deepEqual(calls, ["zen-selection", "raycast-selection", "active-page"]);
  assert.deepEqual(context, {
    source: "raycast-selection",
    text: "Selected outside DOM grant",
    title: "Active Source",
    url: "https://example.com/active",
  });
});

test("Smart Summarize falls back to Raycast selected text when Zen selection throws permission unavailable", async () => {
  const context = await resolveSmartSummarizeContext({
    getZenSelection: async () => {
      throw Object.assign(new Error("Selection permission is unavailable."), {
        code: "permission_unavailable",
      });
    },
    getRaycastSelectedText: async () => "Raycast selected fallback",
    getActivePageMarkdown: async () =>
      createActivePageContext("Full page markdown", {
        title: "Active Source",
        url: "https://example.com/active",
      }),
  });

  assert.deepEqual(context, {
    source: "raycast-selection",
    text: "Raycast selected fallback",
    title: "Active Source",
    url: "https://example.com/active",
  });
});

test("Smart Summarize falls back to active page markdown when no selected text exists", async () => {
  const context = await resolveSmartSummarizeContext(
    createDependencies({
      zenSelection: createZenSelectionContext({ text: "" }),
      raycastSelectedText: "  ",
      activePage: createActivePageContext("## Page\n\nReadable page markdown", {
        title: "Full Page",
        url: "https://example.com/full",
      }),
    }),
  );

  assert.deepEqual(context, {
    source: "active-page",
    text: "## Page\n\nReadable page markdown",
    title: "Full Page",
    url: "https://example.com/full",
  });
});

test("Smart Summarize accepts structured active page Markdown values", async () => {
  const context = await resolveSmartSummarizeContext(
    createDependencies({
      zenSelection: createZenSelectionContext({ text: "" }),
      raycastSelectedText: undefined,
      activePage: {
        ok: true,
        status: "ok",
        page: {
          title: "Structured Page",
          url: "https://example.com/structured",
        },
        content: {
          markdown: {
            value: "## Structured\n\nReadable page markdown",
            length: 36,
            truncated: false,
          },
        },
        extraction: {
          contentSource: "document",
          warnings: [],
        },
      },
    }),
  );

  assert.deepEqual(context, {
    source: "active-page",
    text: "## Structured\n\nReadable page markdown",
    title: "Structured Page",
    url: "https://example.com/structured",
  });
});

test("Smart Summarize refuses to summarize title and URL only fallback as page content", async () => {
  await assert.rejects(
    () =>
      resolveSmartSummarizeContext(
        createDependencies({
          zenSelection: createZenSelectionContext({ text: "" }),
          raycastSelectedText: undefined,
          activePage: {
            ok: true,
            status: "partial",
            page: {
              title: "Metadata Only",
              url: "https://example.com/metadata",
            },
            content: {
              markdown: "# Metadata Only\n\nSource: https://example.com/metadata",
              isMetadataOnly: true,
            },
          },
        }),
      ),
    {
      name: "SmartSummarizeError",
      code: "content_unavailable",
    },
  );
});

test("Smart Summarize handles AI unavailable gracefully", async () => {
  const result = await summarizeSmartContext({
    ...createDependencies({
      zenSelection: createZenSelectionContext({ text: "Selected Zen DOM text" }),
      raycastSelectedText: undefined,
      activePage: createActivePageContext("Full page markdown"),
    }),
    canAccessAi: () => false,
    askAi: async () => {
      throw new Error("AI should not be called");
    },
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "ai_unavailable",
      message: "Raycast AI is unavailable for this account or environment.",
    },
  });
});

test("Smart Summarize handles AI.ask unavailable errors gracefully", async () => {
  const result = await summarizeSmartContext({
    ...createDependencies({
      zenSelection: createZenSelectionContext({ text: "Selected Zen DOM text" }),
      raycastSelectedText: undefined,
      activePage: createActivePageContext("Full page markdown"),
    }),
    canAccessAi: () => true,
    askAi: async () => {
      throw new RaycastAiUnavailableError();
    },
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "ai_unavailable",
      message: "Raycast AI is unavailable for this account or environment.",
    },
  });
});

test("Smart Summarize reports unsupported context CLI clearly", async () => {
  const result = await summarizeSmartContext({
    getZenSelection: async () => {
      throw oldCliContextError("context selection");
    },
    getRaycastSelectedText: async () => undefined,
    getActivePageMarkdown: async () => createActivePageContext("Full page markdown"),
    canAccessAi: () => true,
    askAi: async () => "Summary",
  });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "context_command_unavailable",
      message:
        "The configured Mozeidon CLI does not support Zen Context commands. Build or install this fork's current Mozeidon CLI, then update the Raycast extension's Mozeidon CLI filepath setting if needed.",
    },
  });
});

test("Smart Summarize reports native app IPC failures clearly", async () => {
  const result = await summarizeSmartContext({
    getZenSelection: async () => {
      throw nativeAppIpcError("context selection");
    },
    getRaycastSelectedText: async () => undefined,
    getActivePageMarkdown: async () => createActivePageContext("Full page markdown"),
    canAccessAi: () => true,
    askAi: async () => "Summary",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "mozeidon_unavailable");
    assert.match(result.error.message, /could not reach Zen through the native app/);
    assert.match(result.error.message, /Cannot read via ipc/);
  }
});

test("Smart Summarize result titles distinguish context source", () => {
  assert.equal(getSmartSummarizeTitle("zen-selection"), "Zen Selection Summary");
  assert.equal(getSmartSummarizeTitle("raycast-selection"), "Raycast Selection Summary");
  assert.equal(getSmartSummarizeTitle("active-page"), "Current Page Summary");
});

function createDependencies(options: {
  zenSelection: ZenContext | undefined;
  raycastSelectedText: string | undefined;
  activePage: ZenContext | undefined;
}): SmartSummarizeDependencies {
  return {
    getZenSelection: async () => options.zenSelection,
    getRaycastSelectedText: async () => options.raycastSelectedText,
    getActivePageMarkdown: async () => options.activePage,
  };
}

function createZenSelectionContext(options: { text: string; title?: string; url?: string }): ZenContext {
  return {
    ok: true,
    status: options.text.trim() ? "ok" : "empty",
    page: {
      title: options.title,
      url: options.url,
    },
    content: {
      selection: {
        text: options.text,
        source: "dom",
        isDomSelection: true,
      },
    },
  };
}

function createPermissionUnavailableSelectionContext(options: { title?: string; url?: string }): ZenContext {
  return {
    ok: false,
    status: "error",
    error: {
      code: "permission_unavailable",
      message: "Selection permission is unavailable.",
    },
    page: {
      title: options.title,
      url: options.url,
    },
  };
}

function createActivePageContext(markdown: string, options?: { title?: string; url?: string }): ZenContext {
  return {
    ok: true,
    status: "ok",
    page: {
      title: options?.title,
      url: options?.url,
    },
    content: {
      markdown,
    },
  };
}

function oldCliContextError(context: string): MozeidonClientError {
  return new MozeidonClientError(
    "command_failed",
    `Failed to run mozeidon command: ${context}\nError: unknown command "context" for "mozeidon"`,
    context,
    undefined,
    'Error: unknown command "context" for "mozeidon"',
  );
}

function nativeAppIpcError(context: string): MozeidonClientError {
  return new MozeidonClientError(
    "command_failed",
    `Failed to run mozeidon command: ${context}\n{"error": "[Error] Cannot read via ipc with host: mozeidon_native_app_51575_396a84a9"}`,
    context,
    undefined,
    '{"error": "[Error] Cannot read via ipc with host: mozeidon_native_app_51575_396a84a9"}',
  );
}
