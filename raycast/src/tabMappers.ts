import { MozeidonBookmark, MozeidonTab, Tab, TabState } from "./interfaces";
import type { TAB_TYPE } from "./constants";

export function mapMozeidonTabsToState(parsedTabs: { data: MozeidonTab[] }, type: TAB_TYPE): TabState {
  return {
    type,
    tabs: parsedTabs.data.map(
      (mozTab) =>
        new Tab(
          mozTab.id.toString(),
          mozTab.pinned,
          mozTab.windowId,
          mozTab.title,
          mozTab.url,
          mozTab.domain,
          mozTab.active,
        ),
    ),
  };
}

export function mapMozeidonBookmarksToTabs(bookmarks: MozeidonBookmark[]): Tab[] {
  return bookmarks.map(
    (mozBookmark) => new Tab(mozBookmark.id, false, 0, mozBookmark.title, mozBookmark.url, mozBookmark.parent, false),
  );
}
