import {
  classifyZenContextContent,
  getContentValue,
  isMetadataOnlyContext as isZenMetadataOnlyContext,
  isRecoverableSelectionCode,
  type ZenContext,
} from "./zenContext";
import { RaycastAiUnavailableError } from "./raycastAiCore";
import { mapMozeidonContextError } from "./zenContextErrors";

export type { ZenContext } from "./zenContext";

export type SmartSummarizeSource = "zen-selection" | "raycast-selection" | "active-page";

export type SmartSummarizeContext = {
  source: SmartSummarizeSource;
  text: string;
  title?: string;
  url?: string;
};

export type SmartSummarizeDependencies = {
  getZenSelection: () => Promise<ZenContext | undefined>;
  getRaycastSelectedText: () => Promise<string | undefined>;
  getActivePageMarkdown: () => Promise<ZenContext | undefined>;
};

export type SmartSummarizeAiDependencies = SmartSummarizeDependencies & {
  canAccessAi: () => boolean | Promise<boolean>;
  askAi: (prompt: string, context: SmartSummarizeContext) => Promise<string>;
};

export type SmartSummarizeResult =
  | {
      ok: true;
      summary: string;
      context: SmartSummarizeContext;
    }
  | {
      ok: false;
      error: {
        code: SmartSummarizeErrorCode;
        message: string;
      };
    };

export type SmartSummarizeErrorCode =
  | "ai_unavailable"
  | "content_unavailable"
  | "context_command_unavailable"
  | "mozeidon_unavailable"
  | "parse_failed";

export class SmartSummarizeError extends Error {
  constructor(
    public readonly code: SmartSummarizeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SmartSummarizeError";
  }
}

export async function resolveSmartSummarizeContext(
  dependencies: SmartSummarizeDependencies,
): Promise<SmartSummarizeContext> {
  const zenSelection = await getRecoverableZenSelection(dependencies);
  const zenSelectionText = getZenDomSelectionText(zenSelection);

  if (zenSelectionText) {
    return {
      source: "zen-selection",
      text: zenSelectionText,
      ...getSourceMetadata(zenSelection),
    };
  }

  // Prefer the Zen active page over an OS-level Raycast selection: while
  // Zen is showing a usable page, an unrelated selection in some other app
  // shouldn't pre-empt it. Raycast's selection is only a last resort for
  // when Zen genuinely has nothing usable (e.g. a New Tab page). A transient
  // active-page fetch failure must not block that last resort, so defer any
  // thrown error until after checking the Raycast selection.
  let activePageContext: ZenContext | undefined;
  let activePageFetchError: unknown;
  try {
    activePageContext = await dependencies.getActivePageMarkdown();
  } catch (error) {
    activePageFetchError = error;
  }

  const activePageMarkdown = activePageContext ? getUsablePageMarkdownOrUndefined(activePageContext) : undefined;
  if (activePageMarkdown) {
    return {
      source: "active-page",
      text: activePageMarkdown,
      ...getSourceMetadata(activePageContext),
    };
  }

  const raycastSelectedText = trimToText(await dependencies.getRaycastSelectedText());
  if (raycastSelectedText) {
    // Raycast's selected-text API reads whatever is highlighted in the
    // frontmost app, which is not scoped to Zen. Don't attach the Zen
    // page's title/URL here — that text may have nothing to do with it.
    return {
      source: "raycast-selection",
      text: raycastSelectedText,
    };
  }

  if (activePageFetchError) throw activePageFetchError;
  return {
    source: "active-page",
    text: getUsablePageMarkdown(activePageContext),
    ...getSourceMetadata(activePageContext),
  };
}

