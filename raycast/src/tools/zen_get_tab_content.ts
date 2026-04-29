import { createZenAiToolDependencies } from "../zenAiToolRuntime";
import { zenGetTabContent, type ZenGetTabContentInput } from "../zenAiToolsCore";

/**
 * Get content for the active or unambiguously identified Zen tab using the context API.
 */
export default async function tool(input: ZenGetTabContentInput = {}) {
  return zenGetTabContent(input, createZenAiToolDependencies());
}
