import { MozeidonClientError } from "./mozeidonClient";

export const CONTEXT_COMMAND_UNAVAILABLE_CODE = "context_command_unavailable";
export const MOZEIDON_UNAVAILABLE_CODE = "mozeidon_unavailable";

export const CONTEXT_COMMAND_UNAVAILABLE_MESSAGE =
  "The configured Mozeidon CLI does not support Zen Context commands. Build or install this fork's current Mozeidon CLI, then update the Raycast extension's Mozeidon CLI filepath setting if needed.";

export const MOZEIDON_UNAVAILABLE_MESSAGE =
  "Mozeidon could not reach Zen through the native app connection. Make sure Zen is running, the Mozeidon add-on is installed, and the native app/profile registration is current.";

export type ZenContextMappedError = {
  code: string;
  message: string;
};

export function isContextCommandUnavailableError(error: unknown): boolean {
  if (!(error instanceof MozeidonClientError)) return false;

  const output = getMozeidonErrorOutput(error).toLowerCase();
  const message = error.message.toLowerCase();
  const context = error.context.toLowerCase();
  const combined = `${output}\n${message}`;

  return context.includes("context") && combined.includes("unknown command") && combined.includes("context");
}

export function mapMozeidonContextError(error: unknown): ZenContextMappedError | undefined {
  if (isContextCommandUnavailableError(error)) {
    return {
      code: CONTEXT_COMMAND_UNAVAILABLE_CODE,
      message: CONTEXT_COMMAND_UNAVAILABLE_MESSAGE,
    };
  }

  if (!(error instanceof MozeidonClientError) || !error.context.toLowerCase().includes("context")) {
    return undefined;
  }

  const output = getMozeidonErrorOutput(error);
  const structuredError = parseStructuredError(output);
  if (structuredError?.code && structuredError.message) {
    if (isNativeIpcError(structuredError.message)) {
      return {
        code: MOZEIDON_UNAVAILABLE_CODE,
        message: `${MOZEIDON_UNAVAILABLE_MESSAGE}\n\n${structuredError.message}`,
      };
    }

    return {
      code: structuredError.code,
      message: structuredError.message,
    };
  }

  const message = isNativeIpcError(output) ? `${MOZEIDON_UNAVAILABLE_MESSAGE}\n\n${output}` : error.message;

  return {
    code: MOZEIDON_UNAVAILABLE_CODE,
    message,
  };
}

function getMozeidonErrorOutput(error: MozeidonClientError): string {
  return [error.stderr, error.stdout].filter(Boolean).join("\n");
}

function isNativeIpcError(output: string): boolean {
  return output.includes("Cannot read via ipc") || output.includes("Cannot connect via ipc");
}

function parseStructuredError(output: string): { code?: string; message?: string } | undefined {
  const text = output.trim();
  if (!text) return undefined;

  try {
    const parsed = JSON.parse(text) as { code?: string; message?: string; error?: string };
    if (parsed.code || parsed.message) return parsed;
    if (parsed.error) {
      return {
        code: MOZEIDON_UNAVAILABLE_CODE,
        message: parsed.error,
      };
    }
  } catch (_) {
    return undefined;
  }

  return undefined;
}
