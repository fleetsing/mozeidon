import assert from "node:assert/strict";
import { test } from "node:test";
import manifest from "../package.json";
import type { MozeidonTab } from "../src/interfaces";
import {
  ZEN_AI_TOOL_DEFINITIONS,
  ZEN_AI_TOOL_NAMES,
  zenGetActiveContext,
  zenGetSelectionOrPage,
  zenGetTabContent,
  zenListTabs,
  zenOpenOrFocusUrl,
  zenSearchTabs,
  type ZenAiToolDependencies,
} from "../src/zenAiToolsCore";
import type { RaycastZenContext } from "../src/zenContext";
import { MozeidonClientError } from "../src/mozeidonClient";

test("manifest exposes the approved AI tools and Zen Context commands", () => {
  assertRaycastApiSupportsTools(manifest.dependencies["@raycast/api"]);
  assert.equal(manifest.name, "zen");
  assert.equal(manifest.title, "Zen Context");

  assert.deepEqual(
    (manifest.tools ?? []).map((tool) => tool.name),
    [...ZEN_AI_TOOL_NAMES],
  );
  assert.deepEqual(
    manifest.commands.map((command) => command.name),
    [
      "mozeidon",
      "history",
      "copy-current-page-as-markdown",
      "summarize-current-page",
      "ask-current-page",
      "smart-summarize",
    ],
  );
});

function assertRaycastApiSupportsTools(versionRange: string): void {
  const version = versionRange.replace(/^[^\d]*/, "");
  const [major = 0, minor = 0] = version.split(".").map((part) => Number.parseInt(part, 10));

  assert.equal(
    major > 1 || (major === 1 && minor >= 93),
    true,
    "@raycast/api must be 1.93.0 or newer because Raycast AI Extension tools were introduced in 1.93.0.",
  );
}

test("AI tool definitions have clear names, descriptions, and small schemas", () => {
  assert.deepEqual(
    ZEN_AI_TOOL_DEFINITIONS.map((tool) => tool.name),
    [...ZEN_AI_TOOL_NAMES],
  );

  for (const tool of ZEN_AI_TOOL_DEFINITIONS) {
    const manifestTool = manifest.tools.find((candidate) => candidate.name === tool.name);
    assert.equal(manifestTool?.title, tool.title);
    assert.equal(manifestTool?.description, tool.description);
    assert.equal(tool.name.startsWith("zen_"), true);
    assert.equal(tool.description.length > 20, true);
    assert.equal(Object.keys(tool.inputSchema).length <= 5, true);
  }
});

test("manifest evals cover representative @zen prompts", () => {
  const evalInputs = manifest.ai.evals.map((evaluation) => evaluation.input);

  assert.deepEqual(evalInputs, [
    "@zen summarize the active tab",
    "@zen explain the selected text",
    "@zen find my GitHub PR tab",
    "@zen list open tabs",
    "@zen open https://example.com",
  ]);

  for (const evaluation of manifest.ai.evals) {
    for (const expected of evaluation.expected) {
      const toolName = expected.callsTool;
      const mocks = evaluation.mocks as Record<string, unknown> | undefined;
      assert.ok(mocks?.[toolName], `expected eval for ${toolName} to mock the called tool`);
    }
  }
});

test("zen_get_active_context returns structured Markdown context", async () => {
  const result = await zenGetActiveContext(
    { format: "markdown" },
    createDependencies({
      contexts: {
        markdown: context({ title: "Example", url: "https://example.com", markdown: "Page markdown" }),
      },
    }),
  );

  assert.deepEqual(result, {
    ok: true,
    tool: "zen_get_active_context",
    data: {
      source: { title: "Example", url: "https://example.com" },
      format: "markdown",
      markdown: "Page markdown",
      text: undefined,
      context: undefined,
    },
    warnings: [],
  });
});

