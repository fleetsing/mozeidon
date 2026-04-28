import { runAppleScript } from "@raycast/utils";
import type { MozeidonBookmark, MozeidonGroup, MozeidonTab, Tab, TabState } from "../interfaces";
import { execSync } from "child_process";
import {
  FIREFOX_OPEN_COMMAND,
  MOZEIDON,
  MOZEIDON_DOCUMENTATION_URL,
  PROFILE_ID,
  SEARCH_ENGINE,
  SEARCH_ENGINES,
  TABS_FALLBACK,
  TAB_TYPE,
} from "../constants";
import {
  buildNewTabArgs,
  MozeidonClientError,
  parseMozeidonJson,
  runMozeidon,
  runMozeidonJson,
  streamMozeidonLines,
} from "../mozeidonClient";
import {
  hasGroupMetadata,
  mapMozeidonBookmarksToTabs,
  mapMozeidonGroupsToTabGroups,
  mapMozeidonTabsToState,
  MozeidonTabsPayload,
} from "../tabMappers";
import {
  buildDuplicateTabArgs,
  buildMoveTabToEndArgs,
  buildMoveTabToGroupArgs,
  buildMoveTabToStartArgs,
  buildPinTabArgs,
  buildUngroupTabArgs,
  buildUnpinTabArgs,
} from "../tabActionCommands";

export function openNewTab(queryText: string | null | undefined): void {
  runMozeidon(buildNewTabArgs(queryText, SEARCH_ENGINES[SEARCH_ENGINE]), getMozeidonOptions());
  openFirefox();
}

export function switchTab(tab: Tab): void {
  runMozeidon(["tabs", "switch", `${tab.windowId}:${tab.id}`], getMozeidonOptions());
  openFirefox();
}

export function closeTab(tab: Tab): void {
  runMozeidon(["tabs", "close", `${tab.windowId}:${tab.id}`], getMozeidonOptions());
}

export function pinTab(tab: Tab): void {
  runMozeidon(buildPinTabArgs(tab), getMozeidonOptions());
}

export function unpinTab(tab: Tab): void {
  runMozeidon(buildUnpinTabArgs(tab), getMozeidonOptions());
}

export function duplicateTab(tab: Tab): void {
  runMozeidon(buildDuplicateTabArgs(tab), getMozeidonOptions());
}

export function moveTabToStart(tab: Tab): void {
  runMozeidon(buildMoveTabToStartArgs(tab), getMozeidonOptions());
}

export function moveTabToEnd(tab: Tab): void {
  runMozeidon(buildMoveTabToEndArgs(tab), getMozeidonOptions());
}

export function moveTabToGroup(tab: Tab, groupId: number): void {
  runMozeidon(buildMoveTabToGroupArgs(tab, groupId), getMozeidonOptions());
}

export function ungroupTab(tab: Tab): void {
  runMozeidon(buildUngroupTabArgs(tab), getMozeidonOptions());
}

export function fetchOpenTabs(): TabState {
  try {
    const parsedTabs = runMozeidonJson<MozeidonTabsPayload>(["tabs", "get", "--with-groups"], {
      ...getMozeidonOptions(),
      context: "tabs get --with-groups",
    });
    // Supported --with-groups output includes a groups array, even when empty.
    if (hasGroupMetadata(parsedTabs)) {
      return mapMozeidonTabsToState(parsedTabs, TAB_TYPE.OPENED_TABS, { sortByLastAccessed: true });
    }
  } catch (error) {
    if (!(error instanceof MozeidonClientError) || error.code === "not_found") throw error;
  }

  const parsedTabs = runMozeidonJson<{ data: MozeidonTab[] }>(["tabs", "get"], {
    ...getMozeidonOptions(),
    context: "tabs get",
    fallback: TABS_FALLBACK,
  });
  return mapMozeidonTabsToState({ ...parsedTabs, groups: fetchMozeidonGroupsIfAvailable() }, TAB_TYPE.OPENED_TABS, {
    sortByLastAccessed: true,
  });
}

export function fetchRecentlyClosedTabs(): TabState {
  const parsedTabs = runMozeidonJson<{ data: MozeidonTab[] }>(["tabs", "get", "--closed"], {
    ...getMozeidonOptions(),
    context: "tabs get --closed",
    fallback: TABS_FALLBACK,
  });
  return mapMozeidonTabsToState(parsedTabs, TAB_TYPE.RECENTLY_CLOSED);
}

export async function* getBookmarksChunks() {
  for await (const chunk of streamMozeidonLines(["bookmarks", "-c", "1000"], getMozeidonOptions())) {
    const { data: parsedBookmarks } = parseMozeidonJson<{ data: MozeidonBookmark[] }>(chunk, "bookmarks -c 1000");
    yield mapMozeidonBookmarksToTabs(parsedBookmarks);
  }
}

export function fetchTabGroups() {
  const parsedGroups = runMozeidonJson<{ data: MozeidonGroup[] }>(["groups", "get"], {
    ...getMozeidonOptions(),
    context: "groups get",
    fallback: TABS_FALLBACK,
  });
  return mapMozeidonGroupsToTabGroups(parsedGroups.data) ?? [];
}

export function openFirefox() {
  execSync(FIREFOX_OPEN_COMMAND);
}

export function openFirefoxAtMozeidonPage() {
  execSync(`${FIREFOX_OPEN_COMMAND} ${MOZEIDON_DOCUMENTATION_URL}`);
}

export async function startFirefox() {
  await runAppleScript(`
try
  tell application id "app.zen-browser.zen" to activate
end try
`);
}

export async function isFirefoxRunning() {
  const isFirefoxRunning = await runAppleScript(`
try
  if application id "app.zen-browser.zen" is running then
    return true
  else
    return false
  end if
on error
  return false
end try
`);
  return isFirefoxRunning !== "false";
}

function getMozeidonOptions() {
  return {
    executable: MOZEIDON,
    profileId: PROFILE_ID,
  };
}

function fetchMozeidonGroupsIfAvailable(): MozeidonGroup[] | undefined {
  try {
    const parsedGroups = runMozeidonJson<{ data: MozeidonGroup[] }>(["groups", "get"], {
      ...getMozeidonOptions(),
      context: "groups get",
      fallback: TABS_FALLBACK,
    });
    return parsedGroups.data;
  } catch (error) {
    if (error instanceof MozeidonClientError) return undefined;
    throw error;
  }
}
