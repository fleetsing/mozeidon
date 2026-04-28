import { Tab } from "./interfaces";

export type TabMetadata = {
  groupTitle?: string;
  isActive: boolean;
  isPinned: boolean;
  windowLabel?: string;
};

export function getDistinctWindowCount(tabs: Tab[]): number {
  return new Set(tabs.map((tab) => tab.windowId)).size;
}

export function buildTabMetadata(tab: Tab, windowCount: number): TabMetadata {
  return {
    groupTitle: tab.group?.title ?? undefined,
    isActive: tab.active,
    isPinned: tab.pinned,
    windowLabel: windowCount > 1 ? `W${tab.windowId}` : undefined,
  };
}

export function buildTabKeywords(tab: Tab, windowCount: number): string[] {
  return [
    tab.domain,
    tab.urlWithoutScheme(),
    tab.group?.title,
    windowCount > 1 ? `window ${tab.windowId}` : undefined,
    tab.pinned ? "pinned" : undefined,
    tab.active ? "active" : undefined,
  ].filter((keyword): keyword is string => Boolean(keyword));
}
