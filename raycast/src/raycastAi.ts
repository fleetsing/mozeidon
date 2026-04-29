import { AI, environment } from "@raycast/api";
import {
  createRaycastAiClient as createInjectableRaycastAiClient,
  RaycastAiUnavailableError,
  type RaycastAiApi,
} from "./raycastAiCore";

export { RaycastAiUnavailableError } from "./raycastAiCore";

export function createRaycastAiClient(api: RaycastAiApi<AI.AskOptions> = { AI, environment }) {
  return createInjectableRaycastAiClient(api);
}

export async function assertRaycastAiAvailable(): Promise<void> {
  if (!createRaycastAiClient().canAccessAi()) {
    throw new RaycastAiUnavailableError();
  }
}

export async function askRaycastAi(prompt: string, options?: AI.AskOptions): Promise<string> {
  return createRaycastAiClient().ask(prompt, options);
}
