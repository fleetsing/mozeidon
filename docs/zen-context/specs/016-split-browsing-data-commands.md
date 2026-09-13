# Spec 016: Split Browsing-Data Commands And Fix History Pagination

## Summary

Split the combined "Zen Tabs" Raycast command (opened tabs / recently closed tabs / bookmarks selected via a dropdown) into three separate commands, and fix `Zen History`'s hard 500-item cap. Both issues were found during manual verification of specs 003/004/005/006.

## Status

- Implemented
- 2026-09-13: Manual verification of specs 003–006 completed for all items except Move Tab to Start/End (see spec 004's progress log). Surfaced two bugs and a UX decision, addressed here.

## Problem

**Dropdown storeValue bug.** `raycast/src/mozeidon.tsx` used a `List.Dropdown` (`storeValue={true}`) to switch between Opened Tabs, Recently Closed, and Bookmarks, backed by a module-level singleton (`raycast/src/hooks/useMozeidon.tsx`'s `let tabState`) and a switch-based `changeTabType` invoked only from the dropdown's `onChange`. On relaunch, Raycast restores the dropdown's visual selection to whatever was last chosen (e.g. "Bookmarks"), but that restoration does not reliably re-trigger the fetch — `changeTabType` is gated by `if (isLoading) return`, and the restored selection can resolve while the mount effect's Firefox-running check is still in flight. Result: the dropdown shows "Bookmarks" with an empty list.

**History pagination bug.** `raycast/src/historyCommands.ts` hardcoded `DEFAULT_HISTORY_LIMIT = 500`, and `raycast/src/history.tsx` fetched once on mount with that cap and no pagination. Any history beyond 500 entries — and any search for it, since search only filtered the already-truncated set — was invisible.

**UX decision.** Users want distinct hotkeys/aliases per browsing-data type, matching the precedent `Zen History` already set as its own command. Splitting into three commands also eliminates the storeValue bug's whole mechanism rather than working around it.

## Goals

- Three independent Raycast commands: `mozeidon` (Open Tabs, kept for install/hotkey backward compatibility), `recently-closed-tabs`, `bookmarks`.
- Each command owns simple, independent mount-effect state (no shared singleton, no dropdown).
- History streams in chunks like bookmarks already do, removing the 500-item ceiling.
- No CLI or add-on changes — the CLI already supports `history -c <n>` identically to `bookmarks -c <n>`.
- Preserve all existing tab-mutation and bookmark-CRUD behavior and action gating exactly as-is.

## Non-Goals

- No fix for Move Tab to Start/End (deprioritized by the user; tracked as a known, deferred issue — see spec 004's progress log).
- No new CLI flags or add-on capabilities.
- No change to `Zen History`'s command identity, title, or its own delete/search UX.

## Proposed Design

- Replace `useMozeidonTabs()` (singleton + switch) with three small hooks in `raycast/src/hooks/useMozeidon.tsx` — `useOpenTabs()`, `useRecentlyClosedTabs()`, `useBookmarksList()` — each following `history.tsx`'s already-proven pattern: mount effect → `ensureFirefoxRunning()` → fetch → `setState`.
- Add `ensureFirefoxRunning()` to `raycast/src/actions/index.ts`, factoring out the "is Zen running, start it and close Raycast if not" preamble that was duplicated between `useMozeidon.tsx` and `history.tsx`; all four call sites (three hooks + `history.tsx`) now share it.
- Add `TabList.View` (new static method on `raycast/src/components/TabList.tsx`'s `TabList` class) — the shared `<List>` rendering (tab items + "New Tab" section) that all three tab-related commands use, parameterized by a fixed `type` and simple per-command callback props. This avoids tripling the view JSX across three near-identical entry-point files. `windowCount`/`lastTabIndexByWindow` are computed unconditionally inside it, matching prior behavior (harmless no-ops for non-open-tab types).
- Delete `raycast/src/components/TabTypeDropDown.tsx` (no longer used anywhere).
- `raycast/src/mozeidon.tsx` simplifies to `useOpenTabs()` + `TabList.View` with fixed `type={TAB_TYPE.OPENED_TABS}`. New `raycast/src/recently-closed-tabs.tsx` and `raycast/src/bookmarks.tsx` follow the same shape with their own hook and fixed type.
- Add `getHistoryChunks()` to `raycast/src/actions/index.ts`, mirroring `getBookmarksChunks()` exactly (`streamMozeidonLines(["history", "-c", "500"], ...)`); `history.tsx`'s mount effect consumes it progressively instead of a single-shot fetch. Removed now-dead `fetchHistory`, `buildFetchHistoryArgs`, `DEFAULT_HISTORY_LIMIT`.

## API Or Contract

No CLI/add-on contract changes. Raycast command surface changes:

- `mozeidon` — title changes from "Zen Tabs" to "Zen Open Tabs"; scope narrows from all three types to Opened Tabs only.
- `recently-closed-tabs` (new) — "Zen Recently Closed Tabs".
- `bookmarks` (new) — "Zen Bookmarks".
- `history` — unchanged identity; internals now stream instead of single-shot fetching.

Existing users of the `mozeidon` command keep their install/hotkey; anyone wanting Recently Closed or Bookmarks quick access needs to newly assign a hotkey/alias to the two new commands (expected, since that's the point of the split).

## Security And Permissions

No changes. All commands continue to use the existing safe Mozeidon CLI wrapper and argument arrays; no new browser permissions; no native messenger changes.

## Alternatives Considered

- **Keep one command, fix the dropdown state bug directly** (e.g. control the dropdown's `value` explicitly and force a fetch on mount for whatever value resolves). Rejected: still leaves three unrelated data types sharing one command with no independent hotkeys, which was the actual user complaint, not just the bug.
- **Add `List` pagination (`onLoadMore`) for history** instead of the bookmarks-style chunk generator. Rejected: the chunked-streaming approach is already proven (bookmarks), requires no new Raycast API surface, and the CLI already supports the identical `-c` flag for history — strictly simpler.

## Test Plan

- `cd raycast && npm test` (updated manifest-commands assertion; updated history command-builder test).
- `cd raycast && npm run lint`.
- `cd raycast && npm run build` (confirms all three command entry points compile and register).
- No new component/hook-level tests: this codebase has no existing test coverage for `mozeidon.tsx`/`TabList.tsx`/`TabActions.tsx`/hooks, and this change doesn't alter that convention.
- Manual Zen smoke test (see below).

## Rollout Plan

1. Add `ensureFirefoxRunning()` and `getHistoryChunks()`; switch `history.tsx` to chunked loading.
2. Replace `useMozeidonTabs()` with the three dedicated hooks.
3. Add `TabList.View`; simplify `mozeidon.tsx`; add `recently-closed-tabs.tsx` and `bookmarks.tsx`; delete `TabTypeDropDown.tsx`.
4. Update `package.json` commands array and the manifest test.
5. Run lint/build/test; manual Zen verification.

## Manual Verification

1. Reload the extension; confirm three commands appear: "Zen Open Tabs", "Zen Recently Closed Tabs", "Zen Bookmarks", each independently assignable a hotkey/alias.
2. In each, open it, close with Esc, reopen it — multiple times — and confirm the list is never empty on relaunch (the storeValue bug is gone by construction, since there's no dropdown left).
3. Re-run the tab-actions checklist (pin/unpin/duplicate/move-to-group/ungroup) in "Zen Open Tabs" — unchanged behavior expected.
4. Re-run the bookmarks checklist (search/open, add/edit/delete with confirmation) in "Zen Bookmarks" — unchanged behavior expected.
5. In `Zen History`, confirm entries beyond 500 are now visible (if the test browser has that many) and that search finds older entries.

## Open Questions

- None.
