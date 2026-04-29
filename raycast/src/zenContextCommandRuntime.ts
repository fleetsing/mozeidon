import { MOZEIDON, PROFILE_ID } from "./constants";
import { createRaycastAiClient } from "./raycastAi";
import { fetchActivePageMarkdown } from "./zenContext";
import type { ZenContextAiCommandDependencies, ZenContextCommandDependencies } from "./zenContextCommands";

export function createZenContextCommandDependencies(): ZenContextCommandDependencies {
  return {
    getActivePageMarkdown: async () => fetchActivePageMarkdown(getMozeidonOptions()),
  };
}

export function createZenContextAiCommandDependencies(): ZenContextAiCommandDependencies {
  const ai = createRaycastAiClient();

  return {
    ...createZenContextCommandDependencies(),
    ai: {
      canAccessAi: () => ai.canAccessAi(),
      ask: (prompt, options) => ai.ask(prompt, options as Parameters<typeof ai.ask>[1]),
    },
  };
}

function getMozeidonOptions() {
  return {
    executable: MOZEIDON,
    profileId: PROFILE_ID,
  };
}
