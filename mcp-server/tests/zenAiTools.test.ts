// Adapted from raycast/tests/zenAiTools.test.ts (see docs/zen-context/specs/020-mcp-read-only-server.md).
// Dropped: manifest/package.json assertions (Raycast-specific) and all
// zen_open_or_focus_url tests (that tool is deliberately not registered by
// this read-only server). Everything else validates the same, unmodified
// zenAiToolsCore.ts logic this package copied.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { MozeidonTab } from "../src/interfaces.js";
import {
  zenGetActiveContext,
  zenGetSelectionOrPage,
  zenGetTabContent,
  zenListTabs,
  zenSearchTabs,
  type ZenAiToolDependencies,
} from "../src/zenAiToolsCore.js";
import type { RaycastZenContext } from "../src/zenContext.js";
import { MozeidonClientError } from "../src/mozeidonClient.js";

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

test("zen_get_selection_or_page prefers active page content over a Raycast selection when Zen has a usable page", async () => {
  // While Zen has a usable page open, an unrelated selection in some other
  // app shouldn't pre-empt it — Raycast's selection is a last resort only.
  const result = await zenGetSelectionOrPage(
    {},
    createDependencies({
      getZenSelectionError: Object.assign(new Error("Selection permission is unavailable."), {
        code: "permission_unavailable",
      }),
      raycastSelectedText: "Raycast selected text",
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

test("zen_get_selection_or_page falls back to Raycast selection only when Zen selection and active page are both unusable", async () => {
  const result = await zenGetSelectionOrPage(
    {},
    createDependencies({
      getZenSelectionError: Object.assign(new Error("Selection permission is unavailable."), {
        code: "permission_unavailable",
      }),
      raycastSelectedText: "Raycast selected text",
      contexts: { markdown: context({}) },
    }),
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.kind, "raycast-selection");
    assert.equal(result.data.text, "Raycast selected text");
    assert.deepEqual(result.data.source, {});
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

test("zen_get_selection_or_page uses a Raycast selection when the active page fetch itself fails", async () => {
  // getContext() can throw (CLI/native-app failure), not just return
  // unusable content. A transient failure there must not block the
  // Raycast-selection last resort when selected text is available.
  const result = await zenGetSelectionOrPage(
    {},
    createDependencies({
      zenSelection: context({}),
      getContextError: nativeAppIpcError("context active --format markdown"),
      raycastSelectedText: "Raycast selected text",
    }),
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.kind, "raycast-selection");
    assert.equal(result.data.text, "Raycast selected text");
  }
});

test("zen_get_selection_or_page reports the active page fetch error when no Raycast selection is available either", async () => {
  const result = await zenGetSelectionOrPage(
    {},
    createDependencies({
      zenSelection: context({}),
      getContextError: nativeAppIpcError("context active --format markdown"),
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "mozeidon_unavailable");
    assert.match(result.error.message, /Cannot read via ipc/);
  }
});

test("zen_get_selection_or_page never resolves a Raycast selection through this package's dependency wiring (no OS-level selection outside Raycast)", async () => {
  // This is the real, documented behavior difference from the Raycast
  // build (spec 020): getRaycastSelectedText always resolves to undefined
  // here, so this tier is only reachable via the pure zenAiToolsCore.ts
  // logic under test, never through this server's actual wiring.
  const result = await zenGetSelectionOrPage(
    {},
    createDependencies({
      zenSelection: context({}),
      contexts: { markdown: context({}) },
      raycastSelectedText: "would only ever surface if getRaycastSelectedText resolved to a value",
    }),
  );

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.kind, "raycast-selection");
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

test("zen_get_tab_content reads a background tab directly without switching (spec 014 Phase 2)", async () => {
  const switched: string[] = [];
  const result = await zenGetTabContent(
    { tabId: 2, windowId: 20 },
    createDependencies({
      tabs: sampleTabs(),
      getContextForTab: (tabId, windowId) =>
        context({ title: "GitHub PR", url: "https://github.com/example/pull/1", tabId, windowId, markdown: "PR markdown" }),
      switchTab: (windowId, tabId) => switched.push(`${windowId}:${tabId}`),
    }),
  );

  assert.deepEqual(switched, []);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.focusChanged, false);
    assert.equal(result.data.restoreFocus, true);
    assert.equal(result.data.focusRestored, undefined);
    assert.deepEqual(result.data.actualTab, { tabId: 2, windowId: 20, url: "https://github.com/example/pull/1", title: "GitHub PR" });
    assert.equal(result.data.activation?.strategy, "direct");
    assert.equal(result.data.activation?.succeeded, true);
  }
});

test("zen_get_tab_content falls back to focus-then-read when the CLI predates context tab", async () => {
  const switched: string[] = [];
  const result = await zenGetTabContent(
    { tabId: 2, windowId: 20 },
    createDependencies({
      tabs: sampleTabs(),
      contextForActiveTab: (tab) =>
        context({ title: tab.title, url: tab.url, tabId: tab.id, windowId: tab.windowId, markdown: "PR markdown" }),
      switchTab: (windowId, tabId) => switched.push(`${windowId}:${tabId}`),
    }),
  );

  assert.deepEqual(switched, ["20:2", "10:1"]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.activation?.strategy, "focus-then-read");
    assert.equal(result.data.focusChanged, true);
    assert.equal(result.data.focusRestored, true);
  }
});

test("zen_get_tab_content fails closed on a direct-read tab mismatch without falling back", async () => {
  const switched: string[] = [];
  const result = await zenGetTabContent(
    { tabId: 2, windowId: 20 },
    createDependencies({
      tabs: sampleTabs(),
      getContextForTab: () => context({ title: "Wrong Tab", url: "https://example.com", tabId: 99, windowId: 99 }),
      switchTab: (windowId, tabId) => switched.push(`${windowId}:${tabId}`),
    }),
  );

  assert.deepEqual(switched, []);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "target_tab_mismatch");
    assert.deepEqual(result.details?.actualTab, { tabId: 99, windowId: 99, url: "https://example.com", title: "Wrong Tab" });
  }
});

test("zen_get_tab_content surfaces a genuine direct-read tab_not_found without falling back", async () => {
  const switched: string[] = [];
  const result = await zenGetTabContent(
    { tabId: 2, windowId: 20 },
    createDependencies({
      tabs: sampleTabs(),
      getContextForTabError: Object.assign(new Error("The requested Zen tab was not found."), { code: "tab_not_found" }),
      switchTab: (windowId, tabId) => switched.push(`${windowId}:${tabId}`),
    }),
  );

  assert.deepEqual(switched, []);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "tab_not_found");
});

test("zen_get_tab_content switches to an unambiguous tab, verifies it, and restores focus", async () => {
  const switched: string[] = [];
  const result = await zenGetTabContent(
    { tabId: 2, windowId: 20 },
    createDependencies({
      tabs: sampleTabs(),
      contextForActiveTab: (tab) =>
        context({ title: tab.title, url: tab.url, tabId: tab.id, windowId: tab.windowId, markdown: "PR markdown" }),
      switchTab: (windowId, tabId) => switched.push(`${windowId}:${tabId}`),
    }),
  );

  assert.deepEqual(switched, ["20:2", "10:1"]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.data.requestedTab, { tabId: 2, windowId: 20, url: "https://github.com/example/pull/1", title: "GitHub PR" });
    assert.deepEqual(result.data.actualTab, { tabId: 2, windowId: 20, url: "https://github.com/example/pull/1", title: "GitHub PR" });
    assert.deepEqual(result.data.originalTab, { tabId: 1, windowId: 10, url: "https://docs.example.com/oauth", title: "Active Docs" });
    assert.equal(result.data.focusChanged, true);
    assert.equal(result.data.restoreFocus, true);
    assert.equal(result.data.focusRestored, true);
    assert.equal(result.data.activation?.succeeded, true);
  }
});

test("zen_get_tab_content does not refocus a tab that is already active in the focused window", async () => {
  const switched: string[] = [];
  const result = await zenGetTabContent(
    { tabId: 1, windowId: 10 },
    createDependencies({
      tabs: sampleTabs(),
      contextForActiveTab: (tab) =>
        context({ title: tab.title, url: tab.url, tabId: tab.id, windowId: tab.windowId, markdown: "Docs markdown" }),
      switchTab: (windowId, tabId) => switched.push(`${windowId}:${tabId}`),
    }),
  );

  assert.deepEqual(switched, []);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.focusChanged, false);
    assert.equal(result.data.focusRestored, undefined);
    assert.equal(result.data.activation?.attempted, false);
  }
});

