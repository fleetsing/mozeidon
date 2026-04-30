import browser from "webextension-polyfill"

import type { ContextWindow } from "./types"

export async function getActiveTab() {
  const tabs = await browser.tabs.query({
    active: true,
    lastFocusedWindow: true,
  })
  return tabs[0]
}

export async function getContextWindow(
  tab: browser.Tabs.Tab
): Promise<ContextWindow> {
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
