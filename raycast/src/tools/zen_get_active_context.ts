import { createZenAiToolDependencies } from "../zenAiToolRuntime";
import { zenGetActiveContext, type ZenGetActiveContextInput } from "../zenAiToolsCore";

/**
 * Get the active Zen tab's page context using the Mozeidon context API.
 */
export default async function tool(input: ZenGetActiveContextInput = {}) {
  return zenGetActiveContext(input, createZenAiToolDependencies());
}
