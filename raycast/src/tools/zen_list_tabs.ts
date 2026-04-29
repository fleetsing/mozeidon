import { createZenAiToolDependencies } from "../zenAiToolRuntime";
import { zenListTabs, type ZenListTabsInput } from "../zenAiToolsCore";

/**
 * List currently open Zen tabs with stable tab and window metadata.
 */
export default async function tool(input: ZenListTabsInput = {}) {
  return zenListTabs(input, createZenAiToolDependencies());
}
