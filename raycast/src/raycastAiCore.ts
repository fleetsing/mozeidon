export type RaycastAiApi<AskOptions = unknown> = {
  AI: {
    ask: (prompt: string, options?: AskOptions) => Promise<string>;
  };
  environment?: {
    canAccess?: (api: unknown) => boolean;
  };
};

export class RaycastAiUnavailableError extends Error {
  constructor(message = "Raycast AI is unavailable for this account or environment.") {
    super(message);
    this.name = "RaycastAiUnavailableError";
  }
}

export function createRaycastAiClient<AskOptions = unknown>(api: RaycastAiApi<AskOptions>) {
  return {
    canAccessAi(): boolean {
      if (typeof api.environment?.canAccess !== "function") return true;
      return api.environment.canAccess(api.AI);
    },

    async ask(prompt: string, options?: AskOptions): Promise<string> {
      if (!this.canAccessAi()) {
        throw new RaycastAiUnavailableError();
      }

      try {
        return await api.AI.ask(prompt, options);
      } catch (error) {
        throw new RaycastAiUnavailableError(error instanceof Error ? error.message : undefined);
      }
    },
  };
}
