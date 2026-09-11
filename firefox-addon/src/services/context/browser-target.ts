import browser from "webextension-polyfill"

import type { ContextTarget, ContextWindow } from "./types"
import { resolveTargetTab, type TargetTabResult } from "./target"

export type { TargetTabResult } from "./target"

export async function getActiveTab() {
  const tabs = await browser.tabs.query({
    active: true,
    lastFocusedWindow: true,
  })
  return tabs[0]
}

export async function getTargetTab(target: ContextTarget): Promise<TargetTabResult> {
  let tab: browser.Tabs.Tab | undefined
  try {
    tab = await browser.tabs.get(target.tabId)
  } catch (_) {
    tab = undefined
  }

  return resolveTargetTab(tab, target)
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
