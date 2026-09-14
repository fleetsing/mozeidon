# Spec 019: Window-Targeting for "Zen Open"

## Summary

Extend "Zen Open" (spec 017) with window-targeting: open the new tab in a brand-new normal window, a brand-new incognito window, or a specific currently-open window. This requires new capability at every layer of this fork — the Go CLI (`cli/`), the Zen/Firefox add-on (`firefox-addon/`), and the Raycast extension (`raycast/`) — since spec 017 explicitly deferred this as a non-goal ("the CLI's `tabs new` only supports a URL/query today; that's a separate, larger effort requiring new CLI/add-on capability").

## Status

- Implemented

## Problem

"Zen Open" can only open a tab in the currently focused window. Users sometimes want a genuinely separate context: a fresh normal window, a private/incognito window, or a specific other window they already have open (e.g. one dedicated to a different project). None of that was possible without new CLI/add-on capability, since Raycast has no way to express "which window" or "incognito" to the existing `tabs new` command.

## Goals

- Add `--window-id`, `--new-window`, and `--incognito` targeting to the CLI's `tabs new` command, mutually exclusive with each other.
- Wire the add-on to actually create tabs/windows accordingly.
- Extend "Zen Open"'s action panel with matching actions, including a lazily-loaded "Open in Window" submenu listing currently open windows.
- Preserve all existing `tabs new`/"Zen Open" behavior exactly when no targeting option is used.

## Non-Goals

- No "always ask" preference or default-targeting configuration — the action panel always exposes all four options (current window, new window, incognito, specific window).
- No changes to closing tabs, switching back, or any other existing tab-list behavior.
- No special-cased detection of a missing incognito permission (see below) — Firefox's own rejection message is surfaced as-is.

## Proposed Design

### CLI (Go)

`cli/cmd/tabs/new-tab.go` gains three flags on the existing `tabs new` command, following the `--window-id` idiom already used by `tabs duplicate`:
- `--window-id` (int64, default `-1`)
- `--new-window` (bool)
- `--incognito` (bool)

Marked mutually exclusive via `NewTabCmd.MarkFlagsMutuallyExclusive("window-id", "new-window", "incognito")` (cobra v1.8.0, this repo's pinned version). With none set, behavior is unchanged (`app.NewTab(query)`).

`cli/core/tabs-new.go` adds `NewTabInWindow(query string, windowId int64)`, `NewWindowTab(query string)`, `NewIncognitoTab(query string)` alongside the existing `NewTab`, all now sharing a small `sendNewTabCommand` helper for the send/wait/exit-code plumbing. Each builds a `models.Command` with a new command name:
- `new-tab-in-window`, `Args: "<windowId>:<query>"`.
- `new-window-tab`, `Args: <query>`.
- `new-incognito-tab`, `Args: <query>`.

### Add-on (TypeScript)

`firefox-addon/src/models/command.ts` gains matching `CommandName` entries, routed in `handler.ts` to three new functions in `services/tabs.ts`. `newTab`'s existing "is this a URL, else fall back to a Google search" logic is factored into a shared `resolveTabUrl(args)` helper, reused by all four functions.

`newTabInWindow` parses `"<windowId>:<query>"` by taking everything up to the **first** colon as the windowId and everything after as the query — deliberately not a full colon split, since the query is often itself a URL containing `://`. `newWindowTab`/`newIncognitoTab` call `browser.windows.create({ url, incognito: true })` (incognito only on the latter).

### Raycast (TypeScript)

- `mozeidonClient.ts`: `buildNewTabArgs`'s query-resolution tail is factored into `buildNewTabQueryArgs`, reused by three new builders: `buildOpenInWindowArgs`, `buildNewWindowArgs`, `buildIncognitoArgs`.
- `actions/index.ts`: `openNewTabInWindow`, `openNewWindowTab`, `openIncognitoTab` mirror `openNewTab`'s shape. `fetchWindowTargets()` calls the CLI's existing (previously unused by Raycast) `windows get`, then labels each window using its active tab's title (cross-referencing `fetchOpenTabs()` — no new CLI/add-on capability needed for that part) via a new pure `mapWindowsToTargets` in `tabMappers.ts`, falling back to `"Window <id>"` when a window has no active tab. The last-focused window is sorted first.
- `components/TabActions.tsx`: `NewTabAction`'s panel gains "Open in New Window", "Open in New Incognito Window", and a lazily-loaded "Open in Window" submenu (fetched only on `onOpen`, keeping "Zen Open"'s instant-launch feel for the common case). All three new actions show a failure toast on error, unlike the pre-existing plain "open a tab" action which has no error handling.

