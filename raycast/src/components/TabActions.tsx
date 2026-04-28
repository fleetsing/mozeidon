import {
  Action,
  ActionPanel,
  Alert,
  closeMainWindow,
  confirmAlert,
  Form,
  Icon,
  PopToRootType,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import {
  closeTab,
  createBookmark,
  deleteBookmark,
  duplicateTab,
  moveTabToEnd,
  moveTabToGroup,
  moveTabToStart,
  openNewTab,
  pinTab,
  switchTab,
  ungroupTab,
  unpinTab,
  updateBookmark,
} from "../actions";
import { TAB_TYPE } from "../constants";
import { Tab, TabGroup } from "../interfaces";
import { getAvailableBookmarkActionIds, validateBookmarkFolderPath } from "../bookmarkCommands";
import {
  formatTabGroupTitle,
  getAvailableTabActionIds,
  getMoveToGroupTargets,
  TabActionId,
} from "../tabActionCommands";

export class TabActions {
  public static NewTab = NewTabAction;
  public static OpenTabListItem = OpenTabListItemAction;
}

function NewTabAction({ query }: { query?: string }) {
  return (
    <ActionPanel title="New Tab">
      <OpenNewTabAction query={query || ""} />
      <Action onAction={() => openNewTab(query)} title={query ? `Search "${query}"` : "Open Empty Tab"} />
    </ActionPanel>
  );
}

function OpenTabListItemAction(props: {
  isLoading: boolean;
  type: TAB_TYPE;
  tab: Tab;
  onCloseTab: (() => void) | undefined;
  groups: TabGroup[];
  lastTabIndexByWindow: Map<number, number>;
  onRefreshOpenTabs: (() => Promise<void>) | undefined;
  onDeleteBookmark: (() => void) | undefined;
  onUpdateBookmark: ((tab: Tab) => void) | undefined;
}) {
  const {
    groups,
    isLoading,
    lastTabIndexByWindow,
    onCloseTab,
    onDeleteBookmark,
    onRefreshOpenTabs,
    onUpdateBookmark,
    tab,
    type,
  } = props;
  const availableActions = getAvailableTabActionIds(type, tab, groups, lastTabIndexByWindow);
  const availableBookmarkActions = getAvailableBookmarkActionIds(type, tab);

  return (
    <ActionPanel title={tab.title}>
      <GoToOpenTabAction tab={tab} type={type} isLoading={isLoading} />
      {availableBookmarkActions.includes("addBookmark") ? <AddBookmarkAction tab={tab} /> : undefined}
      {availableBookmarkActions.includes("editBookmark") ? (
        <EditBookmarkAction tab={tab} onUpdateBookmark={onUpdateBookmark} />
      ) : undefined}
      {availableBookmarkActions.includes("deleteBookmark") ? (
        <DeleteBookmarkAction tab={tab} onDeleteBookmark={onDeleteBookmark} />
      ) : undefined}
      {availableActions.includes("pin") ? <PinTabAction tab={tab} onRefreshOpenTabs={onRefreshOpenTabs} /> : undefined}
      {availableActions.includes("unpin") ? (
        <UnpinTabAction tab={tab} onRefreshOpenTabs={onRefreshOpenTabs} />
      ) : undefined}
      {availableActions.includes("duplicate") ? (
        <DuplicateTabAction tab={tab} onRefreshOpenTabs={onRefreshOpenTabs} />
      ) : undefined}
      {availableActions.includes("moveToStart") ? (
        <MoveTabToStartAction tab={tab} onRefreshOpenTabs={onRefreshOpenTabs} />
      ) : undefined}
      {availableActions.includes("moveToEnd") ? (
        <MoveTabToEndAction tab={tab} onRefreshOpenTabs={onRefreshOpenTabs} />
      ) : undefined}
      {availableActions.includes("moveToGroup") ? (
        <MoveTabToGroupAction tab={tab} groups={groups} onRefreshOpenTabs={onRefreshOpenTabs} />
      ) : undefined}
      {availableActions.includes("ungroup") ? (
        <UngroupTabAction tab={tab} onRefreshOpenTabs={onRefreshOpenTabs} />
      ) : undefined}
      {onCloseTab ? <CloseTabAction tab={tab} onCloseTab={onCloseTab} /> : undefined}
      <Action.CopyToClipboard title="Copy URL" content={tab.url} />
    </ActionPanel>
  );
}

function CloseTabAction(props: { tab: Tab; onCloseTab: () => void }) {
  async function handleAction() {
    closeTab(props.tab);
    props.onCloseTab();
    await showToast({
      title: "",
      message: `Closed Tab !`,
      style: Toast.Style.Success,
    });
  }
  return <Action title="Close Tab" icon={{ source: Icon.XMarkCircle }} onAction={handleAction} />;
}

function AddBookmarkAction(props: { tab: Tab }) {
  return (
    <Action.Push
      title={props.tab.active ? "Add Current Tab Bookmark" : "Add Bookmark"}
      icon={{ source: Icon.Bookmark }}
      target={<BookmarkForm mode="create" tab={props.tab} />}
    />
  );
}

function EditBookmarkAction(props: { tab: Tab; onUpdateBookmark: ((tab: Tab) => void) | undefined }) {
  return (
    <Action.Push
      title="Edit Bookmark"
      icon={{ source: Icon.Pencil }}
      target={<BookmarkForm mode="edit" tab={props.tab} onUpdateBookmark={props.onUpdateBookmark} />}
    />
  );
}

function DeleteBookmarkAction(props: { tab: Tab; onDeleteBookmark: (() => void) | undefined }) {
  async function handleAction() {
    const confirmed = await confirmAlert({
      title: "Delete Bookmark?",
      message: `${props.tab.title}\n${props.tab.url}`,
      primaryAction: {
        title: "Delete",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (!confirmed) return;

    try {
      deleteBookmark(props.tab);
      props.onDeleteBookmark?.();
      await showToast({
        title: "Deleted Bookmark",
        style: Toast.Style.Success,
      });
    } catch (error) {
      await showToast({
        title: "Failed to Delete Bookmark",
        message: error instanceof Error ? error.message : undefined,
        style: Toast.Style.Failure,
      });
    }
  }

  return (
    <Action
      title="Delete Bookmark"
      icon={{ source: Icon.Trash }}
      style={Action.Style.Destructive}
      onAction={handleAction}
    />
  );
}

function PinTabAction(props: { tab: Tab; onRefreshOpenTabs: (() => Promise<void>) | undefined }) {
  return (
    <Action
      title="Pin Tab"
      icon={{ source: Icon.Pin }}
      onAction={() =>
        handleTabMutation({
          actionId: "pin",
          action: () => pinTab(props.tab),
          onRefreshOpenTabs: props.onRefreshOpenTabs,
        })
      }
    />
  );
}

function UnpinTabAction(props: { tab: Tab; onRefreshOpenTabs: (() => Promise<void>) | undefined }) {
  return (
    <Action
      title="Unpin Tab"
      icon={{ source: Icon.PinDisabled }}
      onAction={() =>
        handleTabMutation({
          actionId: "unpin",
          action: () => unpinTab(props.tab),
          onRefreshOpenTabs: props.onRefreshOpenTabs,
        })
      }
    />
  );
}

function DuplicateTabAction(props: { tab: Tab; onRefreshOpenTabs: (() => Promise<void>) | undefined }) {
  return (
    <Action
      title="Duplicate Tab"
      icon={{ source: Icon.Duplicate }}
      onAction={() =>
        handleTabMutation({
          actionId: "duplicate",
          action: () => duplicateTab(props.tab),
          onRefreshOpenTabs: props.onRefreshOpenTabs,
        })
      }
    />
  );
}

function MoveTabToStartAction(props: { tab: Tab; onRefreshOpenTabs: (() => Promise<void>) | undefined }) {
  return (
    <Action
      title="Move Tab to Start"
      icon={{ source: Icon.ArrowUpCircle }}
      onAction={() =>
        handleTabMutation({
          actionId: "moveToStart",
          action: () => moveTabToStart(props.tab),
          onRefreshOpenTabs: props.onRefreshOpenTabs,
        })
      }
    />
  );
}

function MoveTabToEndAction(props: { tab: Tab; onRefreshOpenTabs: (() => Promise<void>) | undefined }) {
  return (
    <Action
      title="Move Tab to End"
      icon={{ source: Icon.ArrowDownCircle }}
      onAction={() =>
        handleTabMutation({
          actionId: "moveToEnd",
          action: () => moveTabToEnd(props.tab),
          onRefreshOpenTabs: props.onRefreshOpenTabs,
        })
      }
    />
  );
}

function MoveTabToGroupAction(props: {
  tab: Tab;
  groups: TabGroup[];
  onRefreshOpenTabs: (() => Promise<void>) | undefined;
}) {
  const groupTargets = getMoveToGroupTargets(props.tab, props.groups);

  return (
    <ActionPanel.Submenu title="Move Tab to Group" icon={{ source: Icon.Folder }}>
      {groupTargets.map((group) => (
        <Action
          key={`${group.windowId}:${group.id}`}
          title={formatTabGroupTitle(group)}
          onAction={() =>
            handleTabMutation({
              actionId: "moveToGroup",
              action: () => moveTabToGroup(props.tab, group.id),
              onRefreshOpenTabs: props.onRefreshOpenTabs,
            })
          }
        />
      ))}
    </ActionPanel.Submenu>
  );
}

function UngroupTabAction(props: { tab: Tab; onRefreshOpenTabs: (() => Promise<void>) | undefined }) {
  return (
    <Action
      title="Ungroup Tab"
      icon={{ source: Icon.MinusCircle }}
      onAction={() =>
        handleTabMutation({
          actionId: "ungroup",
          action: () => ungroupTab(props.tab),
          onRefreshOpenTabs: props.onRefreshOpenTabs,
        })
      }
    />
  );
}

function GoToOpenTabAction(props: { isLoading: boolean; tab: Tab; type: TAB_TYPE }) {
  const { isLoading, type, tab } = props;
  async function handleAction() {
    // prevent the user to open tab
    if (isLoading) {
      return;
    }
    switch (type) {
      case TAB_TYPE.OPENED_TABS:
        switchTab(tab);
        break;
      case TAB_TYPE.RECENTLY_CLOSED:
      case TAB_TYPE.BOOKMARKS:
        openNewTab(tab.url);
        break;
    }
    await closeMainWindow({ clearRootSearch: true, popToRootType: PopToRootType.Immediate });
  }
  return <Action title="Open Tab" icon={{ source: Icon.Eye }} onAction={handleAction} />;
}

function OpenNewTabAction(props: { query: string }) {
  async function handleAction() {
    openNewTab(props.query);

    await closeMainWindow({ clearRootSearch: true, popToRootType: PopToRootType.Immediate });
  }
  return <Action onAction={handleAction} title={props.query ? `Search "${props.query}"` : "Open Empty Tab"} />;
}

type BookmarkFormValues = {
  title: string;
  url: string;
  folderPath: string;
};

function BookmarkForm(props: { mode: "create" | "edit"; tab: Tab; onUpdateBookmark?: (tab: Tab) => void }) {
  const { pop } = useNavigation();

  async function handleSubmit(values: BookmarkFormValues) {
    const requiredFieldError = validateBookmarkRequiredFields(values);
    if (requiredFieldError) {
      await showToast({
        title: "Invalid Bookmark",
        message: requiredFieldError,
        style: Toast.Style.Failure,
      });
      return false;
    }

    const folderPathError = validateBookmarkFolderPath(values.folderPath);
    if (folderPathError) {
      await showToast({
        title: "Invalid Folder Path",
        message: folderPathError,
        style: Toast.Style.Failure,
      });
      return false;
    }

    try {
      if (props.mode === "create") {
        createBookmark({
          title: values.title,
          url: values.url,
          folderPath: values.folderPath,
        });
        await showToast({
          title: "Added Bookmark",
          style: Toast.Style.Success,
        });
      } else {
        const updated = updateBookmark({
          id: props.tab.id,
          title: getChangedValue(props.tab.title, values.title),
          url: getChangedValue(props.tab.url, values.url),
          folderPath: values.folderPath,
        });

        if (!updated) {
          await showToast({
            title: "No Bookmark Changes",
            style: Toast.Style.Success,
          });
          return false;
        }

        props.onUpdateBookmark?.(
          new Tab(
            props.tab.id,
            props.tab.pinned,
            props.tab.windowId,
            values.title.trim(),
            values.url.trim(),
            props.tab.domain,
            props.tab.active,
            props.tab.groupId,
            props.tab.group,
            props.tab.index,
            props.tab.lastAccessed,
          ),
        );
        await showToast({
          title: "Updated Bookmark",
          style: Toast.Style.Success,
        });
      }

      pop();
    } catch (error) {
      await showToast({
        title: props.mode === "create" ? "Failed to Add Bookmark" : "Failed to Update Bookmark",
        message: error instanceof Error ? error.message : undefined,
        style: Toast.Style.Failure,
      });
      return false;
    }
  }

  return (
    <Form
      navigationTitle={props.mode === "create" ? "Add Bookmark" : "Edit Bookmark"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={props.mode === "create" ? "Add Bookmark" : "Update Bookmark"}
            icon={{ source: props.mode === "create" ? Icon.Bookmark : Icon.Pencil }}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="title" title="Title" defaultValue={props.tab.title} />
      <Form.TextField id="url" title="URL" defaultValue={props.tab.url} />
      <Form.TextField id="folderPath" title="Folder Path" placeholder="/Optional/Folder/" />
    </Form>
  );
}

async function handleTabMutation(props: {
  actionId: TabActionId;
  action: () => void;
  onRefreshOpenTabs: (() => Promise<void>) | undefined;
}) {
  try {
    props.action();
    await props.onRefreshOpenTabs?.();
    await showToast({
      title: getTabActionSuccessTitle(props.actionId),
      style: Toast.Style.Success,
    });
  } catch (error) {
    await showToast({
      title: getTabActionFailureTitle(props.actionId),
      message: error instanceof Error ? error.message : undefined,
      style: Toast.Style.Failure,
    });
  }
}

function getChangedValue(originalValue: string, nextValue: string): string | undefined {
  const trimmedNextValue = nextValue.trim();
  if (!trimmedNextValue || trimmedNextValue === originalValue.trim()) return undefined;
  return trimmedNextValue;
}

function validateBookmarkRequiredFields(values: BookmarkFormValues): string | undefined {
  if (!values.title.trim()) return "Title is required.";
  if (!values.url.trim()) return "URL is required.";
  return undefined;
}

function getTabActionSuccessTitle(actionId: TabActionId): string {
  switch (actionId) {
    case "pin":
      return "Pinned Tab";
    case "unpin":
      return "Unpinned Tab";
    case "duplicate":
      return "Duplicated Tab";
    case "moveToStart":
      return "Moved Tab to Start";
    case "moveToEnd":
      return "Moved Tab to End";
    case "moveToGroup":
      return "Moved Tab to Group";
    case "ungroup":
      return "Ungrouped Tab";
  }
}

function getTabActionFailureTitle(actionId: TabActionId): string {
  switch (actionId) {
    case "pin":
      return "Failed to Pin Tab";
    case "unpin":
      return "Failed to Unpin Tab";
    case "duplicate":
      return "Failed to Duplicate Tab";
    case "moveToStart":
      return "Failed to Move Tab to Start";
    case "moveToEnd":
      return "Failed to Move Tab to End";
    case "moveToGroup":
      return "Failed to Move Tab to Group";
    case "ungroup":
      return "Failed to Ungroup Tab";
  }
}