test("zen_get_tab_content leaves the target tab focused when restoreFocus is false", async () => {
  const switched: string[] = [];
  const result = await zenGetTabContent(
    { tabId: 2, windowId: 20, restoreFocus: false },
    createDependencies({
      tabs: sampleTabs(),
      contextForActiveTab: (tab) =>
        context({ title: tab.title, url: tab.url, tabId: tab.id, windowId: tab.windowId, markdown: "PR markdown" }),
      switchTab: (windowId, tabId) => switched.push(`${windowId}:${tabId}`),
    }),
  );

  assert.deepEqual(switched, ["20:2"]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.restoreFocus, false);
    assert.equal(result.data.focusRestored, undefined);
  }
});

test("zen_get_tab_content fails closed when the switch never activates the requested tab", async () => {
  const result = await zenGetTabContent(
    { tabId: 2, windowId: 20 },
    createDependencies({
      tabs: sampleTabs(),
      applySwitchEffect: false,
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "activation_timeout");
    assert.equal(result.details?.focusChanged, true);
  }
});

test("zen_get_tab_content fails closed when the switch command throws", async () => {
  const result = await zenGetTabContent(
    { tabId: 2, windowId: 20 },
    createDependencies({
      tabs: sampleTabs(),
      switchTabError: new Error("switch failed"),
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "tab_activation_failed");
    assert.equal(result.details?.focusChanged, true);
  }
});

test("zen_get_tab_content fails closed when extracted context reports a different tab", async () => {
  const result = await zenGetTabContent(
    { tabId: 2, windowId: 20 },
    createDependencies({
      tabs: sampleTabs(),
      contextForActiveTab: () => context({ title: "Wrong Tab", url: "https://example.com", tabId: 99, windowId: 99 }),
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "target_tab_mismatch");
    assert.deepEqual(result.details?.actualTab, { tabId: 99, windowId: 99, url: "https://example.com", title: "Wrong Tab" });
  }
});

test("zen_get_tab_content reports a warning but keeps content when restore focus fails", async () => {
  const result = await zenGetTabContent(
    { tabId: 2, windowId: 20 },
    createDependencies({
      tabs: sampleTabs(),
      contextForActiveTab: (tab) =>
        context({ title: tab.title, url: tab.url, tabId: tab.id, windowId: tab.windowId, markdown: "PR markdown" }),
      switchTab: (windowId, tabId) => {
        if (windowId === 10 && tabId === 1) throw new Error("restore failed");
      },
    }),
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.focusRestored, false);
    assert.ok(result.warnings.includes("focus_restore_failed"));
  }
});

test("zen_get_tab_content preserves restore-failure warnings and activation metadata when content is unavailable", async () => {
  const result = await zenGetTabContent(
    { tabId: 2, windowId: 20 },
    createDependencies({
      tabs: sampleTabs(),
      contextForActiveTab: (tab) => context({ title: tab.title, url: tab.url, tabId: tab.id, windowId: tab.windowId }),
      switchTab: (windowId, tabId) => {
        if (windowId === 10 && tabId === 1) throw new Error("restore failed");
      },
    }),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "content_unavailable");
    assert.ok(result.warnings.includes("focus_restore_failed"));
    assert.equal(result.details?.focusRestored, false);
    assert.deepEqual(result.details?.requestedTab, { tabId: 2, windowId: 20, url: "https://github.com/example/pull/1", title: "GitHub PR" });
    assert.ok(result.details?.activation);
  }
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

test("zen_get_tab_content rejects partial tab targets", async () => {
  const result = await zenGetTabContent({ tabId: 2 }, createDependencies({ tabs: sampleTabs() }));

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "invalid_input");
    assert.match(result.error.message, /tabId and windowId/);
  }
});

test("zen_get_tab_content rejects empty URL targets", async () => {
  const result = await zenGetTabContent({ url: "   " }, createDependencies({ tabs: sampleTabs() }));

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "invalid_input");
    assert.match(result.error.message, /URL must be non-empty/);
  }
});

