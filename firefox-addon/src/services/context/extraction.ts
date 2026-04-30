import browser from "webextension-polyfill"

import { log } from "../../logger"
import { permissionFallback } from "./fallbacks"
import { createInjectedExtractorCode } from "./injected-extractor"
import type { ContextRequest, ExtractedContext } from "./types"

export async function executeContextExtraction(
  tabId: number,
  request: ContextRequest
) {
  try {
    const results = await browser.tabs.executeScript(tabId, {
      code: createInjectedExtractorCode(request),
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
