import { runAppleScript } from "@raycast/utils";
import type { MozeidonBookmark, MozeidonTab, Tab, TabState } from "../interfaces";
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
  parseMozeidonJson,
  runMozeidon,
  runMozeidonJson,
  streamMozeidonLines,
} from "../mozeidonClient";
import { mapMozeidonBookmarksToTabs, mapMozeidonTabsToState } from "../tabMappers";

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

export function fetchOpenTabs(): TabState {
  const parsedTabs = runMozeidonJson<{ data: MozeidonTab[] }>(["tabs", "get"], {
    ...getMozeidonOptions(),
    context: "tabs get",
    fallback: TABS_FALLBACK,
  });
  return mapMozeidonTabsToState(parsedTabs, TAB_TYPE.OPENED_TABS);
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
