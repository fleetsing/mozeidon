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

test("Smart Summarize prefers active page content over Raycast selected text when Zen selection is unavailable", async () => {
  // While Zen has a usable page open, an unrelated selection in some other
  // app shouldn't pre-empt it — Raycast's selection is a last resort only.
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
      return createActivePageContext("Full page markdown", {
        title: "Active Source",
        url: "https://example.com/active",
      });
    },
  });

  assert.deepEqual(calls, ["zen-selection", "active-page"]);
  assert.deepEqual(context, {
    source: "active-page",
    text: "Full page markdown",
    title: "Active Source",
    url: "https://example.com/active",
  });
});

test("Smart Summarize falls back to Raycast selected text only when Zen selection and active page are both unusable", async () => {
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
      return undefined;
    },
  });

  assert.deepEqual(calls, ["zen-selection", "active-page", "raycast-selection"]);
  assert.deepEqual(context, {
    source: "raycast-selection",
    text: "Raycast selected fallback",
  });
});

test("Smart Summarize does not attach Zen page metadata to Raycast selected text", async () => {
  // getSelectedText() reads whatever is highlighted in the frontmost app,
  // not scoped to Zen, so the Zen page's title/URL must not be attached to
  // text that may have nothing to do with it. Active page is unusable here
  // so the raycast-selection last resort is actually reached.
  const context = await resolveSmartSummarizeContext(
    createDependencies({
      zenSelection: createPermissionUnavailableSelectionContext({
        title: "Zen Source",
        url: "https://example.com/source",
      }),
      raycastSelectedText: "Selected outside DOM grant",
      activePage: undefined,
    }),
  );

  assert.equal(context.source, "raycast-selection");
  assert.equal(context.text, "Selected outside DOM grant");
  assert.equal(context.title, undefined);
  assert.equal(context.url, undefined);
});

test("Smart Summarize fetches active page markdown before falling back to Raycast selected text", async () => {
  const calls: string[] = [];
  const context = await resolveSmartSummarizeContext({
    getZenSelection: async () => {
      calls.push("zen-selection");
      return createPermissionUnavailableSelectionContext({});
    },
    getActivePageMarkdown: async () => {
      calls.push("active-page");
      return undefined;
    },
    getRaycastSelectedText: async () => {
      calls.push("raycast-selection");
      return "Selected outside DOM grant";
    },
  });

  assert.deepEqual(calls, ["zen-selection", "active-page", "raycast-selection"]);
  assert.deepEqual(context, {
    source: "raycast-selection",
    text: "Selected outside DOM grant",
  });
});

test("Smart Summarize falls back to Raycast selected text when Zen selection throws permission unavailable and active page is unusable", async () => {
  const context = await resolveSmartSummarizeContext({
    getZenSelection: async () => {
      throw Object.assign(new Error("Selection permission is unavailable."), {
        code: "permission_unavailable",
      });
    },
    getActivePageMarkdown: async () => undefined,
    getRaycastSelectedText: async () => "Raycast selected fallback",
  });

  assert.deepEqual(context, {
    source: "raycast-selection",
    text: "Raycast selected fallback",
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

test("Smart Summarize uses Raycast selected text when the active page fetch itself fails", async () => {
  // getActivePageMarkdown() can throw (CLI/native-app failure), not just
  // return unusable content. A transient failure there must not block the
  // Raycast-selection last resort when selected text is available.
  const context = await resolveSmartSummarizeContext({
    getZenSelection: async () => createPermissionUnavailableSelectionContext({}),
    getActivePageMarkdown: async () => {
      throw nativeAppIpcError("context active --format markdown");
    },
    getRaycastSelectedText: async () => "Raycast selected fallback",
  });

  assert.deepEqual(context, {
    source: "raycast-selection",
    text: "Raycast selected fallback",
  });
});

test("Smart Summarize rethrows the active page fetch error when no Raycast selection is available either", async () => {
  await assert.rejects(
    () =>
      resolveSmartSummarizeContext({
        getZenSelection: async () => createPermissionUnavailableSelectionContext({}),
        getActivePageMarkdown: async () => {
          throw nativeAppIpcError("context active --format markdown");
        },
        getRaycastSelectedText: async () => undefined,
      }),
    (error: unknown) => error instanceof MozeidonClientError && error.code === "command_failed",
  );
});

test("Smart Summarize rethrows a falsy active page fetch error rather than masking it", async () => {
  // A caught throw value of null/0/""/false must still be treated as a real
  // failure, not silently ignored by a truthiness check.
  await assert.rejects(
    () =>
      resolveSmartSummarizeContext({
        getZenSelection: async () => createPermissionUnavailableSelectionContext({}),
        getActivePageMarkdown: async () => {
          throw null;
        },
        getRaycastSelectedText: async () => undefined,
      }),
    (error: unknown) => error === null,
  );
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
