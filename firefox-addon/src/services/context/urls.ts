export function isUnsupportedContextUrl(rawUrl?: string) {
  if (!rawUrl) return true
  try {
    const url = new URL(rawUrl)
    if (url.protocol === "about:" && url.pathname === "blank") return false
    return url.protocol !== "http:" && url.protocol !== "https:"
  } catch (_) {
    return true
  }
}

export function domainFromUrl(rawUrl?: string) {
  if (!rawUrl) return ""
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "")
  } catch (_) {
    return ""
  }
}
