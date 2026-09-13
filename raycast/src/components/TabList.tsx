import { Icon, Image, List } from "@raycast/api";
import { getFavicon } from "@raycast/utils";
import { ReactNode, useState } from "react";
import { TabActions } from "./index";
import { Tab, TabGroup } from "../interfaces";
import { SEARCH_ENGINE, TAB_TYPE } from "../constants";
import { buildLastTabIndexByWindow } from "../tabActionCommands";
import { buildTabKeywords, buildTabMetadata, getDistinctWindowCount } from "../tabMetadata";

type NewTabItemProps = { searchText?: string };
type TabItemProps = {
  isLoading: boolean;
  type: TAB_TYPE;
  tab: Tab;
  windowCount: number;
  onCloseTab: (() => void) | undefined;
  groups: TabGroup[];
  lastTabIndexByWindow: Map<number, number>;
  onRefreshOpenTabs: (() => Promise<void>) | undefined;
  onDeleteBookmark: (() => void) | undefined;
  onUpdateBookmark: ((tab: Tab) => void) | undefined;
};

type TabListViewProps = {
  navigationTitle: string;
  type: TAB_TYPE;
  tabs: Tab[];
  groups: TabGroup[] | undefined;
  isLoading: boolean;
  errorView: ReactNode;
  onCloseTab: ((tab: Tab) => void) | undefined;
  onRefreshOpenTabs: (() => Promise<void>) | undefined;
  onDeleteBookmark: ((tab: Tab) => void) | undefined;
  onUpdateBookmark: ((tab: Tab, updatedTab: Tab) => void) | undefined;
};

export class TabList {
  public static NewTabItem = NewTabItem;
  public static TabItem = TabItem;
  public static View = TabListView;
}

function TabListView({
  navigationTitle,
  type,
  tabs,
  groups,
  isLoading,
  errorView,
  onCloseTab,
  onRefreshOpenTabs,
  onDeleteBookmark,
  onUpdateBookmark,
}: TabListViewProps) {
  const [searchText, setSearchText] = useState<string>("");
  const windowCount = getDistinctWindowCount(tabs);
  const lastTabIndexByWindow = buildLastTabIndexByWindow(tabs);

  if (errorView) return errorView;
  return (
    <List
      isLoading={isLoading}
      throttle={true}
      onSearchTextChange={setSearchText}
      filtering={{ keepSectionOrder: true }}
      navigationTitle={navigationTitle}
    >
      <List.Section title={`${tabs.length} ${type}`}>
        {tabs.map((tab) => (
          <TabItem
            isLoading={isLoading}
            type={type}
            tab={tab}
            windowCount={windowCount}
            key={tab.id.toString()}
            onCloseTab={onCloseTab ? () => onCloseTab(tab) : undefined}
            groups={groups ?? []}
            lastTabIndexByWindow={lastTabIndexByWindow}
            onRefreshOpenTabs={onRefreshOpenTabs}
            onDeleteBookmark={onDeleteBookmark ? () => onDeleteBookmark(tab) : undefined}
            onUpdateBookmark={onUpdateBookmark ? (updatedTab: Tab) => onUpdateBookmark(tab, updatedTab) : undefined}
          />
        ))}
      </List.Section>
      <List.Section title="New Tab">
        <NewTabItem searchText={searchText} />
      </List.Section>
    </List>
  );
}

function NewTabItem({ searchText }: NewTabItemProps) {
  return (
    <List.Item
      title={!searchText ? "Open Empty Tab" : `Search ${SEARCH_ENGINE} "${searchText}"`}
      icon={{ source: !searchText ? Icon.Plus : Icon.MagnifyingGlass }}
      actions={<TabActions.NewTab query={searchText} />}
    />
  );
}

function TabItem({
  isLoading,
  type,
  tab,
  windowCount,
  onCloseTab,
  groups,
  lastTabIndexByWindow,
  onRefreshOpenTabs,
  onDeleteBookmark,
  onUpdateBookmark,
}: TabItemProps) {
  const metadata = buildTabMetadata(tab, type === TAB_TYPE.OPENED_TABS ? windowCount : 1);
  const accessories = [
    metadata.isPinned ? { icon: Icon.Pin, tooltip: "Pinned" } : undefined,
    type === TAB_TYPE.OPENED_TABS && metadata.groupTitle
      ? { tag: metadata.groupTitle, tooltip: "Tab Group" }
      : undefined,
    type === TAB_TYPE.OPENED_TABS && metadata.windowLabel
      ? { text: metadata.windowLabel, tooltip: `Window ${tab.windowId}` }
      : undefined,
    type === TAB_TYPE.OPENED_TABS && metadata.isActive ? { tag: "Active", tooltip: "Active Tab" } : undefined,
  ].filter((accessory): accessory is NonNullable<typeof accessory> => Boolean(accessory));

  return (
    <List.Item
      id={tab.id.toString()}
      title={tab.title}
      subtitle={tab.domain}
      keywords={
        type === TAB_TYPE.OPENED_TABS ? buildTabKeywords(tab, windowCount) : [tab.domain, tab.urlWithoutScheme()]
      }
      accessories={accessories}
      actions={
        <TabActions.OpenTabListItem
          tab={tab}
          type={type}
          isLoading={isLoading}
          onCloseTab={onCloseTab}
          groups={groups}
          lastTabIndexByWindow={lastTabIndexByWindow}
          onRefreshOpenTabs={onRefreshOpenTabs}
          onDeleteBookmark={onDeleteBookmark}
          onUpdateBookmark={onUpdateBookmark}
        />
      }
      icon={getFavicon(tab.url, { mask: Image.Mask.RoundedRectangle })}
    />
  );
}
