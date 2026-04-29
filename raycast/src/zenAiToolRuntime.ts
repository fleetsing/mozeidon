import { getSelectedText } from "@raycast/api";
import { MOZEIDON, PROFILE_ID } from "./constants";
import { openNewTab, switchTab } from "./actions";
import { Tab, type MozeidonTab } from "./interfaces";
import { runMozeidonJson } from "./mozeidonClient";
import type { ZenAiToolDependencies, MozeidonTabsWithWindowsPayload } from "./zenAiToolsCore";
import { fetchActiveContext, fetchZenSelection } from "./zenContext";

export function createZenAiToolDependencies(): ZenAiToolDependencies {
  return {
    getContext: async (format) => fetchActiveContext(format, getMozeidonOptions()),
    getZenSelection: async () => fetchZenSelection(getMozeidonOptions()),
    getRaycastSelectedText: getRaycastSelectedTextIfAvailable,
    listTabs: async (includeWindows) => fetchTabs(includeWindows),
    switchTab: (windowId, tabId) => switchTabByIds(windowId, tabId),
    openUrl: (url) => openNewTab(url),
  };
}

async function getRaycastSelectedTextIfAvailable(): Promise<string | undefined> {
  try {
    return await getSelectedText();
  } catch (_) {
    return undefined;
  }
}

function fetchTabs(includeWindows: boolean): MozeidonTabsWithWindowsPayload {
  return runMozeidonJson<{ data: MozeidonTab[]; windows?: MozeidonTabsWithWindowsPayload["windows"] }>(
    includeWindows ? ["tabs", "get", "--with-windows"] : ["tabs", "get"],
    {
      ...getMozeidonOptions(),
      context: includeWindows ? "tabs get --with-windows" : "tabs get",
    },
  );
}

function switchTabByIds(windowId: number, tabId: number): void {
  switchTab(new Tab(tabId.toString(), false, windowId, "", "", "", false));
}

function getMozeidonOptions() {
  return {
    executable: MOZEIDON,
    profileId: PROFILE_ID,
  };
}
