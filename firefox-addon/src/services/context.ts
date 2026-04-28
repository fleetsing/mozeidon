import browser from "webextension-polyfill"

import { log } from "../logger"
import { Command } from "../models/command"
import { Port } from "../models/port"
import { Response } from "../models/response"
import { delay } from "../utils"

type ContextMode = "active" | "selection" | "metadata" | "links"
type ContextFormat = "json" | "text" | "markdown" | "html"
type ContextStatus = "ok" | "empty" | "partial"

type ContextLimits = {
  maxBytes: number
  maxTextBytes: number
  maxHtmlBytes: number
  maxMarkdownBytes: number
  maxLinks: number
  maxImages: number
  maxJsonLdBytes: number
}

type ContextRequest = {
  mode: ContextMode
  format: ContextFormat
  selector?: string
  limits: ContextLimits
}

type ContextRequestParseResult =
  | { request: ContextRequest }
  | {
      error: {
        code: string
        message: string
        details?: Record<string, unknown>
      }
    }

type ContextWarning = {
  code: string
  message: string
  field?: string
}

type Truncation = {
  truncated: boolean
  fields: string[]
}

type ExtractedContext = {
  status?: ContextStatus
  content?: unknown
  metadata?: unknown
  page?: {
    language?: string
    canonicalUrl?: string
    referrer?: string
  }
  selectorMatched?: boolean
  selectorMatchCount?: number
  contentSource?: string
  domRead?: boolean
  warnings?: ContextWarning[]
  truncation?: Truncation
  error?: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

const DEFAULT_LIMITS: ContextLimits = {
  maxBytes: 1000000,
  maxTextBytes: 50000,
  maxHtmlBytes: 250000,
  maxMarkdownBytes: 50000,
  maxLinks: 500,
  maxImages: 200,
  maxJsonLdBytes: 100000,
}

export async function getContext(port: Port, { args }: Command) {
  try {
    const parsedRequest = parseContextRequest(args)
    if ("error" in parsedRequest) {
      port.postMessage(
        Response.data(
          contextError(
            parsedRequest.error.code,
            parsedRequest.error.message,
            parsedRequest.error.details
          )
        )
      )
      await delay(5)
      return port.postMessage(Response.end())
    }

    const request = parsedRequest.request
    if (request.selector && request.mode !== "active") {
      port.postMessage(
        Response.data(
          contextError(
            "selector_unsupported",
            "Selector extraction is only supported for active page context.",
            { selector: request.selector, mode: request.mode }
          )
        )
      )
      await delay(5)
      return port.postMessage(Response.end())
    }

    const activeTab = await getActiveTab()
    if (!activeTab || activeTab.id === undefined) {
      port.postMessage(
        Response.data(
          contextError("no_active_tab", "No active Zen tab is available.")
        )
      )
      await delay(5)
      return port.postMessage(Response.end())
    }

    const window = await getContextWindow(activeTab)
    const unsupported = isUnsupportedContextUrl(activeTab.url)
    if (request.format === "html") {
      port.postMessage(
        Response.data(
          contextError(
            "html_sanitizer_missing",
            "HTML context output requires sanitizer support before it can be enabled."
          )
        )
      )
      await delay(5)
      return port.postMessage(Response.end())
    }
    if (request.selector && unsupported) {
      port.postMessage(
        Response.data(
          contextError(
            "unsupported_page",
            "Selector extraction is not available on privileged or unsupported browser pages.",
            { selector: request.selector, url: activeTab.url }
          )
        )
      )
      await delay(5)
      return port.postMessage(Response.end())
    }

    if (unsupported) {
      port.postMessage(
        Response.data(
          buildPayload(
            request,
            activeTab,
            window,
            unsupportedFallback(request, activeTab)
          )
        )
      )
      await delay(5)
      return port.postMessage(Response.end())
    }

    const extracted = await executeContextExtraction(activeTab.id, request)
    port.postMessage(
      Response.data(buildPayload(request, activeTab, window, extracted))
    )
    await delay(5)
    return port.postMessage(Response.end())
  } catch (e) {
    log(`getContext failed: ${JSON.stringify(e)}`)
    port.postMessage(
      Response.data(
        contextError(
          "internal_error",
          e instanceof Error ? e.message : "Context extraction failed."
        )
      )
    )
    await delay(5)
    return port.postMessage(Response.end())
  }
}

function parseContextRequest(args?: string): ContextRequestParseResult {
  let parsed: unknown
  try {
    parsed = args ? JSON.parse(args) : {}
  } catch (_) {
    return {
      error: {
        code: "invalid_context_request",
        message: "Context request args must be valid JSON.",
        details: { args },
      },
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      error: {
        code: "invalid_context_request",
        message: "Context request args must be a JSON object.",
        details: {
          receivedType: Array.isArray(parsed) ? "array" : typeof parsed,
        },
      },
    }
  }

  const request = parsed as Record<string, unknown>
  const mode = parseMode(request.mode)
  const format = parseFormat(request.format)
  const limits =
    request.limits &&
    typeof request.limits === "object" &&
    !Array.isArray(request.limits)
      ? request.limits
      : {}
  return {
    request: {
      mode,
      format,
      selector:
        typeof request.selector === "string" ? request.selector : undefined,
      limits: { ...DEFAULT_LIMITS, ...limits },
    },
  }
}

function parseMode(mode: unknown): ContextMode {
  if (mode === "selection" || mode === "metadata" || mode === "links")
    return mode
  return "active"
}

function parseFormat(format: unknown): ContextFormat {
  if (format === "text" || format === "markdown" || format === "html")
    return format
  return "json"
}

async function getActiveTab() {
  const tabs = await browser.tabs.query({
    active: true,
    lastFocusedWindow: true,
  })
  return tabs[0]
}

async function getContextWindow(tab: browser.Tabs.Tab) {
  try {
    const lastFocused = await browser.windows.getLastFocused()
    return {
      id: tab.windowId ?? lastFocused.id ?? -1,
      isLastFocused: tab.windowId === lastFocused.id,
    }
  } catch (_) {
    return { id: tab.windowId ?? -1, isLastFocused: true }
  }
}

async function executeContextExtraction(
  tabId: number,
  request: ContextRequest
) {
  try {
    const results = await browser.tabs.executeScript(tabId, {
      code: `(${injectedExtractor})(${JSON.stringify(request)})`,
    })
    const result = results && results[0]
    if (!result || typeof result !== "object") {
      return permissionFallback(request, "Context extraction returned no data.")
    }
    return result as ExtractedContext
  } catch (e) {
    log(`context executeScript failed: ${JSON.stringify(e)}`)
    return permissionFallback(
      request,
      e instanceof Error ? e.message : "Browser denied page-content extraction."
    )
  }
}

function buildPayload(
  request: ContextRequest,
  tab: browser.Tabs.Tab,
  window: { id: number; isLastFocused: boolean },
  extracted: ExtractedContext
) {
  if (extracted.error) {
    return contextError(
      extracted.error.code,
      extracted.error.message,
      extracted.error.details
    )
  }

  const warnings = extracted.warnings ?? []
  const content =
    extracted.content ??
    (request.mode === "active" &&
    extracted.domRead === false &&
    extracted.contentSource === "tab-metadata"
      ? fallbackContent(request, tab, warnings)
      : undefined)
  const truncation = mergeTruncation(extracted.truncation, warnings)
  const status =
    extracted.status ??
    (warnings.length > 0 || truncation.truncated
      ? "partial"
      : ("ok" as ContextStatus))

  return {
    ok: true,
    status,
    tab: tabPayload(tab),
    window,
    page: {
      url: tab.url ?? "",
      title: tab.title ?? "",
      domain: domainFromUrl(tab.url),
      ...extracted.page,
    },
    content,
    metadata: extracted.metadata,
    extraction: {
      mode: request.mode,
      selector: request.selector,
      selectorMatched: extracted.selectorMatched,
      selectorMatchCount: extracted.selectorMatchCount,
      contentSource: extracted.contentSource,
      domRead: extracted.domRead ?? false,
      warnings,
      limits: request.limits,
      truncation,
    },
    permissions: permissionsForWarnings(warnings),
    capabilities: capabilitiesForWarnings(warnings),
  }
}

function tabPayload(tab: browser.Tabs.Tab) {
  return {
    id: tab.id ?? -1,
    groupId: (tab as any).groupId ?? -1,
    windowId: tab.windowId ?? -1,
    title: tab.title ?? "",
    pinned: tab.pinned ?? false,
    url: tab.url ?? "",
    active: tab.active ?? false,
    domain: domainFromUrl(tab.url),
    lastAccessed: tab.lastAccessed ? Math.round(tab.lastAccessed) : 0,
    index: tab.index ?? 0,
  }
}

function unsupportedFallback(
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

function permissionFallback(
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

function fallbackContent(
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

function permissionsForWarnings(warnings: ContextWarning[]) {
  if (warnings.some((warning) => warning.code === "unsupported_page")) {
    return {
      canReadTabMetadata: true,
      hasDomAccess: false,
      hasActiveTabGrant: false,
      hasHostPermission: false,
      canReadActiveTab: false,
      canReadSelection: false,
      canReadPageContent: false,
      canReadMetadata: false,
      canReadLinks: false,
    }
  }
  if (warnings.some((warning) => warning.code === "permission_unavailable")) {
    return {
      canReadTabMetadata: true,
      hasDomAccess: false,
      hasActiveTabGrant: false,
      hasHostPermission: false,
      canReadActiveTab: false,
      canReadSelection: false,
      canReadPageContent: false,
      canReadMetadata: false,
      canReadLinks: false,
      requiresHostPermission: true,
      missing: ["activeTab_or_host_permission"],
    }
  }
  return {
    canReadTabMetadata: true,
    hasDomAccess: true,
    hasActiveTabGrant: false,
    hasHostPermission: true,
    canReadActiveTab: true,
    canReadSelection: true,
    canReadPageContent: true,
    canReadMetadata: true,
    canReadLinks: true,
  }
}

function capabilitiesForWarnings(warnings: ContextWarning[]) {
  if (warnings.some((warning) => warning.code === "unsupported_page")) {
    return {
      activeTab: "available",
      selection: "unavailable",
      pageContent: "unavailable",
      metadata: "unavailable",
      links: "unavailable",
    }
  }
  if (warnings.some((warning) => warning.code === "permission_unavailable")) {
    return {
      activeTab: "available",
      selection: "permission-required",
      pageContent: "permission-required",
      metadata: "permission-required",
      links: "permission-required",
    }
  }
  return {
    activeTab: "available",
    selection: "available",
    pageContent: "available",
    metadata: "available",
    links: "available",
  }
}

function contextError(
  code: string,
  message: string,
  details?: Record<string, unknown>
) {
  return {
    ok: false,
    status: "error",
    code,
    message,
    details,
  }
}

function isUnsupportedContextUrl(rawUrl?: string) {
  if (!rawUrl) return true
  try {
    const url = new URL(rawUrl)
    if (url.protocol === "about:" && url.pathname === "blank") return false
    return url.protocol !== "http:" && url.protocol !== "https:"
  } catch (_) {
    return true
  }
}

function domainFromUrl(rawUrl?: string) {
  if (!rawUrl) return ""
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "")
  } catch (_) {
    return ""
  }
}

function truncationFromWarnings(warnings: ContextWarning[]): Truncation {
  const fields = warnings
    .filter(
      (warning) =>
        (warning.code === "content_truncated" ||
          warning.code === "metadata_truncated") &&
        warning.field
    )
    .map((warning) => warning.field!)
  return { truncated: fields.length > 0, fields }
}

function mergeTruncation(
  existing: Truncation | undefined,
  warnings: ContextWarning[]
): Truncation {
  const warningTruncation = truncationFromWarnings(warnings)
  if (!existing) return warningTruncation
  const fields = Array.from(
    new Set([...(existing.fields ?? []), ...warningTruncation.fields])
  )
  return {
    truncated: existing.truncated || warningTruncation.truncated,
    fields,
  }
}

function truncate(
  value: string,
  maxBytes: number,
  field: string,
  warnings: ContextWarning[]
) {
  const encoder = new TextEncoder()
  if (encoder.encode(value).length <= maxBytes) {
    return { value, length: value.length, truncated: false }
  }

  let output = ""
  let currentBytes = 0
  for (const char of value) {
    const charBytes = encoder.encode(char).length
    if (currentBytes + charBytes > maxBytes) break
    output += char
    currentBytes += charBytes
  }
  warnings.push({
    code: "content_truncated",
    message: "Context content was truncated to fit the configured size limit.",
    field,
  })
  return { value: output, length: output.length, truncated: true }
}

function contentLimit(
  request: ContextRequest,
  field: "text" | "markdown" | "html"
) {
  const fieldLimit =
    field === "text"
      ? request.limits.maxTextBytes
      : field === "markdown"
        ? request.limits.maxMarkdownBytes
        : request.limits.maxHtmlBytes
  return Math.min(request.limits.maxBytes, fieldLimit)
}

function injectedExtractor(request: ContextRequest): ExtractedContext {
  const warnings: ContextWarning[] = []
  const truncationFields: string[] = []

  function addWarning(code: string, message: string, field?: string) {
    warnings.push({ code, message, field })
    if (code === "content_truncated" || code === "metadata_truncated") {
      if (field) truncationFields.push(field)
    }
  }

  function truncateValue(value: string, maxBytes: number, field: string) {
    const encoder = new TextEncoder()
    if (encoder.encode(value).length <= maxBytes) {
      return { value, length: value.length, truncated: false }
    }

    let output = ""
    let currentBytes = 0
    for (const char of value) {
      const charBytes = encoder.encode(char).length
      if (currentBytes + charBytes > maxBytes) break
      output += char
      currentBytes += charBytes
    }
    addWarning("content_truncated", "Context content was truncated.", field)
    return { value: output, length: output.length, truncated: true }
  }

  function serializedByteLength(value: unknown) {
    return new TextEncoder().encode(JSON.stringify(value)).length
  }

  function addMetadataTruncatedWarning(field: string, message: string) {
    if (
      warnings.some(
        (warning) =>
          warning.code === "metadata_truncated" && warning.field === field
      )
    ) {
      return
    }
    addWarning("metadata_truncated", message, field)
  }

  function contentLimit(field: "text" | "markdown" | "html") {
    const fieldLimit =
      field === "text"
        ? request.limits.maxTextBytes
        : field === "markdown"
          ? request.limits.maxMarkdownBytes
          : request.limits.maxHtmlBytes
    return Math.min(request.limits.maxBytes, fieldLimit)
  }

  function safeURL(value: string | null, field: string) {
    if (!value) return undefined
    try {
      return new URL(value, document.baseURI).toString()
    } catch (_) {
      addWarning(
        "content_unavailable",
        "A page-provided URL could not be resolved.",
        field
      )
      return undefined
    }
  }

  function extractionRoot() {
    if (!request.selector) {
      return {
        root:
          document.querySelector("main, article") ??
          document.body ??
          document.documentElement,
        selectorMatched: undefined,
        selectorMatchCount: undefined,
        contentSource: "document",
      }
    }
    let matches: Element[]
    try {
      matches = Array.from(document.querySelectorAll(request.selector))
    } catch (_) {
      return {
        error: {
          code: "selector_invalid",
          message: "Selector syntax is invalid.",
          details: { selector: request.selector },
        },
      }
    }
    if (matches.length === 0) {
      addWarning(
        "selector_no_match",
        "Selector matched no elements.",
        "selector"
      )
      return {
        root: undefined,
        selectorMatched: false,
        selectorMatchCount: 0,
        contentSource: "selector",
        domRead: true,
        empty: true,
      }
    }
    if (matches.length > 1) {
      addWarning(
        "selector_multiple_matches",
        "Selector matched multiple elements; using the first match.",
        "selector"
      )
    }
    return {
      root: matches[0],
      selectorMatched: true,
      selectorMatchCount: matches.length,
      contentSource: "selector",
      domRead: true,
    }
  }

  function readableText(root: Element) {
    const clone = root.cloneNode(true) as Element
    clone
      .querySelectorAll("script, style, template, noscript")
      .forEach((node) => node.remove())
    const text = (clone as HTMLElement).innerText ?? clone.textContent ?? ""
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n")
  }

  function markdownFromText(title: string, url: string, text: string) {
    const lines = [`# ${title || "Untitled"}`, "", `Source: ${url}`, ""]
    if (text) lines.push(text)
    return lines.join("\n")
  }

  function selectionContent() {
    const active = document.activeElement as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null
    if (
      active &&
      (active.tagName === "TEXTAREA" ||
        (active.tagName === "INPUT" &&
          typeof active.selectionStart === "number"))
    ) {
      const start = active.selectionStart ?? 0
      const end = active.selectionEnd ?? start
      const text = active.value.slice(start, end)
      if (text) {
        const truncated = truncateValue(
          text,
          contentLimit("text"),
          "content.selection"
        )
        return {
          text: truncated.value,
          isCollapsed: false,
          source: "focused-input",
          length: truncated.length,
          truncated: truncated.truncated,
        }
      }
    }

    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      addWarning(
        "selection_unavailable",
        "No active page selection is available.",
        "content.selection"
      )
      return { isCollapsed: true, source: "none", length: 0, truncated: false }
    }

    const text = selection.toString()
    const truncated = truncateValue(
      text,
      contentLimit("text"),
      "content.selection"
    )
    return {
      text: truncated.value,
      isCollapsed: false,
      source: "user-selection",
      length: truncated.length,
      truncated: truncated.truncated,
    }
  }

  function metadata(root: Element | Document) {
    const rootElement = root instanceof Document ? document : root
    const openGraph: Record<string, string | string[]> = {}
    document
      .querySelectorAll('meta[property^="og:"], meta[name^="og:"]')
      .forEach((meta) => {
        const key = meta.getAttribute("property") ?? meta.getAttribute("name")
        const value = meta.getAttribute("content")
        if (!key || !value) return
        const previous = openGraph[key]
        if (Array.isArray(previous)) previous.push(value)
        else if (previous) openGraph[key] = [previous, value]
        else openGraph[key] = value
      })

    const rawJsonLd: unknown[] = []
    const summary: Record<string, unknown>[] = []
    let jsonLdTruncated = false
    document
      .querySelectorAll('script[type="application/ld+json"]')
      .forEach((script) => {
        const text = script.textContent?.trim()
        if (!text) return
        try {
          const parsed = JSON.parse(text)
          const values = Array.isArray(parsed) ? parsed : [parsed]
          values.forEach((value) => {
            const nextSummary =
              value && typeof value === "object"
                ? jsonLdSummary(value as Record<string, unknown>)
                : undefined
            const candidateRaw = [...rawJsonLd, value]
            const candidateSummary = nextSummary
              ? [...summary, nextSummary]
              : summary
            const candidateBytes = serializedByteLength({
              raw: candidateRaw,
              summary: candidateSummary,
            })
            if (candidateBytes > request.limits.maxJsonLdBytes) {
              jsonLdTruncated = true
              return
            }
            rawJsonLd.push(value)
            if (nextSummary) summary.push(nextSummary)
          })
        } catch (_) {
          addWarning(
            "json_ld_malformed",
            "A JSON-LD block could not be parsed.",
            "metadata.jsonLd"
          )
        }
      })
    if (jsonLdTruncated) {
      addMetadataTruncatedWarning(
        "metadata.jsonLd",
        "JSON-LD metadata was truncated to fit the configured size limit."
      )
    }

    const headings = Array.from(
      rootElement.querySelectorAll("h1, h2, h3, h4, h5, h6")
    )
      .slice(0, 200)
      .map((heading) => ({
        level: Number(heading.tagName.slice(1)),
        text: (heading.textContent ?? "").trim(),
        id: heading.id || undefined,
      }))
      .filter((heading) => heading.text)

    const linkElements = Array.from(rootElement.querySelectorAll("a[href]"))
    if (linkElements.length > request.limits.maxLinks) {
      addMetadataTruncatedWarning(
        "metadata.links",
        "Links were truncated to fit the configured item limit."
      )
    }
    const links = linkElements
      .slice(0, request.limits.maxLinks)
      .flatMap((link) => {
        const href = safeURL(link.getAttribute("href"), "metadata.links")
        if (!href) return []
        return [
          {
            text: (link.textContent ?? "").trim(),
            href,
            title: link.getAttribute("title") || undefined,
            rel: link.getAttribute("rel")?.split(/\s+/).filter(Boolean),
            target: link.getAttribute("target") || undefined,
            kind: "anchor",
          },
        ]
      })

    const imageElements = Array.from(rootElement.querySelectorAll("img[src]"))
    if (imageElements.length > request.limits.maxImages) {
      addMetadataTruncatedWarning(
        "metadata.images",
        "Images were truncated to fit the configured item limit."
      )
    }
    const images = imageElements
      .slice(0, request.limits.maxImages)
      .flatMap((image) => {
        const src = safeURL(image.getAttribute("src"), "metadata.images")
        if (!src) return []
        return [
          {
            src,
            alt: image.getAttribute("alt") || undefined,
            title: image.getAttribute("title") || undefined,
            width: (image as HTMLImageElement).width || undefined,
            height: (image as HTMLImageElement).height || undefined,
          },
        ]
      })

    return {
      openGraph,
      jsonLd: { raw: rawJsonLd, summary, truncated: jsonLdTruncated },
      headings,
      links,
      images,
    }
  }

  function jsonLdSummary(item: Record<string, unknown>) {
    return {
      type: item["@type"],
      name: item.name,
      headline: item.headline,
      description: item.description,
      url: item.url,
    }
  }

  const rootResult = extractionRoot()
  if ("error" in rootResult) return { error: rootResult.error }
  if (rootResult.empty) {
    return {
      status: "empty",
      warnings,
      selectorMatched: rootResult.selectorMatched,
      selectorMatchCount: rootResult.selectorMatchCount,
      contentSource: rootResult.contentSource,
      domRead: rootResult.domRead ?? true,
      truncation: { truncated: false, fields: [] },
    }
  }

  const root = rootResult.root ?? document.body ?? document.documentElement
  const text = readableText(root)
  let content: unknown
  let meta: unknown
  let contentSource: string | undefined = rootResult.contentSource

  if (request.mode === "selection") {
    const selection = selectionContent()
    content = { selection }
    contentSource =
      selection.source === "user-selection"
        ? "selection"
        : selection.source === "focused-input"
          ? "focused-input"
          : undefined
  } else if (request.mode === "metadata") {
    meta = metadata(root)
  } else if (request.mode === "links") {
    meta = { links: metadata(root).links }
  } else if (request.format === "text") {
    const value = truncateValue(text, contentLimit("text"), "content.text")
    content = {
      text: {
        value: value.value,
        length: value.length,
        truncated: value.truncated,
      },
    }
  } else if (request.format === "markdown") {
    addWarning(
      "content_unavailable",
      "Markdown output is derived from basic page text; rich Markdown structure is not available in V1.",
      "content.markdown"
    )
    const value = truncateValue(
      markdownFromText(document.title, location.href, text),
      contentLimit("markdown"),
      "content.markdown"
    )
    content = {
      markdown: {
        value: value.value,
        length: value.length,
        truncated: value.truncated,
      },
    }
  }

  return {
    status: warnings.length > 0 ? "partial" : "ok",
    content,
    metadata: meta,
    page: {
      language: document.documentElement.lang || undefined,
      canonicalUrl: document.querySelector<HTMLLinkElement>(
        'link[rel="canonical"]'
      )?.href,
      referrer: document.referrer || undefined,
    },
    selectorMatched: rootResult.selectorMatched,
    selectorMatchCount: rootResult.selectorMatchCount,
    contentSource,
    domRead: true,
    warnings,
    truncation: {
      truncated: truncationFields.length > 0,
      fields: truncationFields,
    },
  }
}
