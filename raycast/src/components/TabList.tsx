import { Icon, Image, List } from "@raycast/api";
import { getFavicon } from "@raycast/utils";
import { TabActions } from "./index";
import { Tab, TabGroup } from "../interfaces";
import { SEARCH_ENGINE, TAB_TYPE } from "../constants";
import { buildTabKeywords, buildTabMetadata } from "../tabMetadata";

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
};

export class TabList {
  public static NewTabItem = NewTabItem;
  public static TabItem = TabItem;
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
        />
      }
      icon={getFavicon(tab.url, { mask: Image.Mask.RoundedRectangle })}
    />
  );
}