test("zen_get_active_context refuses metadata-only fallback when content is required", async () => {
  const result = await zenGetActiveContext(
    { requireContent: true },
    createDependencies({
      contexts: {
        markdown: context({
          title: "Metadata",
          url: "https://example.com",
          markdown: "# Metadata",
          isMetadataOnly: true,
        }),
      },
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "content_unavailable");
});

test("zen_get_active_context refuses JSON metadata-only fallback when content is required", async () => {
  const result = await zenGetActiveContext(
    { format: "json", requireContent: true },
    createDependencies({
      contexts: {
        json: context({
          title: "Metadata",
          url: "https://example.com",
        }),
      },
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "content_unavailable");
});

test("zen_get_active_context reports unsupported context CLI clearly", async () => {
  const result = await zenGetActiveContext(
    {},
    createDependencies({
      getContextError: oldCliContextError("context active --format markdown"),
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "context_command_unavailable");
    assert.match(result.error.message, /does not support Zen Context commands/);
  }
});

test("zen_get_active_context reports native app IPC failures clearly", async () => {
  const result = await zenGetActiveContext(
    {},
    createDependencies({
      getContextError: nativeAppIpcError("context active --format markdown"),
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "mozeidon_unavailable");
    assert.match(result.error.message, /could not reach Zen through the native app/);
    assert.match(result.error.message, /Cannot read via ipc/);
  }
});

test("zen_get_selection_or_page prefers Zen DOM selection", async () => {
  const result = await zenGetSelectionOrPage(
    {},
    createDependencies({
      zenSelection: context({
        title: "Article",
        url: "https://example.com/article",
        selectionText: "Zen selected text",
        isDomSelection: true,
      }),
      raycastSelectedText: "Raycast selected text",
    }),
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.kind, "zen-selection");
    assert.equal(result.data.text, "Zen selected text");
  }
});

test("zen_get_selection_or_page falls back to Raycast selection when Zen selection throws permission unavailable", async () => {
  const result = await zenGetSelectionOrPage(
    {},
    createDependencies({
      getZenSelectionError: Object.assign(new Error("Selection permission is unavailable."), {
        code: "permission_unavailable",
      }),
      raycastSelectedText: "Raycast selected text",
      contexts: {
        markdown: context({
          title: "Active Article",
          url: "https://example.com/active",
          markdown: "Active page markdown",
        }),
      },
    }),
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.kind, "raycast-selection");
    assert.equal(result.data.text, "Raycast selected text");
    assert.deepEqual(result.data.source, {
      title: "Active Article",
      url: "https://example.com/active",
    });
  }
});

test("zen_get_selection_or_page falls back to Raycast selection with Zen metadata", async () => {
  const result = await zenGetSelectionOrPage(
    {},
    createDependencies({
      zenSelection: context({
        title: "Article",
        url: "https://example.com/article",
      }),
      raycastSelectedText: "Raycast selected text",
    }),
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.kind, "raycast-selection");
    assert.equal(result.data.text, "Raycast selected text");
    assert.deepEqual(result.data.source, {
      title: "Article",
      url: "https://example.com/article",
    });
  }
});

test("zen_get_selection_or_page attaches active page metadata to Raycast selection when Zen metadata is missing", async () => {
  const result = await zenGetSelectionOrPage(
    {},
    createDependencies({
      zenSelection: context({}),
      raycastSelectedText: "Raycast selected text",
      contexts: {
        markdown: context({
          title: "Active Article",
          url: "https://example.com/active",
          markdown: "Active page markdown",
        }),
      },
    }),
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.kind, "raycast-selection");
    assert.deepEqual(result.data.source, {
      title: "Active Article",
      url: "https://example.com/active",
    });
  }
});

test("zen_get_selection_or_page falls back to active page content when no selection exists", async () => {
  const result = await zenGetSelectionOrPage(
    {},
    createDependencies({
      zenSelection: context({}),
      contexts: {
        markdown: context({ title: "Page", url: "https://example.com/page", markdown: "Page markdown" }),
      },
    }),
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.kind, "active-page");
    assert.equal(result.data.markdown, "Page markdown");
  }
});

test("zen_list_tabs returns focused and active tabs first with a limit", async () => {
  const result = await zenListTabs({ limit: 1 }, createDependencies({ tabs: sampleTabs() }));

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.tabs.length, 1);
    assert.equal(result.data.tabs[0].title, "Active Docs");
    assert.equal(result.data.tabs[0].windowFocused, true);
  }
});

test("zen_search_tabs deterministically matches title and URL", async () => {
  const result = await zenSearchTabs({ query: "oauth docs" }, createDependencies({ tabs: sampleTabs() }));

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.matches[0].title, "Active Docs");
    assert.equal(result.data.matches[0].reason, "Matched oauth, docs");
  }
});

test("zen_search_tabs returns a structured error when query input is missing", async () => {
  const result = await zenSearchTabs(
    undefined as unknown as Parameters<typeof zenSearchTabs>[0],
    createDependencies({}),
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "invalid_input");
});

test("zen_get_tab_content switches to an unambiguous tab before reading context", async () => {
  const switched: string[] = [];
  const result = await zenGetTabContent(
    { tabId: 2, windowId: 20 },
    createDependencies({
      tabs: sampleTabs(),
      contexts: {
        markdown: context({ title: "GitHub PR", url: "https://github.com/example/pull/1", markdown: "PR markdown" }),
      },
      switchTab: (windowId, tabId) => switched.push(`${windowId}:${tabId}`),
    }),
  );

  assert.deepEqual(switched, ["20:2"]);
  assert.equal(result.ok, true);
});

