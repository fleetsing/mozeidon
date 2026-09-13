import { ReactElement } from "react";
import { TabList } from "./components";
import { TAB_TYPE } from "./constants";
import { useOpenTabs } from "./hooks/useMozeidon";

export default function Command(): ReactElement {
  const [
    {
      data: { groups, tabs },
      isLoading,
      errorView,
    },
    refresh,
    setData,
  ] = useOpenTabs();

  return (
    <TabList.View
      navigationTitle="Zen Open Tabs"
      type={TAB_TYPE.OPENED_TABS}
      tabs={tabs}
      groups={groups}
      isLoading={isLoading}
      errorView={errorView}
      onCloseTab={(tab) =>
        setData({
          type: TAB_TYPE.OPENED_TABS,
          tabs: tabs.filter((t) => `${t.windowId}${t.id}` !== `${tab.windowId}${tab.id}`),
          groups,
        })
      }
      onRefreshOpenTabs={refresh}
      onDeleteBookmark={undefined}
      onUpdateBookmark={undefined}
    />
  );
}
