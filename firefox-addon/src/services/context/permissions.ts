import type { ContextWarning } from "./types"

export function permissionsForWarnings(warnings: ContextWarning[]) {
  if (warnings.some((warning) => warning.code === "unsupported_page")) {
    return {
      canReadTabMetadata: true,
      hasDomAccess: false,
      hasActiveTabGrant: false,
      hasHostPermission: false,
      canReadActiveTab: false,
      canReadSelection: false,
      canReadPageContent: false,
      canReadMetadata: false,
      canReadLinks: false,
    }
  }
  if (warnings.some((warning) => warning.code === "permission_unavailable")) {
    return {
      canReadTabMetadata: true,
      hasDomAccess: false,
      hasActiveTabGrant: false,
      hasHostPermission: false,
      canReadActiveTab: false,
      canReadSelection: false,
      canReadPageContent: false,
      canReadMetadata: false,
      canReadLinks: false,
      requiresHostPermission: true,
      missing: ["activeTab_or_host_permission"],
    }
  }
  return {
    canReadTabMetadata: true,
    hasDomAccess: true,
    hasActiveTabGrant: false,
    hasHostPermission: true,
    canReadActiveTab: true,
    canReadSelection: true,
    canReadPageContent: true,
    canReadMetadata: true,
    canReadLinks: true,
  }
}

export function capabilitiesForWarnings(warnings: ContextWarning[]) {
  if (warnings.some((warning) => warning.code === "unsupported_page")) {
    return {
      activeTab: "available",
      selection: "unavailable",
      pageContent: "unavailable",
      metadata: "unavailable",
      links: "unavailable",
    }
  }
  if (warnings.some((warning) => warning.code === "permission_unavailable")) {
    return {
      activeTab: "available",
      selection: "permission-required",
      pageContent: "permission-required",
      metadata: "permission-required",
      links: "permission-required",
    }
  }
  return {
    activeTab: "available",
    selection: "available",
    pageContent: "available",
    metadata: "available",
    links: "available",
  }
}
