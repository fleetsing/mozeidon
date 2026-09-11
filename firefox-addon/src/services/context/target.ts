import type browser from "webextension-polyfill"

import type { ContextTarget } from "./types"

export type TargetTabResult =
  | { tab: browser.Tabs.Tab }
  | { error: { code: string; message: string; details: Record<string, unknown> } }

export function resolveTargetTab(
  tab: browser.Tabs.Tab | undefined,
  target: ContextTarget
): TargetTabResult {
  if (!tab || tab.id === undefined || tab.windowId !== target.windowId) {
    return {
      error: {
        code: "tab_not_found",
        message: "The requested Zen tab was not found.",
        details: { tabId: target.tabId, windowId: target.windowId },
      },
    }
  }

  return { tab }
}
