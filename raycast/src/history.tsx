import {
  Action,
  ActionPanel,
  Alert,
  closeMainWindow,
  confirmAlert,
  Icon,
  Image,
  List,
  PopToRootType,
  showToast,
  Toast,
} from "@raycast/api";
import { getFavicon } from "@raycast/utils";
import { ReactElement, useEffect, useMemo, useState } from "react";
import { deleteHistoryItem, ensureFirefoxRunning, getHistoryChunks, openNewTab } from "./actions";
import { UnknownError } from "./components/Error";
import { COMMAND_NAME } from "./constants";
import type { HistoryItem } from "./interfaces";
import { filterHistoryItems } from "./historyMappers";

// Rendering every history item as a List.Item at once is what blew past
// Raycast's 100 MB extension JS heap limit on large histories (thousands of
// items) - mounting only one page at a time, growing via List's built-in
// pagination, keeps rendered-element memory bounded regardless of history
// size. The full list is still fetched and searched in memory; only
// rendering is paginated.
const PAGE_SIZE = 50;

export default function HistoryCommand(): ReactElement {
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorView, setErrorView] = useState<ReactElement | undefined>();
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      try {
        setIsLoading(true);
        if (!(await ensureFirefoxRunning())) return;
        if (cancelled) return;

        setHistoryItems([]);
        for await (const chunk of getHistoryChunks()) {
          if (cancelled) return;
          setHistoryItems((currentItems) => [...currentItems, ...chunk]);
        }
      } catch (_) {
        if (!cancelled) setErrorView(<UnknownError />);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sort only once loading completes; chunks already arrive in roughly
  // chronological order, so re-sorting the growing list on every chunk
  // would be wasted work for a large history.
  const sortedHistoryItems = useMemo(
    () => (isLoading ? historyItems : sortHistoryItems(historyItems)),
    [historyItems, isLoading],
  );

  const filteredHistoryItems = useMemo(
    () => filterHistoryItems(sortedHistoryItems, searchText),
    [sortedHistoryItems, searchText],
  );

  const visibleHistoryItems = useMemo(
    () => filteredHistoryItems.slice(0, (page + 1) * PAGE_SIZE),
    [filteredHistoryItems, page],
  );

  function handleSearchTextChange(text: string) {
    setPage(0);
    setSearchText(text);
  }

  if (errorView) return errorView;

  return (
    <List
      isLoading={isLoading}
      filtering={false}
      onSearchTextChange={handleSearchTextChange}
      navigationTitle={`${COMMAND_NAME} History`}
      pagination={{
        pageSize: PAGE_SIZE,
        hasMore: visibleHistoryItems.length < filteredHistoryItems.length,
        onLoadMore: () => setPage((currentPage) => currentPage + 1),
      }}
    >
      <List.Section title={`${filteredHistoryItems.length} History Items`}>
        {visibleHistoryItems.map((item) => (
          <HistoryListItem
            key={item.id}
            item={item}
            onDelete={() => setHistoryItems((currentItems) => currentItems.filter((current) => current.id !== item.id))}
          />
        ))}
      </List.Section>
    </List>
  );
}

function HistoryListItem(props: { item: HistoryItem; onDelete: () => void }) {
  const { item, onDelete } = props;
  const accessories = [
    item.visitCount ? { text: `${item.visitCount} visits`, tooltip: "Visit Count" } : undefined,
    item.lastVisitTime ? { text: formatLastVisitTime(item.lastVisitTime), tooltip: "Last Visit" } : undefined,
  ].filter((accessory): accessory is NonNullable<typeof accessory> => Boolean(accessory));

  return (
    <List.Item
      id={item.id}
      title={item.title}
      subtitle={item.domain}
      icon={getHistoryIcon(item.url)}
      accessories={accessories}
      actions={<HistoryActions item={item} onDelete={onDelete} />}
    />
  );
}

function HistoryActions(props: { item: HistoryItem; onDelete: () => void }) {
  const { item, onDelete } = props;

  return (
    <ActionPanel title={item.title}>
      <Action title="Open History Entry" icon={{ source: Icon.Globe }} onAction={() => openHistoryItem(item)} />
      <Action
        title="Delete History Item"
        icon={{ source: Icon.Trash }}
        style={Action.Style.Destructive}
        onAction={() => deleteHistoryItemWithConfirmation(item, onDelete)}
      />
      <Action.CopyToClipboard title="Copy URL" content={item.url} />
    </ActionPanel>
  );
}

async function openHistoryItem(item: HistoryItem) {
  openNewTab(item.url);
  await closeMainWindow({ clearRootSearch: true, popToRootType: PopToRootType.Immediate });
}

async function deleteHistoryItemWithConfirmation(item: HistoryItem, onDelete: () => void) {
  const confirmed = await confirmAlert({
    title: "Delete History Item?",
    message: `${item.title}\n${item.url}`,
    primaryAction: {
      title: "Delete",
      style: Alert.ActionStyle.Destructive,
    },
  });

  if (!confirmed) return;

  try {
    deleteHistoryItem(item);
    onDelete();
    await showToast({
      title: "Deleted History Item",
      style: Toast.Style.Success,
    });
  } catch (error) {
    await showToast({
      title: "Failed to Delete History Item",
      message: error instanceof Error ? error.message : undefined,
      style: Toast.Style.Failure,
    });
  }
}

function sortHistoryItems(items: HistoryItem[]): HistoryItem[] {
  return [...items].sort((first, second) => {
    if (first.lastVisitTime && second.lastVisitTime) return second.lastVisitTime - first.lastVisitTime;
    if (first.lastVisitTime) return -1;
    if (second.lastVisitTime) return 1;
    return 0;
  });
}

function getHistoryIcon(url: string): Image.ImageLike {
  try {
    return getFavicon(new URL(url).toString(), { mask: Image.Mask.RoundedRectangle });
  } catch (_) {
    return Icon.Clock;
  }
}

function formatLastVisitTime(lastVisitTime: number): string {
  return new Date(lastVisitTime).toLocaleDateString();
}