function createDependencies(options: {
  contexts?: Partial<Record<"markdown" | "text" | "json", RaycastZenContext>>;
  contextForActiveTab?: (tab: MozeidonTab, format: "markdown" | "text" | "json") => RaycastZenContext;
  getContextError?: Error;
  getContextForTab?: (
    tabId: number,
    windowId: number,
    format: "markdown" | "text" | "json",
  ) => RaycastZenContext;
  getContextForTabError?: Error;
  zenSelection?: RaycastZenContext;
  getZenSelectionError?: Error & { code?: string };
  raycastSelectedText?: string;
  tabs?: MozeidonTab[];
  switchTab?: (windowId: number, tabId: number) => void;
  switchTabError?: Error;
  applySwitchEffect?: boolean;
  openUrl?: (url: string) => void;
  wait?: (ms: number) => Promise<void>;
}): ZenAiToolDependencies {
  const tabs = (options.tabs ?? []).map((candidate) => ({ ...candidate }));
  let focusedWindowId = tabs.find((candidate) => candidate.active)?.windowId ?? tabs[0]?.windowId ?? 10;

  return {
    getContext: async (format) => {
      if (options.getContextError) throw options.getContextError;
      if (options.contextForActiveTab) {
        const active = tabs.find((candidate) => candidate.active && candidate.windowId === focusedWindowId);
        if (active) return options.contextForActiveTab(active, format);
      }
      return options.contexts?.[format] ?? context({ markdown: "Default markdown" });
    },
    getContextForTab: async (tabId, windowId, format) => {
      if (options.getContextForTabError) throw options.getContextForTabError;
      if (options.getContextForTab) return options.getContextForTab(tabId, windowId, format);
      throw oldCliContextError(`context tab --tab-id ${tabId} --window-id ${windowId} --format ${format}`);
    },
    getZenSelection: async () => {
      if (options.getZenSelectionError) throw options.getZenSelectionError;
      return options.zenSelection ?? context({});
    },
    // Real zen-mcp-server wiring always resolves undefined here (no OS-level
    // selection outside Raycast); this test helper accepts a value so the
    // shared zenAiToolsCore.ts logic itself can still be exercised.
    getRaycastSelectedText: async () => options.raycastSelectedText,
    listTabs: async () => ({
      data: tabs,
      windows: [
        {
          id: focusedWindowId,
          isLastFocused: true,
        },
      ],
    }),
    switchTab: (windowId, tabId) => {
      if (options.switchTabError) throw options.switchTabError;
      options.switchTab?.(windowId, tabId);
      if (options.applySwitchEffect ?? true) {
        for (const candidate of tabs) candidate.active = candidate.windowId === windowId && candidate.id === tabId;
        focusedWindowId = windowId;
      }
    },
    openUrl: options.openUrl ?? (() => undefined),
    wait: options.wait ?? (async () => undefined),
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
  tabId?: number;
  windowId?: number;
  markdown?: string;
  text?: string;
  selectionText?: string;
  isDomSelection?: boolean;
  isMetadataOnly?: boolean;
}): RaycastZenContext {
  return {
    title: options.title,
    url: options.url,
    tabId: options.tabId,
    windowId: options.windowId,
    markdown: options.markdown,
    selectionText: options.selectionText,
    isDomSelection: options.isDomSelection,
    isMetadataOnly: options.isMetadataOnly,
    warnings: [],
    raw: {
      tab: {
        id: options.tabId,
        windowId: options.windowId,
      },
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
