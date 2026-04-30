import type {
  ContextFormat,
  ContextLimits,
  ContextMode,
  ContextRequestParseResult,
} from "./types"

export const DEFAULT_LIMITS: ContextLimits = {
  maxBytes: 1000000,
  maxTextBytes: 50000,
  maxHtmlBytes: 250000,
  maxMarkdownBytes: 50000,
  maxLinks: 500,
  maxImages: 200,
  maxJsonLdBytes: 100000,
}

export function parseContextRequest(
  args?: string
): ContextRequestParseResult {
  let parsed: unknown
  try {
    parsed = args ? JSON.parse(args) : {}
  } catch (_) {
    return {
      error: {
        code: "invalid_context_request",
        message: "Context request args must be valid JSON.",
        details: { args },
      },
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      error: {
        code: "invalid_context_request",
        message: "Context request args must be a JSON object.",
        details: {
          receivedType: Array.isArray(parsed) ? "array" : typeof parsed,
        },
      },
    }
  }

  const request = parsed as Record<string, unknown>
  const mode = parseMode(request.mode)
  const format = parseFormat(request.format)
  const limits =
    request.limits &&
    typeof request.limits === "object" &&
    !Array.isArray(request.limits)
      ? request.limits
      : {}
  return {
    request: {
      mode,
      format,
      selector:
        typeof request.selector === "string" ? request.selector : undefined,
      limits: { ...DEFAULT_LIMITS, ...limits },
    },
  }
}

export function parseMode(mode: unknown): ContextMode {
  if (mode === "selection" || mode === "metadata" || mode === "links")
    return mode
  return "active"
}

export function parseFormat(format: unknown): ContextFormat {
  if (format === "text" || format === "markdown" || format === "html")
    return format
  return "json"
}
