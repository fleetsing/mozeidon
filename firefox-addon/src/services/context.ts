import { log } from "../logger"
import { Command } from "../models/command"
import { Port } from "../models/port"
import { Response } from "../models/response"
import { delay } from "../utils"
import {
  getActiveTab,
  getContextWindow,
  getTargetTab,
} from "./context/browser-target"
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

    let tab: Awaited<ReturnType<typeof getActiveTab>> | undefined
    if (request.target) {
      const targetResult = await getTargetTab(request.target)
      if ("error" in targetResult) {
        port.postMessage(
          Response.data(
            contextError(
              targetResult.error.code,
              targetResult.error.message,
              targetResult.error.details
            )
          )
        )
        await delay(5)
        return port.postMessage(Response.end())
      }
      tab = targetResult.tab
    } else {
      tab = await getActiveTab()
    }

    if (!tab || tab.id === undefined) {
      port.postMessage(
        Response.data(
          contextError("no_active_tab", "No active Zen tab is available.")
        )
      )
      await delay(5)
      return port.postMessage(Response.end())
    }

    const window = await getContextWindow(tab)
    const unsupported = isUnsupportedContextUrl(tab.url)
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
              url: tab.url,
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
          buildPayload(request, tab, window, unsupportedFallback(request, tab))
        )
      )
      await delay(5)
      return port.postMessage(Response.end())
    }

    const extracted = await executeContextExtraction(tab.id, request)
    port.postMessage(
      Response.data(buildPayload(request, tab, window, extracted))
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
