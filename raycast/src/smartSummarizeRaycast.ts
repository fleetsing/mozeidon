import { getSelectedText } from "@raycast/api";
import { MOZEIDON, PROFILE_ID } from "./constants";
import { createRaycastAiClient } from "./raycastAi";
import { summarizeSmartContext, type SmartSummarizeResult } from "./smartSummarize";
import { fetchActivePageMarkdown, fetchZenSelection } from "./zenContext";

export async function summarizeSmartZenContext(): Promise<SmartSummarizeResult> {
  const ai = createRaycastAiClient();

  return summarizeSmartContext({
    getZenSelection: async () => fetchZenSelection(getMozeidonOptions()).raw,
    getRaycastSelectedText: getRaycastSelectedTextIfAvailable,
    getActivePageMarkdown: async () => fetchActivePageMarkdown(getMozeidonOptions()).raw,
    canAccessAi: () => ai.canAccessAi(),
    askAi: (prompt) => ai.ask(prompt, { creativity: "low" }),
  });
}

async function getRaycastSelectedTextIfAvailable(): Promise<string | undefined> {
  try {
    return await getSelectedText();
  } catch (_) {
    return undefined;
  }
}

function getMozeidonOptions() {
  return {
    executable: MOZEIDON,
    profileId: PROFILE_ID,
  };
}
