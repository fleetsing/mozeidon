import { getPreferenceValues } from "@raycast/api";
import type { Preferences } from "./interfaces";

const preferences = getPreferenceValues<Preferences>();

export const COMMAND_NAME = "Mozeidon";
export const MOZEIDON = preferences.mozeidon;
export const PROFILE_ID = preferences.profileId?.trim() || undefined;
export const SEARCH_ENGINE = preferences.searchEngine;

// Kept as-is to avoid touching more files.
// actions/index.ts already imports FIREFOX_OPEN_COMMAND.
export const FIREFOX_OPEN_COMMAND = preferences.firefox;

export const TABS_FALLBACK = `{"data":[]}`;

export enum TAB_TYPE {
  OPENED_TABS = "Opened Tabs",
  RECENTLY_CLOSED = "Recently Closed",
  BOOKMARKS = "Bookmarks",
  NONE = "",
}

// Change this to your fork URL if you want Raycast's help link
// to open your patched README instead of upstream.
export const MOZEIDON_DOCUMENTATION_URL = "https://github.com/egovelox/mozeidon";

export const SEARCH_ENGINES: { [T in typeof SEARCH_ENGINE]: string } = {
  Google: `https://google.com/search?q=`,
  Bing: `https://www.bing.com/search?q=`,
  Baidu: `https://www.baidu.com/s?wd=`,
  Brave: `https://search.brave.com/search?q=`,
  DuckDuckGo: `https://duckduckgo.com/?q=`,
};

export const UnknownErrorText = `## Error

Something happened while trying to run your command.

Please ensure that:
- \`Zen Browser\` is up and running
- the \`Mozeidon\` browser add-on is installed and running in Zen
- the \`Mozeidon native app\` is installed and configured for Zen
- the \`Mozeidon CLI\` is installed and its file path is correct in the Raycast extension settings

If you need help, you can read installation details on the [documentation page](${MOZEIDON_DOCUMENTATION_URL}).
If it persists, you can open a new issue on the [issue page](https://github.com/egovelox/mozeidon/issues).`;

export const DEFAULT_ERROR_TITLE = "An Error Occurred";
