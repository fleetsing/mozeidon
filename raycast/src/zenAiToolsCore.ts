import type { MozeidonTab } from "./interfaces";
import {
  getContentValue,
  isRecoverableSelectionCode,
  requireRealMarkdownContext,
  ZenContextError,
  type RaycastZenContext,
} from "./zenContext";
import { mapMozeidonContextError } from "./zenContextErrors";

export const ZEN_AI_TOOL_NAMES = [
  "zen_get_active_context",
  "zen_get_selection_or_page",
  "zen_list_tabs",
  "zen_search_tabs",
  "zen_get_tab_content",
  "zen_open_or_focus_url",
] as const;

export type ZenAiToolName = (typeof ZEN_AI_TOOL_NAMES)[number];

export type ZenToolResponse<T> =
  | {
      ok: true;
      tool: ZenAiToolName;
      data: T;
      warnings: string[];
    }
  | {
      ok: false;
      tool: ZenAiToolName;
      error: {
        code: string;
        message: string;
      };
      warnings: string[];
    };

export type ZenSource = {
  title?: string;
  url?: string;
  tabId?: number;
  windowId?: number;
  active?: boolean;
};

export type ZenGetActiveContextInput = {
  format?: "markdown" | "text" | "json";
  requireContent?: boolean;
};

export type ZenGetSelectionOrPageInput = {
  format?: "markdown" | "text";
  requireContent?: boolean;
};

export type ZenListTabsInput = {
  includeWindows?: boolean;
  limit?: number;
};

export type ZenSearchTabsInput = {
  query: string;
  limit?: number;
};

export type ZenGetTabContentInput = {
  tabId?: number;
  windowId?: number;
  url?: string;
  format?: "markdown" | "text";
  requireContent?: boolean;
};

export type ZenOpenOrFocusUrlInput = {
  url: string;
  preferFocusExisting?: boolean;
};

export type ZenGetActiveContextData = {
  source: ZenSource;
  format: "markdown" | "text" | "json";
  markdown?: string;
  text?: string;
  context?: unknown;
};

export type ZenGetSelectionOrPageData = {
  source: ZenSource;
  kind: "zen-selection" | "raycast-selection" | "active-page";
  format: "markdown" | "text";
  text?: string;
  markdown?: string;
};

export type ZenListTabsData = {
  tabs: ZenToolTab[];
};

export type ZenSearchTabsData = {
  query: string;
  matches: ZenToolTabMatch[];
};

export type ZenGetTabContentData = {
  source: ZenSource;
  format: "markdown" | "text";
  markdown?: string;
  text?: string;
};

export type ZenOpenOrFocusUrlData = {
  action: "focused-existing" | "opened-new";
  source: ZenSource;
};

export type ZenToolTab = {
  id: number;
  windowId?: number;
  title: string;
  url: string;
  active?: boolean;
  pinned?: boolean;
  windowFocused?: boolean;
};

export type ZenToolTabMatch = ZenToolTab & {
  score?: number;
  reason?: string;
};

export type ZenAiToolDependencies = {
  getContext: (format: "markdown" | "text" | "json") => Promise<RaycastZenContext>;
  getZenSelection: () => Promise<RaycastZenContext>;
  getRaycastSelectedText: () => Promise<string | undefined>;
  listTabs: (includeWindows: boolean) => Promise<MozeidonTabsWithWindowsPayload>;
  switchTab: (windowId: number, tabId: number) => Promise<void> | void;
  openUrl: (url: string) => Promise<void> | void;
};

export type MozeidonTabsWithWindowsPayload = {
  data: MozeidonTab[];
  windows?: Array<{
    id: number;
    isLastFocused?: boolean;
  }>;
};

