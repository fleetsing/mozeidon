import { Action, ActionPanel, closeMainWindow, Icon, PopToRootType, showToast, Toast } from "@raycast/api";
import {
  closeTab,
  duplicateTab,
  moveTabToEnd,
  moveTabToGroup,
  moveTabToStart,
  openNewTab,
  pinTab,
  switchTab,
  ungroupTab,
  unpinTab,
} from "../actions";
import { TAB_TYPE } from "../constants";
import { Tab, TabGroup } from "../interfaces";
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
  tabs: Tab[];
  onRefreshOpenTabs: (() => Promise<void>) | undefined;
}) {
  const { groups, isLoading, onCloseTab, onRefreshOpenTabs, tab, tabs, type } = props;
  const availableActions = getAvailableTabActionIds(type, tab, groups, tabs);

  return (
    <ActionPanel title={tab.title}>
      <GoToOpenTabAction tab={tab} type={type} isLoading={isLoading} />
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
