import type browser from "webextension-polyfill"

import { contentLimit, truncate, truncationFromWarnings } from "./truncation"
import type { ContextRequest, ContextWarning, ExtractedContext } from "./types"

export function unsupportedFallback(
  request: ContextRequest,
  tab: browser.Tabs.Tab
): ExtractedContext {
  const warnings: ContextWarning[] = [
    {
      code: "unsupported_page",
      message:
        "DOM extraction is not available on privileged or unsupported browser pages.",
      field: "page.url",
    },
    {
      code: "restricted_page",
      message:
        "DOM extraction is not available on privileged or restricted browser pages.",
      field: "page.url",
    },
    {
      code: "dom_content_unavailable",
      message: "DOM page content could not be read.",
      field: "content",
    },
  ]
  return {
    status: "partial",
    content: fallbackContent(request, tab, warnings),
    warnings,
    truncation: truncationFromWarnings(warnings),
    contentSource: request.mode === "active" ? "tab-metadata" : undefined,
    domRead: false,
  }
}

export function permissionFallback(
  request: ContextRequest,
  message: string
): ExtractedContext {
  const warnings: ContextWarning[] = [
    {
      code: "permission_unavailable",
      message,
      field:
        request.mode === "selection"
          ? "content.selection"
          : request.mode === "links"
            ? "metadata.links"
            : request.mode === "metadata"
              ? "metadata"
              : "content",
    },
    {
      code: "injection_unavailable",
      message: "Script injection could not run for the target tab.",
      field:
        request.mode === "selection"
          ? "content.selection"
          : request.mode === "links"
            ? "metadata.links"
            : request.mode === "metadata"
              ? "metadata"
              : "content",
    },
    {
      code: "dom_content_unavailable",
      message: "DOM page content could not be read.",
      field:
        request.mode === "selection"
          ? "content.selection"
          : request.mode === "links"
            ? "metadata.links"
            : request.mode === "metadata"
              ? "metadata"
              : "content",
    },
  ]
  return {
    status: "partial",
    content: undefined,
    metadata: undefined,
    warnings,
    truncation: { truncated: false, fields: [] },
    contentSource: request.mode === "active" ? "tab-metadata" : undefined,
    domRead: false,
  }
}

export function fallbackContent(
  request: ContextRequest,
  tab: browser.Tabs.Tab,
  warnings: ContextWarning[]
) {
  if (request.mode !== "active") return undefined
  addMetadataFallbackWarnings(warnings)
  if (request.format === "text") {
    const value = `${tab.title ?? ""}\n${tab.url ?? ""}`.trim()
    const text = truncate(
      value,
      contentLimit(request, "text"),
      "content.text",
      warnings
    )
    return {
      text: {
        value: text.value,
        length: text.length,
        truncated: text.truncated,
      },
    }
  }
  if (request.format === "markdown") {
    const value = `[${tab.title ?? tab.url ?? "Untitled"}](${tab.url ?? ""})`
    const markdown = truncate(
      value,
      contentLimit(request, "markdown"),
      "content.markdown",
      warnings
    )
    return {
      markdown: {
        value: markdown.value,
        length: markdown.length,
        truncated: markdown.truncated,
      },
    }
  }
  return undefined
}

function addMetadataFallbackWarnings(warnings: ContextWarning[]) {
  addWarningOnce(warnings, {
    code: "tab_metadata_fallback",
    message: "Only tab title and URL were available.",
    field: "content",
  })
  addWarningOnce(warnings, {
    code: "metadata_only",
    message: "No page or selection content was extracted.",
    field: "content",
  })
  addWarningOnce(warnings, {
    code: "dom_content_unavailable",
    message: "DOM page content could not be read.",
    field: "content",
  })
}

function addWarningOnce(warnings: ContextWarning[], warning: ContextWarning) {
  if (
    warnings.some(
      (existing) =>
        existing.code === warning.code && existing.field === warning.field
    )
  ) {
    return
  }
  warnings.push(warning)
}
