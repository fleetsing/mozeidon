import { createZenAiToolDependencies } from "../zenAiToolRuntime";
import { zenSearchTabs, type ZenSearchTabsInput } from "../zenAiToolsCore";

/**
 * Search currently open Zen tabs by title and URL.
 */
export default async function tool(input: ZenSearchTabsInput = { query: "" }) {
  return zenSearchTabs(input, createZenAiToolDependencies());
}
