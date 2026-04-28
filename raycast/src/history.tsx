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
import { deleteHistoryItem, fetchHistory, isFirefoxRunning, openNewTab, startFirefox } from "./actions";
import { UnknownError } from "./components/Error";
import { COMMAND_NAME } from "./constants";
import type { HistoryItem } from "./interfaces";
import { urlWithoutScheme } from "./historyMappers";

export default function HistoryCommand(): ReactElement {
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorView, setErrorView] = useState<ReactElement | undefined>();

  useEffect(() => {
    async function loadHistory() {
      try {
        setIsLoading(true);
        const isBrowserRunning = await isFirefoxRunning();
        if (!isBrowserRunning) {
          await startFirefox();
          await closeMainWindow({ clearRootSearch: true, popToRootType: PopToRootType.Immediate });
          return;
        }

        setHistoryItems(fetchHistory());
      } catch (_) {
        setErrorView(<UnknownError />);
      } finally {
        setIsLoading(false);
      }
    }

    loadHistory();
  }, []);

  const sortedHistoryItems = useMemo(() => sortHistoryItems(historyItems), [historyItems]);

  if (errorView) return errorView;

  return (
    <List isLoading={isLoading} throttle={true} navigationTitle={`${COMMAND_NAME} History`}>
      <List.Section title={`${sortedHistoryItems.length} History Items`}>
        {sortedHistoryItems.map((item) => (
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
      keywords={[item.url, urlWithoutScheme(item.url), item.domain, item.visitCount?.toString() ?? ""]}
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
