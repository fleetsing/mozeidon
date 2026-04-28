import type { TAB_TYPE } from "./constants";
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
  tabs: Tab[] = [],
): TabActionId[] {
  if (type !== "Opened Tabs") return [];

  const actions: TabActionId[] = [];

  actions.push(tab.pinned ? "unpin" : "pin");
  actions.push("duplicate");

  if (tab.index !== 0) actions.push("moveToStart");
  if (!isLastTabInWindow(tab, tabs)) actions.push("moveToEnd");
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

function buildUpdateTabArgs(tab: Tab, ...args: string[]): string[] {
  return ["tabs", "update", "--tab-id", tab.id, "--window-id", tab.windowId.toString(), ...args];
}

function isLastTabInWindow(tab: Tab, tabs: Tab[]): boolean {
  if (tab.index === undefined || tabs.length === 0) return false;

  const windowTabs = tabs.filter((candidate) => candidate.windowId === tab.windowId);
  if (windowTabs.length === 0 || windowTabs.some((candidate) => candidate.index === undefined)) return false;

  const lastIndex = Math.max(...windowTabs.map((candidate) => candidate.index ?? -1));
  return tab.index === lastIndex;
}
