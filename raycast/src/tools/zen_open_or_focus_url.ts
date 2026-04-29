import { createZenAiToolDependencies } from "../zenAiToolRuntime";
import { zenOpenOrFocusUrl, type ZenOpenOrFocusUrlInput } from "../zenAiToolsCore";

/**
 * Open an http(s) URL in Zen or focus an already-open matching tab. Non-destructive.
 */
export default async function tool(input: ZenOpenOrFocusUrlInput = { url: "" }) {
  return zenOpenOrFocusUrl(input, createZenAiToolDependencies());
}