export const ZEN_AI_TOOL_DEFINITIONS: Array<{
  name: ZenAiToolName;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> = [
  {
    name: "zen_get_active_context",
    title: "Get Active Zen Context",
    description: "Get the active Zen tab page context using Mozeidon. Use it to summarize or inspect the current page.",
    inputSchema: {
      format: ["markdown", "text", "json"],
      requireContent: "boolean",
    },
  },
  {
    name: "zen_get_selection_or_page",
    title: "Get Zen Selection or Page",
    description: "Get Zen DOM selection, Raycast selected text, or active Zen page content in that order.",
    inputSchema: {
      format: ["markdown", "text"],
      requireContent: "boolean",
    },
  },
  {
    name: "zen_list_tabs",
    title: "List Zen Tabs",
    description: "List currently open Zen tabs with stable tab and window metadata.",
    inputSchema: {
      includeWindows: "boolean",
      limit: "number",
    },
  },
  {
    name: "zen_search_tabs",
    title: "Search Zen Tabs",
    description: "Search currently open Zen tabs by title and URL.",
    inputSchema: {
      query: "string",
      limit: "number",
    },
  },
  {
    name: "zen_get_tab_content",
    title: "Get Zen Tab Content",
    description: "Get content for the active or unambiguously identified Zen tab using the context API.",
    inputSchema: {
      tabId: "number",
      windowId: "number",
      url: "string",
      format: ["markdown", "text"],
      requireContent: "boolean",
    },
  },
  {
    name: "zen_open_or_focus_url",
    title: "Open or Focus URL in Zen",
    description: "Open an http(s) URL in Zen or focus an already-open matching tab. Non-destructive.",
    inputSchema: {
      url: "string",
      preferFocusExisting: "boolean",
    },
  },
];

export async function zenGetActiveContext(
  input: ZenGetActiveContextInput,
  dependencies: ZenAiToolDependencies,
): Promise<ZenToolResponse<ZenGetActiveContextData>> {
  const format = getContextFormat(input.format);
  const requireContent = input.requireContent ?? true;

  return withToolErrors("zen_get_active_context", async () => {
    const context = await dependencies.getContext(format);
    const data = mapContextOutput(context, format, requireContent);
    return ok("zen_get_active_context", data, context.warnings);
  });
}

export async function zenGetSelectionOrPage(
  input: ZenGetSelectionOrPageInput,
  dependencies: ZenAiToolDependencies,
): Promise<ZenToolResponse<ZenGetSelectionOrPageData>> {
  const format = getSelectionFormat(input.format);
  const requireContent = input.requireContent ?? true;

  return withToolErrors<ZenGetSelectionOrPageData>("zen_get_selection_or_page", async () => {
    const zenSelection = await recoverableZenSelection(dependencies);
    if (zenSelection.selectionText && zenSelection.isDomSelection) {
      return ok(
        "zen_get_selection_or_page",
        {
          source: sourceFromContext(zenSelection),
          kind: "zen-selection",
          format,
          text: zenSelection.selectionText,
          markdown: format === "markdown" ? zenSelection.selectionText : undefined,
        },
        zenSelection.warnings,
      );
    }

    const raycastSelection = trimToText(await dependencies.getRaycastSelectedText());
    if (raycastSelection) {
      const source = await resolveRaycastSelectionSource(zenSelection, format, dependencies);
      return ok(
        "zen_get_selection_or_page",
        {
          source: source.source,
          kind: "raycast-selection",
          format,
          text: raycastSelection,
          markdown: format === "markdown" ? raycastSelection : undefined,
        },
        source.warnings,
      );
    }

    const pageContext = await dependencies.getContext(format);
    const activePageData = mapContextOutput(pageContext, format, requireContent);
    return ok(
      "zen_get_selection_or_page",
      {
        source: activePageData.source,
        kind: "active-page",
        format,
        text: activePageData.text,
        markdown: activePageData.markdown,
      },
      pageContext.warnings,
    );
  });
}

export async function zenListTabs(
  input: ZenListTabsInput,
  dependencies: ZenAiToolDependencies,
): Promise<ZenToolResponse<ZenListTabsData>> {
  const includeWindows = input.includeWindows ?? true;
  const limit = boundedLimit(input.limit, 50, 100);

  return withToolErrors("zen_list_tabs", async () => {
    const payload = await dependencies.listTabs(includeWindows);
    const tabs = sortToolTabs(mapToolTabs(payload)).slice(0, limit);
    return ok("zen_list_tabs", { tabs });
  });
}

export async function zenSearchTabs(
  input: ZenSearchTabsInput,
  dependencies: ZenAiToolDependencies,
): Promise<ZenToolResponse<ZenSearchTabsData>> {
  const query = trimToText(input?.query);
  const limit = boundedLimit(input?.limit, 10, 50);
  if (!query) return fail("zen_search_tabs", "invalid_input", "Query is required.");

  return withToolErrors("zen_search_tabs", async () => {
    const payload = await dependencies.listTabs(true);
    const matches = searchToolTabs(sortToolTabs(mapToolTabs(payload)), query).slice(0, limit);
    return ok("zen_search_tabs", { query, matches });
  });
}

export async function zenGetTabContent(
  input: ZenGetTabContentInput,
  dependencies: ZenAiToolDependencies,
): Promise<ZenToolResponse<ZenGetTabContentData>> {
  const safeInput: ZenGetTabContentInput = input ?? {};
  const format = getSelectionFormat(safeInput.format);
  const requireContent = safeInput.requireContent ?? true;
  const targetValidationError = validateTabContentTarget(safeInput);
  if (targetValidationError) {
    return fail("zen_get_tab_content", "invalid_input", targetValidationError);
  }

  return withToolErrors("zen_get_tab_content", async () => {
    if (hasTabTarget(safeInput)) {
      const tab = await resolveTabTarget(safeInput, dependencies);
      if (shouldSwitchBeforeReading(tab)) {
        await dependencies.switchTab(tab.windowId ?? 0, tab.id);
      }
    }

    const context = await dependencies.getContext(format);
    const data = mapContextOutput(context, format, requireContent);
    return ok(
      "zen_get_tab_content",
      {
        source: data.source,
        format,
        markdown: data.markdown,
        text: data.text,
      },
      context.warnings,
    );
  });
}

export async function zenOpenOrFocusUrl(
  input: ZenOpenOrFocusUrlInput,
  dependencies: ZenAiToolDependencies,
): Promise<ZenToolResponse<ZenOpenOrFocusUrlData>> {
  const url = normalizeHttpUrl(input?.url);
  if (!url) return fail("zen_open_or_focus_url", "invalid_url", "URL must be an absolute http(s) URL.");

  const preferFocusExisting = input.preferFocusExisting ?? true;

  return withToolErrors<ZenOpenOrFocusUrlData>("zen_open_or_focus_url", async () => {
    if (preferFocusExisting) {
      const payload = await dependencies.listTabs(true);
      const matches = mapToolTabs(payload).filter((tab) => normalizeHttpUrl(tab.url) === url);
      if (matches.length > 0) {
        const tab = sortToolTabs(matches)[0];
        await dependencies.switchTab(tab.windowId ?? 0, tab.id);
        return ok("zen_open_or_focus_url", {
          action: "focused-existing",
          source: sourceFromTab(tab),
        });
      }
    }

    await dependencies.openUrl(url);
    return ok("zen_open_or_focus_url", {
      action: "opened-new",
      source: { url },
    });
  });
}

function mapContextOutput(
  context: RaycastZenContext,
  format: "markdown" | "text" | "json",
  requireContent: boolean,
): ZenGetActiveContextData {
  if (requireContent) requireRealContentContext(context, format);

  return {
    source: sourceFromContext(context),
    format,
    markdown: format === "markdown" ? context.markdown : undefined,
    text: format === "text" ? getContentValue(context.raw.content?.text) ?? context.markdown : undefined,
    context: format === "json" ? context.raw : undefined,
  };
}

function requireRealContentContext(context: RaycastZenContext, format: "markdown" | "text" | "json"): void {
  if (format === "markdown") {
    requireRealMarkdownContext(context);
    return;
  }

  if (context.isMetadataOnly) {
    throw new ZenToolError(
      "content_unavailable",
      "Active page content is unavailable. Check Zen context permissions or page support.",
    );
  }

  if (format === "text" && !getContentValue(context.raw.content?.text) && !trimToText(context.markdown)) {
    throw new ZenToolError(
      "content_unavailable",
      "Active page content is unavailable. Check Zen context permissions or page support.",
    );
  }

  if (
    format === "json" &&
    !getContentValue(context.raw.content?.text) &&
    !getContentValue(context.raw.content?.markdown) &&
    !trimToText(context.raw.content?.selection?.text)
  ) {
    throw new ZenToolError(
      "content_unavailable",
      "Active page content is unavailable. Check Zen context permissions or page support.",
    );
  }
}

async function recoverableZenSelection(dependencies: ZenAiToolDependencies): Promise<RaycastZenContext> {
  try {
    const context = await dependencies.getZenSelection();
    const code = context.raw.error?.code;
    if (context.raw.ok === false && !isRecoverableSelectionCode(code)) {
      throw new ZenToolError(code ?? "context_error", context.raw.error?.message ?? "Zen selection failed.");
    }

    return context;
  } catch (error) {
    const code = getErrorCode(error);
    if (!code || !isRecoverableSelectionCode(code)) throw error;

    const message = error instanceof Error ? error.message : "Zen selection is unavailable.";
    return {
      warnings: [code ?? "selection_unavailable"],
      raw: {
        ok: false,
        error: {
          code,
          message,
        },
        warnings: [code ?? "selection_unavailable"],
      },
    };
  }
}

async function resolveRaycastSelectionSource(
  zenSelection: RaycastZenContext,
  format: "markdown" | "text",
  dependencies: ZenAiToolDependencies,
): Promise<{ source: ZenSource; warnings: string[] }> {
  const selectionSource = sourceFromContext(zenSelection);
  if (hasSourceMetadata(selectionSource)) {
    return {
      source: selectionSource,
      warnings: zenSelection.warnings,
    };
  }

  try {
    const activeContext = await dependencies.getContext(format);
    return {
      source: mergeSource(selectionSource, sourceFromContext(activeContext)),
      warnings: uniqueWarnings([...zenSelection.warnings, ...activeContext.warnings]),
    };
  } catch (_) {
    return {
      source: selectionSource,
      warnings: zenSelection.warnings,
    };
  }
}

async function resolveTabTarget(
  input: ZenGetTabContentInput,
  dependencies: ZenAiToolDependencies,
): Promise<ZenToolTab> {
  const payload = await dependencies.listTabs(true);
  const tabs = mapToolTabs(payload);
  const matches =
    input.tabId !== undefined && input.windowId !== undefined
      ? tabs.filter((tab) => tab.id === input.tabId && tab.windowId === input.windowId)
      : input.url
        ? tabs.filter((tab) => normalizeHttpUrl(tab.url) === normalizeHttpUrl(input.url))
        : [];

  if (matches.length === 0) {
    throw new ZenToolError("tab_not_found", "The requested Zen tab was not found.");
  }

  if (matches.length > 1) {
    throw new ZenToolError("ambiguous_tab", "The requested Zen tab target is ambiguous.");
  }

  return matches[0];
}

function shouldSwitchBeforeReading(tab: ZenToolTab): boolean {
  return tab.active !== true || tab.windowFocused !== true;
}

function mapToolTabs(payload: MozeidonTabsWithWindowsPayload): ZenToolTab[] {
  const focusedWindowIds = new Set(
    (payload.windows ?? []).filter((window) => window.isLastFocused).map((window) => window.id),
  );

  return payload.data.map((tab) => ({
    id: tab.id,
    windowId: tab.windowId,
    title: tab.title,
    url: tab.url,
    active: tab.active,
    pinned: tab.pinned,
    windowFocused: focusedWindowIds.has(tab.windowId) || undefined,
  }));
}

function sortToolTabs(tabs: ZenToolTab[]): ZenToolTab[] {
  return [...tabs].sort(
    (first, second) =>
      Number(second.windowFocused) - Number(first.windowFocused) || Number(second.active) - Number(first.active),
  );
}

function searchToolTabs(tabs: ZenToolTab[], query: string): ZenToolTabMatch[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  return tabs
    .map((tab): ZenToolTabMatch | undefined => {
      const haystack = `${tab.title} ${tab.url}`.toLowerCase();
      const matchedTerms = terms.filter((term) => haystack.includes(term));
      if (matchedTerms.length === 0) return undefined;

      const titleMatches = terms.filter((term) => tab.title.toLowerCase().includes(term)).length;
      const score = matchedTerms.length * 10 + titleMatches * 5 + Number(tab.active) * 2 + Number(tab.windowFocused);
      return {
        ...tab,
        score,
        reason: `Matched ${matchedTerms.join(", ")}`,
      };
    })
    .filter((tab): tab is ZenToolTabMatch => tab !== undefined)
    .sort((first, second) => (second.score ?? 0) - (first.score ?? 0));
}

function sourceFromContext(context: Pick<RaycastZenContext, "title" | "url">): ZenSource {
  return {
    title: context.title,
    url: context.url,
  };
}

function sourceFromTab(tab: ZenToolTab): ZenSource {
  return {
    title: tab.title,
    url: tab.url,
    tabId: tab.id,
    windowId: tab.windowId,
    active: tab.active,
  };
}

function hasSourceMetadata(source: ZenSource): boolean {
  return Boolean(trimToText(source.title) && trimToText(source.url));
}

function mergeSource(primary: ZenSource, fallback: ZenSource): ZenSource {
  return {
    ...primary,
    title: primary.title ?? fallback.title,
    url: primary.url ?? fallback.url,
  };
}

function uniqueWarnings(warnings: string[]): string[] {
  return [...new Set(warnings.filter(Boolean))];
}

function getErrorCode(error: unknown): string | undefined {
  if (error instanceof ZenContextError) return error.code;
  if (error instanceof ZenToolError) return error.code;
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
}

function ok<T>(tool: ZenAiToolName, data: T, warnings: string[] = []): ZenToolResponse<T> {
  return {
    ok: true,
    tool,
    data,
    warnings,
  };
}

function fail<T>(tool: ZenAiToolName, code: string, message: string, warnings: string[] = []): ZenToolResponse<T> {
  return {
    ok: false,
    tool,
    error: { code, message },
    warnings,
  };
}

async function withToolErrors<T>(
  tool: ZenAiToolName,
  action: () => Promise<ZenToolResponse<T>>,
): Promise<ZenToolResponse<T>> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ZenToolError) {
      return fail(tool, error.code, error.message);
    }

    const mozeidonContextError = mapMozeidonContextError(error);
    if (mozeidonContextError) return fail(tool, mozeidonContextError.code, mozeidonContextError.message);

    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "tool_failed";
    const message = error instanceof Error ? error.message : "Zen AI tool failed.";
    return fail(tool, code, message);
  }
}

class ZenToolError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ZenToolError";
  }
}

function getContextFormat(value: unknown): "markdown" | "text" | "json" {
  if (value === "text" || value === "json") return value;
  return "markdown";
}

function getSelectionFormat(value: unknown): "markdown" | "text" {
  if (value === "text") return "text";
  return "markdown";
}

function boundedLimit(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value) || value === undefined || value <= 0) return fallback;
  return Math.min(Math.trunc(value), max);
}

function normalizeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.hash = "";
    return url.toString();
  } catch (_) {
    return undefined;
  }
}

function hasTabTarget(input: ZenGetTabContentInput): boolean {
  return (input.tabId !== undefined && input.windowId !== undefined) || trimToText(input.url) !== undefined;
}

function validateTabContentTarget(input: ZenGetTabContentInput): string | undefined {
  const hasTabId = input.tabId !== undefined;
  const hasWindowId = input.windowId !== undefined;
  if (hasTabId !== hasWindowId) {
    return "tabId and windowId must be provided together.";
  }

  if (input.url !== undefined && !trimToText(input.url)) {
    return "URL must be non-empty when provided.";
  }

  return undefined;
}

function trimToText(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}