test("zen_get_tab_content does not refocus a tab that is already active in the focused window", async () => {
  const switched: string[] = [];
  const result = await zenGetTabContent(
    { tabId: 1, windowId: 10 },
    createDependencies({
      tabs: sampleTabs(),
      contexts: {
        markdown: context({ title: "Active Docs", url: "https://docs.example.com/oauth", markdown: "Docs markdown" }),
      },
      switchTab: (windowId, tabId) => switched.push(`${windowId}:${tabId}`),
    }),
  );

  assert.deepEqual(switched, []);
  assert.equal(result.ok, true);
});

test("zen_get_tab_content rejects ambiguous URL targets", async () => {
  const result = await zenGetTabContent(
    { url: "https://github.com/example/pull/1" },
    createDependencies({
      tabs: [
        ...sampleTabs(),
        tab({ id: 3, windowId: 30, title: "Duplicate PR", url: "https://github.com/example/pull/1" }),
      ],
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "ambiguous_tab");
});

test("zen_open_or_focus_url rejects non-http URL schemes", async () => {
  const result = await zenOpenOrFocusUrl({ url: "file:///etc/passwd" }, createDependencies({}));

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "invalid_url");
});

test("zen_open_or_focus_url returns a structured error when URL input is missing", async () => {
  const result = await zenOpenOrFocusUrl(
    undefined as unknown as Parameters<typeof zenOpenOrFocusUrl>[0],
    createDependencies({}),
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "invalid_url");
});

test("zen_open_or_focus_url focuses matching open URL before opening a new tab", async () => {
  const calls: string[] = [];
  const result = await zenOpenOrFocusUrl(
    { url: "https://github.com/example/pull/1" },
    createDependencies({
      tabs: sampleTabs(),
      switchTab: (windowId, tabId) => calls.push(`switch:${windowId}:${tabId}`),
      openUrl: (url) => calls.push(`open:${url}`),
    }),
  );

  assert.deepEqual(calls, ["switch:20:2"]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.action, "focused-existing");
});

test("zen_open_or_focus_url opens a new tab when no matching URL is open", async () => {
  const calls: string[] = [];
  const result = await zenOpenOrFocusUrl(
    { url: "https://example.org/new" },
    createDependencies({
      tabs: sampleTabs(),
      switchTab: (windowId, tabId) => calls.push(`switch:${windowId}:${tabId}`),
      openUrl: (url) => calls.push(`open:${url}`),
    }),
  );

  assert.deepEqual(calls, ["open:https://example.org/new"]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.action, "opened-new");
});

function createDependencies(options: {
  contexts?: Partial<Record<"markdown" | "text" | "json", RaycastZenContext>>;
  getContextError?: Error;
  zenSelection?: RaycastZenContext;
  getZenSelectionError?: Error & { code?: string };
  raycastSelectedText?: string;
  tabs?: MozeidonTab[];
  switchTab?: (windowId: number, tabId: number) => void;
  openUrl?: (url: string) => void;
}): ZenAiToolDependencies {
  return {
    getContext: async (format) => {
      if (options.getContextError) throw options.getContextError;
      return options.contexts?.[format] ?? context({ markdown: "Default markdown" });
    },
    getZenSelection: async () => {
      if (options.getZenSelectionError) throw options.getZenSelectionError;
      return options.zenSelection ?? context({});
    },
    getRaycastSelectedText: async () => options.raycastSelectedText,
    listTabs: async () => ({
      data: options.tabs ?? [],
      windows: [
        {
          id: 10,
          isLastFocused: true,
        },
      ],
    }),
    switchTab: options.switchTab ?? (() => undefined),
    openUrl: options.openUrl ?? (() => undefined),
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

function context(options: {
  title?: string;
  url?: string;
  markdown?: string;
  text?: string;
  selectionText?: string;
  isDomSelection?: boolean;
  isMetadataOnly?: boolean;
}): RaycastZenContext {
  return {
    title: options.title,
    url: options.url,
    markdown: options.markdown,
    selectionText: options.selectionText,
    isDomSelection: options.isDomSelection,
    isMetadataOnly: options.isMetadataOnly,
    warnings: [],
    raw: {
      page: {
        title: options.title,
        url: options.url,
      },
      content: {
        markdown: options.markdown,
        text: options.text,
      },
    },
  };
}

function sampleTabs(): MozeidonTab[] {
  return [
    tab({
      id: 2,
      windowId: 20,
      title: "GitHub PR",
      url: "https://github.com/example/pull/1",
    }),
    tab({
      id: 1,
      windowId: 10,
      title: "Active Docs",
      url: "https://docs.example.com/oauth",
      active: true,
    }),
  ];
}

function tab(options: { id: number; windowId: number; title: string; url: string; active?: boolean }): MozeidonTab {
  return {
    id: options.id,
    windowId: options.windowId,
    title: options.title,
    url: options.url,
    active: options.active ?? false,
    pinned: false,
    domain: new URL(options.url).hostname,
  };
}