export async function summarizeSmartContext(dependencies: SmartSummarizeAiDependencies): Promise<SmartSummarizeResult> {
  try {
    if (!(await dependencies.canAccessAi())) {
      return {
        ok: false,
        error: {
          code: "ai_unavailable",
          message: "Raycast AI is unavailable for this account or environment.",
        },
      };
    }

    const context = await resolveSmartSummarizeContext(dependencies);
    const summary = await dependencies.askAi(buildSmartSummarizePrompt(context), context);

    return { ok: true, summary, context };
  } catch (error) {
    if (error instanceof SmartSummarizeError) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
        },
      };
    }

    if (error instanceof RaycastAiUnavailableError) {
      return {
        ok: false,
        error: {
          code: "ai_unavailable",
          message: "Raycast AI is unavailable for this account or environment.",
        },
      };
    }

    const mozeidonContextError = mapMozeidonContextError(error);
    if (mozeidonContextError) {
      return {
        ok: false,
        error: {
          code: mozeidonContextError.code as SmartSummarizeErrorCode,
          message: mozeidonContextError.message,
        },
      };
    }

    throw error;
  }
}

export function buildSmartSummarizePrompt(context: SmartSummarizeContext): string {
  const sourceLines = [
    context.title ? `Title: ${context.title}` : undefined,
    context.url ? `URL: ${context.url}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
  const sourceBlock = sourceLines ? `${sourceLines}\n\n` : "";

  return `Summarize only the supplied ${context.source === "active-page" ? "page context" : "selected text"}.\n\n${sourceBlock}${context.text}`;
}

export function getSmartSummarizeTitle(source: SmartSummarizeSource): string {
  if (source === "zen-selection") return "Zen Selection Summary";
  if (source === "raycast-selection") return "Raycast Selection Summary";
  return "Current Page Summary";
}

async function getRecoverableZenSelection(dependencies: SmartSummarizeDependencies): Promise<ZenContext | undefined> {
  try {
    const context = await dependencies.getZenSelection();
    if (context?.ok === false && !isRecoverableSelectionCode(context.error?.code)) {
      throw new SmartSummarizeError(
        mapMozeidonErrorCode(context.error?.code),
        context.error?.message ?? "Could not retrieve Zen selection.",
      );
    }

    return context;
  } catch (error) {
    const code = getErrorCode(error);
    if (code && isRecoverableSelectionCode(code)) {
      return {
        ok: false,
        status: "error",
        error: {
          code,
          message: error instanceof Error ? error.message : "Zen selection is unavailable.",
        },
      };
    }

    throw error;
  }
}

function getZenDomSelectionText(context: ZenContext | undefined): string | undefined {
  const selection = context?.content?.selection;
  const text = trimToText(selection?.text);
  if (!text) return undefined;

  if (selection?.isDomSelection === true) return text;
  if (selection?.source === "dom") return text;
  if (selection?.source === "user-selection") return text;
  if (selection?.source === "focused-input") return text;
  if (selection?.kind === "dom") return text;

  return undefined;
}

function getUsablePageMarkdownOrUndefined(context: ZenContext | undefined): string | undefined {
  const markdown = getContentValue(context?.content?.markdown);
  const contentUsability = classifyZenContextContent(context);
  if (
    !markdown ||
    isZenMetadataOnlyContext(context) ||
    contentUsability === "metadata-only" ||
    contentUsability === "empty" ||
    contentUsability === "unavailable" ||
    contentUsability === "error"
  ) {
    return undefined;
  }

  return markdown;
}

function getUsablePageMarkdown(context: ZenContext | undefined): string {
  const markdown = getUsablePageMarkdownOrUndefined(context);
  if (!markdown) {
    throw new SmartSummarizeError(
      "content_unavailable",
      "Active page content is unavailable. Check Zen context permissions or page support.",
    );
  }

  return markdown;
}

function getSourceMetadata(context: ZenContext | undefined): Pick<SmartSummarizeContext, "title" | "url"> {
  return {
    title: trimToText(context?.page?.title) ?? trimToText(context?.tab?.title),
    url: trimToText(context?.page?.url) ?? trimToText(context?.tab?.url),
  };
}

function mapMozeidonErrorCode(code: string | undefined): SmartSummarizeErrorCode {
  if (code === "parse_failed") return "parse_failed";
  return "mozeidon_unavailable";
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
}

function trimToText(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}
