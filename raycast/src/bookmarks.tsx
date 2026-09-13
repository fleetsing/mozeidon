import { ReactElement } from "react";
import { TabList } from "./components";
import { TAB_TYPE } from "./constants";
import { useBookmarksList } from "./hooks/useMozeidon";

export default function Command(): ReactElement {
  const [
    {
      data: { tabs },
      isLoading,
      errorView,
    },
    ,
    setData,
  ] = useBookmarksList();

  return (
    <TabList.View
      navigationTitle="Zen Bookmarks"
      type={TAB_TYPE.BOOKMARKS}
      tabs={tabs}
      groups={[]}
      isLoading={isLoading}
      errorView={errorView}
      onCloseTab={undefined}
      onRefreshOpenTabs={undefined}
      onDeleteBookmark={(tab) =>
        setData((prev) => ({
          ...prev,
          type: TAB_TYPE.BOOKMARKS,
          tabs: prev.tabs.filter((t) => t.id !== tab.id),
        }))
      }
      onUpdateBookmark={(tab, updatedTab) =>
        setData((prev) => ({
          ...prev,
          type: TAB_TYPE.BOOKMARKS,
          tabs: prev.tabs.map((t) => (t.id === tab.id ? updatedTab : t)),
        }))
      }
    />
  );
}
