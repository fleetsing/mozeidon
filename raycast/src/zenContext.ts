import { MozeidonClientError, runMozeidonJson, type MozeidonJsonOptions } from "./mozeidonClient";

export const ACTIVE_PAGE_MARKDOWN_ARGS = ["context", "active", "--format", "markdown"];
export const ZEN_SELECTION_ARGS = ["context", "selection"];

export type ZenContextWarning = string | { code?: string; [key: string]: unknown };
export type ZenContextContentValue = string | { value?: string; [key: string]: unknown };

export type ZenContext = {
  ok?: boolean;
  status?: string;
  error?: {
    code?: string;
    message?: string;
  };
  page?: {
    title?: string;
    url?: string;
  };
  tab?: {
    title?: string;
    url?: string;
  };
  content?: {
    markdown?: ZenContextContentValue;
    text?: ZenContextContentValue;
    isMetadataOnly?: boolean;
    selection?: {
      text?: string;
      source?: string;
      isDomSelection?: boolean;
      kind?: string;
    };
  };
  warnings?: ZenContextWarning[];
  extraction?: {
    contentSource?: string;
    domRead?: boolean;
    warnings?: ZenContextWarning[];
  };
};

export type RaycastZenContext = {
  title?: string;
  url?: string;
  markdown?: string;
  selectionText?: string;
  isDomSelection?: boolean;
  isMetadataOnly?: boolean;
  warnings: string[];
  raw: ZenContext;
};

export class ZenContextError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly context?: ZenContext,
  ) {
    super(message);
    this.name = "ZenContextError";
  }
}

export function fetchActivePageMarkdown(options: MozeidonJsonOptions): RaycastZenContext {
  return fetchActiveContext("markdown", options);
}

export function fetchActiveContext(
  format: "markdown" | "text" | "json",
  options: MozeidonJsonOptions,
): RaycastZenContext {
  return parseRaycastZenContext(
    runContextJson(buildActiveContextArgs(format), {
      ...options,
      context: `context active --format ${format}`,
    }),
  );
}

export function fetchZenSelection(options: MozeidonJsonOptions): RaycastZenContext {
  return parseRaycastZenContext(
    runContextJson(ZEN_SELECTION_ARGS, {
      ...options,
      context: "context selection",
    }),
  );
}

function runContextJson(args: string[], options: MozeidonJsonOptions): ZenContext {
  try {
    return runMozeidonJson<ZenContext>(args, options);
  } catch (error) {
    if (!options.profileId || !isProfileNotFoundError(error)) throw error;
    return runMozeidonJson<ZenContext>(args, { ...options, profileId: undefined });
  }
}

export function buildActiveContextArgs(format: "markdown" | "text" | "json"): string[] {
  return ["context", "active", "--format", format];
}

export function parseRaycastZenContext(context: ZenContext): RaycastZenContext {
  const parsed: RaycastZenContext = {
    title: trimToText(context.page?.title) ?? trimToText(context.tab?.title),
    url: trimToText(context.page?.url) ?? trimToText(context.tab?.url),
    markdown: getContentValue(context.content?.markdown),
    selectionText: trimToText(context.content?.selection?.text),
    isDomSelection: isDomSelection(context),
    isMetadataOnly: isMetadataOnlyContext(context),
    warnings: getContextWarnings(context)
      .map((warning) => getWarningCode(warning))
      .filter(isString),
    raw: context,
  };

  if (context.ok === false && !isRecoverableContextError(context.error?.code)) {
    throw new ZenContextError(
      context.error?.code ?? "context_error",
      context.error?.message ?? "Zen context failed.",
      context,
    );
  }

  return parsed;
}

export function buildSourceAttributedMarkdown(context: Pick<RaycastZenContext, "title" | "url" | "markdown">): string {
  const markdown = trimToText(context.markdown);
  if (!markdown) {
    throw new ZenContextError("content_unavailable", "No page Markdown is available.");
  }

  if (hasSourceAttribution(markdown, context)) return markdown;

  const header = [context.title ? `# ${context.title}` : undefined, context.url ? `Source: ${context.url}` : undefined]
    .filter(isString)
    .join("\n\n");

  return header ? `${header}\n\n${markdown}` : markdown;
}

export function requireRealMarkdownContext(context: Pick<RaycastZenContext, "markdown" | "isMetadataOnly">): string {
  const markdown = trimToText(context.markdown);
  if (!markdown || context.isMetadataOnly) {
    throw new ZenContextError(
      "content_unavailable",
      "Active page content is unavailable. Check Zen context permissions or page support.",
    );
  }

  return markdown;
}

export function isMetadataOnlyContext(context: ZenContext | undefined): boolean {
  if (context?.content?.isMetadataOnly === true) return true;

  const warningCodes = getContextWarnings(context).map(getWarningCode);
  return (
    context?.extraction?.contentSource === "tab-metadata" ||
    warningCodes.includes("metadata_only") ||
    warningCodes.includes("tab_metadata_only")
  );
}

export function isRecoverableSelectionCode(code: string | undefined): boolean {
  return (
    code === undefined ||
    code === "permission_unavailable" ||
    code === "unsupported_selection" ||
    code === "no_selection"
  );
}

function isRecoverableContextError(code: string | undefined): boolean {
  return isRecoverableSelectionCode(code);
}

function isProfileNotFoundError(error: unknown): boolean {
  if (!(error instanceof MozeidonClientError)) return false;
  const output = [error.stdout, error.stderr].filter(Boolean).join("\n");
  if (!output.trim()) return false;

  try {
    const parsed = JSON.parse(output) as { code?: string };
    return parsed.code === "profile_not_found";
  } catch (_) {
    return output.includes('"code":"profile_not_found"') || output.includes("profile_not_found");
  }
}

function isDomSelection(context: ZenContext): boolean {
  const selection = context.content?.selection;
  if (selection?.isDomSelection === true) return true;
  return (
    selection?.source === "dom" ||
    selection?.source === "user-selection" ||
    selection?.source === "focused-input" ||
    selection?.kind === "dom"
  );
}

function hasSourceAttribution(markdown: string, context: Pick<RaycastZenContext, "title" | "url">): boolean {
  const hasTitle = context.title ? markdown.includes(context.title) : true;
  const hasUrl = context.url ? markdown.includes(context.url) : true;
  return hasTitle && hasUrl;
}

function getWarningCode(warning: ZenContextWarning): string {
  return typeof warning === "string" ? warning : warning.code ?? "";
}

export function getContentValue(value: ZenContextContentValue | undefined): string | undefined {
  if (typeof value === "string") return trimToText(value);
  return trimToText(value?.value);
}

function getContextWarnings(context: ZenContext | undefined): ZenContextWarning[] {
  return [...(context?.warnings ?? []), ...(context?.extraction?.warnings ?? [])];
}

function trimToText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text : undefined;
}

function isString(value: string | undefined): value is string {
  return Boolean(value);
}
