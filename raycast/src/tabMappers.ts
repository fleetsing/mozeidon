import { MozeidonBookmark, MozeidonGroup, MozeidonTab, Tab, TabGroup, TabState } from "./interfaces";
import type { TAB_TYPE } from "./constants";

export type MozeidonTabsPayload = {
  data: MozeidonTab[];
  groups?: MozeidonGroup[];
};

type MapMozeidonTabsOptions = {
  sortByLastAccessed?: boolean;
};

export function mapMozeidonTabsToState(
  parsedTabs: MozeidonTabsPayload,
  type: TAB_TYPE,
  options: MapMozeidonTabsOptions = {},
): TabState {
  const groupsById = indexGroupsById(parsedTabs.groups);
  const tabs = parsedTabs.data.map(
    (mozTab) =>
      new Tab(
        mozTab.id.toString(),
        mozTab.pinned,
        mozTab.windowId,
        mozTab.title,
        mozTab.url,
        mozTab.domain,
        mozTab.active,
        mozTab.groupId,
        getGroupForTab(mozTab, groupsById),
        getValidNumber(mozTab.index),
        getValidNumber(mozTab.lastAccessed),
      ),
  );

  return {
    type,
    tabs: options.sortByLastAccessed ? sortTabsByLastAccessed(tabs) : tabs,
  };
}

export function mapMozeidonBookmarksToTabs(bookmarks: MozeidonBookmark[]): Tab[] {
  return bookmarks.map(
    (mozBookmark) => new Tab(mozBookmark.id, false, 0, mozBookmark.title, mozBookmark.url, mozBookmark.parent, false),
  );
}

export function hasGroupMetadata(payload: MozeidonTabsPayload): boolean {
  return Array.isArray(payload.groups);
}

export function sortTabsByLastAccessed(tabs: Tab[]): Tab[] {
  return [...tabs].sort((firstTab, secondTab) => {
    if (firstTab.lastAccessed && secondTab.lastAccessed) return secondTab.lastAccessed - firstTab.lastAccessed;
    if (firstTab.lastAccessed) return -1;
    if (secondTab.lastAccessed) return 1;
    return 0;
  });
}

function indexGroupsById(groups: MozeidonGroup[] | undefined): Map<number, TabGroup> {
  return new Map(
    (groups ?? []).map((group) => [
      group.id,
      {
        id: group.id,
        windowId: group.windowId,
        title: group.title,
        color: group.color,
      },
    ]),
  );
}

function getGroupForTab(tab: MozeidonTab, groupsById: Map<number, TabGroup>): TabGroup | null {
  if (tab.groupId === undefined) return null;
  return groupsById.get(tab.groupId) ?? null;
}

function getValidNumber(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}
