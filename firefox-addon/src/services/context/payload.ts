import type browser from "webextension-polyfill"

import { contextError } from "./errors"
import { fallbackContent } from "./fallbacks"
import { capabilitiesForWarnings, permissionsForWarnings } from "./permissions"
import { mergeTruncation } from "./truncation"
import type {
  ContextRequest,
  ContextStatus,
  ContextWindow,
  ExtractedContext,
} from "./types"
import { domainFromUrl } from "./urls"

export function buildPayload(
  request: ContextRequest,
  tab: browser.Tabs.Tab,
  window: ContextWindow,
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