## API Or Contract

New CLI flags and native-message command names as above; additive only, no existing behavior changes. `mozeidon windows get`'s output shape is unchanged (this spec is its first Raycast consumer).

## Security And Permissions

**Incognito requires a manual permission grant.** Firefox/Zen extensions have zero access to private windows unless "Run in Private Windows" is enabled for the add-on in `about:addons`. Since this repo's custom add-on is loaded as a temporary dev add-on that gets dropped on every Zen restart (spec 018's decision-log entry), that permission needs re-granting after every reload too. This is a known, documented rough edge, not a blocker: if the permission is missing, `browser.windows.create({incognito: true})` rejects with Firefox's own clear error message ("Extension does not have permission for incognito mode"), which surfaces to the user via the new failure-toast handling with no special-cased detection.

No other permission changes; `windows get` was already an existing, permission-neutral CLI/add-on capability.

## Alternatives Considered

- **Encode all targeting as one "mode:windowId:query" args string on the existing `new-tab` command**, instead of three new command names. Rejected: a 3-field colon scheme is harder to parse safely around a freeform query that may itself contain colons, and this codebase already has precedent (`new-tab` vs `new-group-tab`) for using distinct command names for genuinely distinct actions rather than overloading one with a mode flag.
- **Detect and specially message a missing incognito permission.** Rejected as unnecessary complexity for a rare failure mode with an already-clear underlying error message.
- **Drop incognito from this pass given the permission friction.** Considered and rejected after discussion — included since the underlying mechanism is the same as the other two options, and the permission caveat is a real but manageable rough edge, not a reason to withhold the capability.

## Test Plan

- `cd cli && go build ./... && go vet ./... && go test ./...` — no new Go tests added; `cli/cmd/tabs/`/`tabs-new.go` has no existing test coverage for tab-opening commands (`duplicate`, `new-group-tab`, etc. are all untested too), so this follows existing convention.
- `cd firefox-addon && npm run build && npm test` — no new add-on tests added, for the same reason; no existing test coverage targets `services/tabs.ts`.
- `cd raycast && npm test && npm run lint && npm run build` — added unit tests for `buildNewTabQueryArgs`/`buildOpenInWindowArgs`/`buildNewWindowArgs`/`buildIncognitoArgs` (`tests/mozeidonClient.test.ts`) and `mapWindowsToTargets` (labeling and last-focused-first ordering). No new component-level tests for `TabActions.tsx`'s new submenu/actions, consistent with this codebase's established no-view-layer-test convention.

## Manual Verification With Zen

1. Confirm the default "Zen Open" action (open in current window / search) is unchanged.
2. "Open in New Window" opens a fresh normal window with the typed query/URL (or empty tab).
3. "Open in New Incognito Window": with the add-on's "Run in Private Windows" permission granted, confirm it opens a private window; with it not granted, confirm a clear failure toast appears rather than a silent failure or crash.
4. "Open in Window" submenu: confirm it doesn't fetch anything until opened, lists real open windows with sensible labels (active tab's title, or "Window <id>" if none), surfaces the last-focused window first, and opening one puts the new tab in the chosen window.

## Open Questions

None.
