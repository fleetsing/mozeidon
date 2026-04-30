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
    warnings.push({
      code: "content_unavailable",
      message:
        "Markdown output is derived from basic page text; rich Markdown structure is not available in V1.",
      field: "content.markdown",
    })
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
