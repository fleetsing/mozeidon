// MCP-side wiring for ZenAiToolDependencies, paralleling
// raycast/src/zenAiToolRuntime.ts but configured via environment variables
// instead of Raycast preferences (see docs/zen-context/specs/020-mcp-read-only-server.md).
import { runMozeidon, runMozeidonJson, type MozeidonJsonOptions } from "./mozeidonClient.js";
import { fetchActiveContext, fetchTabContext, fetchZenSelection } from "./zenContext.js";
import type { ZenAiToolDependencies, MozeidonTabsWithWindowsPayload } from "./zenAiToolsCore.js";
import type { MozeidonTab } from "./interfaces.js";

export function createZenAiToolDependencies(): ZenAiToolDependencies {
  return {
    getContext: async (format) => fetchActiveContext(format, getMozeidonOptions()),
    getContextForTab: async (tabId, windowId, format) => fetchTabContext(tabId, windowId, format, getMozeidonOptions()),
    getZenSelection: async () => fetchZenSelection(getMozeidonOptions()),
    // No generic "read the frontmost app's selection" capability exists
    // outside Raycast, so this tier of zenGetSelectionOrPage's fallback chain
    // is unreachable here by design - it naturally degrades to
    // zen-selection -> active-page (spec 018's ordering). Not a bug.
    getRaycastSelectedText: async () => undefined,
    listTabs: async (includeWindows) => fetchTabs(includeWindows),
    switchTab: (windowId, tabId) => {
      runMozeidon(["tabs", "switch", `${windowId}:${tabId}`], getMozeidonOptions());
    },
    // Only zenOpenOrFocusUrl (a mutating tool, deliberately not registered by
    // this read-only server) calls this. Throw instead of a silent no-op so a
    // future mistake that registers it fails loudly rather than doing nothing.
    openUrl: () => {
      throw new Error("openUrl is not supported by the read-only zen-mcp-server");
    },
  };
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

function getMozeidonOptions(): MozeidonJsonOptions {
  return {
    executable: process.env.MOZEIDON_CLI_PATH?.trim() || "mozeidon",
    profileId: process.env.MOZEIDON_PROFILE_ID?.trim() || undefined,
  };
}
