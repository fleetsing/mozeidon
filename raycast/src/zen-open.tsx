import { Icon, List } from "@raycast/api";
import { ReactElement, useState } from "react";
import { TabActions } from "./components";
import { SEARCH_ENGINE } from "./constants";
import { parseAsUrl } from "./mozeidonClient";

export default function Command(): ReactElement {
  const [searchText, setSearchText] = useState<string>("");
  const url = searchText ? parseAsUrl(searchText) : undefined;

  return (
    <List onSearchTextChange={setSearchText} navigationTitle="Zen Open">
      <List.Item
        title={
          !searchText ? "Open Empty Tab" : url ? `Open "${url.toString()}"` : `Search ${SEARCH_ENGINE} "${searchText}"`
        }
        icon={{ source: !searchText ? Icon.Plus : url ? Icon.Link : Icon.MagnifyingGlass }}
        actions={<TabActions.NewTab query={searchText} />}
      />
    </List>
  );
}
