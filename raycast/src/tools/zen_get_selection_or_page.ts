import { createZenAiToolDependencies } from "../zenAiToolRuntime";
import { zenGetSelectionOrPage, type ZenGetSelectionOrPageInput } from "../zenAiToolsCore";

/**
 * Get Zen DOM selection, Raycast selected text, or active Zen page content in that order.
 */
export default async function tool(input: ZenGetSelectionOrPageInput = {}) {
  return zenGetSelectionOrPage(input, createZenAiToolDependencies());
}
