import { TAB_TYPE } from "./tabTypes";
import { Tab, TabGroup } from "./interfaces";

export type TabActionId = "pin" | "unpin" | "duplicate" | "moveToStart" | "moveToEnd" | "moveToGroup" | "ungroup";

export function buildPinTabArgs(tab: Tab): string[] {
  return buildUpdateTabArgs(tab, "--pin=true");
}

export function buildUnpinTabArgs(tab: Tab): string[] {
  return buildUpdateTabArgs(tab, "--pin=false");
}

export function buildDuplicateTabArgs(tab: Tab): string[] {
  return ["tabs", "duplicate", "--tab-id", tab.id, "--window-id", tab.windowId.toString()];
}

export function buildMoveTabToStartArgs(tab: Tab): string[] {
  return buildUpdateTabArgs(tab, "--tab-index", "0");
}

export function buildMoveTabToEndArgs(tab: Tab): string[] {
  return buildUpdateTabArgs(tab, "--tab-index", "-1");
}

export function buildMoveTabToGroupArgs(tab: Tab, groupId: number): string[] {
  return buildUpdateTabArgs(tab, "--group-id", groupId.toString());
}

export function buildUngroupTabArgs(tab: Tab): string[] {
  return buildUpdateTabArgs(tab, "--group-id", "-1");
}

export function getAvailableTabActionIds(
  type: TAB_TYPE,
  tab: Tab,
  groups: TabGroup[] = [],
  lastTabIndexByWindow?: Map<number, number>,
): TabActionId[] {
  if (type !== TAB_TYPE.OPENED_TABS) return [];

  const actions: TabActionId[] = [];

  actions.push(tab.pinned ? "unpin" : "pin");
  actions.push("duplicate");

  if (tab.index !== 0) actions.push("moveToStart");
  if (!isLastTabInWindow(tab, lastTabIndexByWindow)) actions.push("moveToEnd");
  if (getMoveToGroupTargets(tab, groups).length > 0) actions.push("moveToGroup");
  if (tab.groupId !== undefined) actions.push("ungroup");

  return actions;
}

export function getMoveToGroupTargets(tab: Tab, groups: TabGroup[]): TabGroup[] {
  const seenGroupIds = new Set<number>();

  return groups.filter((group) => {
    if (!Number.isFinite(group.id) || group.id <= 0) return false;
    if (group.windowId !== tab.windowId) return false;
    if (group.id === tab.groupId) return false;
    if (seenGroupIds.has(group.id)) return false;
    seenGroupIds.add(group.id);
    return true;
  });
}

export function formatTabGroupTitle(group: TabGroup): string {
  return group.title?.trim() || `Group ${group.id}`;
}

export function buildLastTabIndexByWindow(tabs: Tab[]): Map<number, number> {
  const lastTabIndexByWindow = new Map<number, number>();
  const windowsWithMissingIndex = new Set<number>();

  for (const tab of tabs) {
    if (tab.index === undefined) {
      windowsWithMissingIndex.add(tab.windowId);
      continue;
    }

    const currentLastIndex = lastTabIndexByWindow.get(tab.windowId);
    if (currentLastIndex === undefined || tab.index > currentLastIndex) {
      lastTabIndexByWindow.set(tab.windowId, tab.index);
    }
  }

  for (const windowId of windowsWithMissingIndex) {
    lastTabIndexByWindow.delete(windowId);
  }

  return lastTabIndexByWindow;
}

function buildUpdateTabArgs(tab: Tab, ...args: string[]): string[] {
  return ["tabs", "update", "--tab-id", tab.id, "--window-id", tab.windowId.toString(), ...args];
}

function isLastTabInWindow(tab: Tab, lastTabIndexByWindow?: Map<number, number>): boolean {
  if (tab.index === undefined || !lastTabIndexByWindow) return false;

  const lastIndex = lastTabIndexByWindow.get(tab.windowId);
  if (lastIndex === undefined) return false;
  return tab.index === lastIndex;
}
