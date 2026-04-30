export function contextError(
  code: string,
  message: string,
  details?: Record<string, unknown>
) {
  return {
    ok: false,
    status: "error",
    code,
    message,
    details,
  }
}
