import { log } from "../logger"
import { Command } from "../models/command"
import { Port } from "../models/port"
import { Response } from "../models/response"
import { delay } from "../utils"
import { getActiveTab, getContextWindow } from "./context/browser-target"
import { contextError } from "./context/errors"
import { executeContextExtraction } from "./context/extraction"
import { unsupportedFallback } from "./context/fallbacks"
import { buildPayload } from "./context/payload"
import { parseContextRequest } from "./context/request"
import { isUnsupportedContextUrl } from "./context/urls"

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
            "restricted_page",
            "Selector extraction is not available on privileged or restricted browser pages.",
            {
              selector: request.selector,
              url: activeTab.url,
              legacyCode: "unsupported_page",
            }
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
