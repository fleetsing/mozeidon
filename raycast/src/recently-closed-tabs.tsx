import { ReactElement } from "react";
import { TabList } from "./components";
import { TAB_TYPE } from "./constants";
import { useRecentlyClosedTabs } from "./hooks/useMozeidon";

export default function Command(): ReactElement {
  const [
    {
      data: { tabs },
      isLoading,
      errorView,
    },
  ] = useRecentlyClosedTabs();

  return (
    <TabList.View
      navigationTitle="Zen Recently Closed Tabs"
      type={TAB_TYPE.RECENTLY_CLOSED}
      tabs={tabs}
      groups={[]}
      isLoading={isLoading}
      errorView={errorView}
      onCloseTab={undefined}
      onRefreshOpenTabs={undefined}
      onDeleteBookmark={undefined}
      onUpdateBookmark={undefined}
    />
  );
}
