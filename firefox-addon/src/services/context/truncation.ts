import type { ContextRequest, ContextWarning, Truncation } from "./types"

export function truncationFromWarnings(
  warnings: ContextWarning[]
): Truncation {
  const fields = warnings
    .filter(
      (warning) =>
        (warning.code === "content_truncated" ||
          warning.code === "metadata_truncated") &&
        warning.field
    )
    .map((warning) => warning.field!)
  return { truncated: fields.length > 0, fields }
}

export function mergeTruncation(
  existing: Truncation | undefined,
  warnings: ContextWarning[]
): Truncation {
  const warningTruncation = truncationFromWarnings(warnings)
  if (!existing) return warningTruncation
  const fields = Array.from(
    new Set([...(existing.fields ?? []), ...warningTruncation.fields])
  )
  return {
    truncated: existing.truncated || warningTruncation.truncated,
    fields,
  }
}

export function truncate(
  value: string,
  maxBytes: number,
  field: string,
  warnings: ContextWarning[]
) {
  const encoder = new TextEncoder()
  if (encoder.encode(value).length <= maxBytes) {
    return { value, length: value.length, truncated: false }
  }

  let output = ""
  let currentBytes = 0
  for (const char of value) {
    const charBytes = encoder.encode(char).length
    if (currentBytes + charBytes > maxBytes) break
    output += char
    currentBytes += charBytes
  }
  warnings.push({
    code: "content_truncated",
    message: "Context content was truncated to fit the configured size limit.",
    field,
  })
  return { value: output, length: output.length, truncated: true }
}

export function contentLimit(
  request: ContextRequest,
  field: "text" | "markdown" | "html"
) {
  const fieldLimit =
    field === "text"
      ? request.limits.maxTextBytes
      : field === "markdown"
        ? request.limits.maxMarkdownBytes
        : request.limits.maxHtmlBytes
  return Math.min(request.limits.maxBytes, fieldLimit)
}
