import type { ContextRequest, ContextWarning, ExtractedContext } from "./types"

export function createInjectedExtractorCode(request: ContextRequest) {
  return `(${injectedExtractor})(${JSON.stringify(request)})`
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
