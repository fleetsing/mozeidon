import { Icon, List } from "@raycast/api";
import { ReactElement, useState } from "react";
import { TabActions } from "./components";
import { SEARCH_ENGINE } from "./constants";

export default function Command(): ReactElement {
  const [searchText, setSearchText] = useState<string>("");

  return (
    <List onSearchTextChange={setSearchText} navigationTitle="Zen Open">
      <List.Item
        title={!searchText ? "Open Empty Tab" : `Search ${SEARCH_ENGINE} "${searchText}"`}
        icon={{ source: !searchText ? Icon.Plus : Icon.MagnifyingGlass }}
        actions={<TabActions.NewTab query={searchText} />}
      />
    </List>
  );
}
