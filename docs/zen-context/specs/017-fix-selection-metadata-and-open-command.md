# Spec 017: Fix Misleading Selection Metadata; Extract "New Tab" Into Its Own Command

## Summary

Fix two real bugs found while testing the AI commands and the M3 tab-list commands: Smart Summarize (and the `@zen` `zen_get_selection_or_page` tool) attached the Zen page's title/URL to a result whose text actually came from an unrelated app, and all three tab-list commands had a keyboard-navigation bug caused by an always-present "New Tab" item. Extracting "New Tab" into its own "Zen Open" command fixes the navigation bug at the root and gives quick-open its own hotkey/alias.

## Status

- Implemented
- Verified end-to-end against a real Zen session, including the drive-by StrictMode cancellation fix (see below)

## Problem

**Misleading selection-source metadata.** When Zen has no DOM selection, both Smart Summarize (`smartSummarize.ts`) and the `zen_get_selection_or_page` AI tool (`zenAiToolsCore.ts`) fall back to Raycast's `getSelectedText()` API. That API reads whatever text is highlighted in the frontmost macOS application — it is not scoped to Zen at all. Both call sites then attached the *Zen page's* title/URL as "source" metadata to that result (`resolveRaycastSelectionMetadata` / `resolveRaycastSelectionSource`), on the reasoning that it's helpful context about what was open in Zen at the time. In practice this produced results that looked exactly like a summary of the Zen page (headed with its title/URL) when the actual summarized text had nothing to do with that page — confirmed by testing Smart Summarize against an unrelated page with no selection, which returned a summary of unrelated text that happened to be selected elsewhere, misleadingly labeled with the tested page's URL.

**Sticky-focus keyboard navigation bug.** `TabList.tsx`'s shared `TabListView` (used by all three tab-list commands: Open Tabs, Recently Closed, Bookmarks) unconditionally rendered a "New Tab" section, even before the tab fetch completed. On mount, with `tabs=[]` while loading, "Open Empty Tab" was the only item in the entire list, so Raycast auto-focused it. Once real tabs streamed in, Raycast's `List` kept that selection sticky rather than resetting to the first tab (a documented Raycast UX behavior for preserving user position across re-renders, working exactly as designed but colliding badly with this specific loading sequence). Users could not navigate the list from the top with the keyboard. This predates the M3 command split (docs/zen-context/specs/016-split-browsing-data-commands.md) and was not introduced by it.

## Goals

- Do not attach page/tab metadata to a result whose text came from an OS-level selection not scoped to Zen.
- Fix the sticky-focus keyboard navigation bug in all three tab-list commands.
- Give "open a new tab" its own command with an independently assignable hotkey/alias, consistent with the reasoning behind Spec 016's command split.
- No CLI or add-on changes; reuse existing, already-tested `openNewTab`/`buildNewTabArgs`.

## Non-Goals

- No window-targeting granularity for the new "Zen Open" command (specific window, new window, incognito window) — the CLI's `tabs new` only supports a URL/query today; that's a separate, larger effort requiring new CLI/add-on capability.
- No `List.EmptyView` customization — Raycast's built-in default empty state is sufficient now that a tab-list search with zero matches no longer has a "New Tab" fallback masking it.
- No change to the Zen DOM selection or active-page fallback tiers, only the raycast-selection tier's metadata.

## Proposed Design

### Selection metadata fix

- `raycast/src/smartSummarize.ts`: `resolveSmartSummarizeContext`'s raycast-selection branch no longer calls `resolveRaycastSelectionMetadata` (deleted); it returns `{ source: "raycast-selection", text }` with no `title`/`url`. This also removes an unnecessary `getActivePageMarkdown()` CLI call on this path.
- `raycast/src/zenAiToolsCore.ts`: `zenGetSelectionOrPage`'s raycast-selection branch no longer calls `resolveRaycastSelectionSource` (deleted, along with its now-fully-unused helpers `hasSourceMetadata`/`mergeSource`); it returns `source: {}` directly, no `getContext()` call.
- `zen-selection` and `active-page` results are unaffected — those genuinely originate from Zen, so their title/URL metadata remains accurate and unchanged.

### "New Tab" extraction

- Removed the `<List.Section title="New Tab">` block and `NewTabItem` from `TabList.tsx`'s shared `TabListView`. The `searchText` state it existed to serve is also removed (unused elsewhere; Raycast's `filtering` prop already does keyword-based filtering without the extension tracking search text itself).
- New `raycast/src/zen-open.tsx`: a minimal `List` with one dynamic `List.Item` (title "Open Empty Tab" or `Search <engine> "<query>"`, mirroring the removed `NewTabItem` exactly), using `TabActions.NewTab` for its action panel.
- Drive-by fix: `TabActions.tsx`'s `NewTabAction` rendered two `<Action>`s with an identical title — the primary `OpenNewTabAction` (opens the tab and closes Raycast, matching every other open-tab action in this extension) and a redundant duplicate that opened without closing Raycast. Removed the duplicate.
- `raycast/package.json`: new `"zen-open"` command — title "Zen Open", subtitle "Zen Browser", description "Open a new Zen tab or search the web".

## API Or Contract

`zen_get_selection_or_page`'s `ZenGetSelectionOrPageData.source` for a `"raycast-selection"` kind result is now `{}` (previously populated with Zen/active-page `title`/`url` when available). `zen-selection` and `active-page` kinds are unchanged. This is an additive-compatible narrowing (the `ZenSource` type's fields were already optional) but a real behavior change for any consumer that relied on the old attribution — none exist outside this extension today.

No CLI/add-on/native messenger changes. New Raycast command surface: `zen-open`.

## Security And Permissions

No changes. `getSelectedText()` usage is unchanged (still the existing, sanctioned Raycast API); the fix is purely about not mislabeling its output's origin, not about restricting or expanding what it can read.

## Alternatives Considered

- **Keep attaching page metadata but relabel it** (e.g. "Zen tab open while selecting" instead of "Source"). Rejected as more complex for a fix whose whole point is "don't imply a relationship that doesn't exist" — omitting the field entirely is simpler and unambiguous.
- **Add a `List.EmptyView` to the tab-list commands.** Rejected as unnecessary scope — Raycast's built-in empty state already covers a zero-match search now that "New Tab" no longer masks it.

## Test Plan

- `cd raycast && npm test`: updated the 4 affected tests in `smartSummarize.test.ts` and 3 in `zenAiTools.test.ts` (previously asserting the old, misleading metadata as correct) plus the manifest command-list assertion (new `zen-open` entry).
- `cd raycast && npm run lint && npm run build`.
- No new component-level tests for `zen-open.tsx`: this codebase has no existing test coverage for the view layer (`TabList.tsx`, `mozeidon.tsx`, etc.), and this change doesn't alter that convention. The underlying `openNewTab`/`buildNewTabArgs` logic it reuses is already tested.
- Manual Zen verification (see below).

## Drive-By Fix: StrictMode Cancellation Bug In Tab-List Hooks

While doing manual verification, all three tab-list commands (Open Tabs, Recently Closed, Bookmarks) suddenly showed a permanently empty list with `isLoading` stuck `true` — no error, no data, and (confirmed by testing with a deliberately broken CLI path) never even reaching the `mozeidon` CLI call. Bisection against a clean worktree of the last known-good commit (`b2b8eb7`, before this spec's changes) reproduced the identical failure with byte-identical hook code, proving this predates spec 017 and is unrelated to it.

Root cause: `useOpenTabs`/`useRecentlyClosedTabs`/`useBookmarks` (`raycast/src/hooks/useMozeidon.tsx`) track effect cancellation with a `useRef(false)` that is shared for the component's entire lifetime, set to `true` only in the effect's cleanup. Under React StrictMode's double effect invocation (mount → effect → cleanup → effect again), the first invocation's cleanup sets the shared ref to `true` before the second, persisting invocation's `refresh()` call ever checks it — so that real call sees `cancelledRef.current === true` immediately, bails out before calling the CLI, and skips `setIsLoading(false)` in `finally`, leaving the list stuck loading forever. `history.tsx`'s equivalent effect was unaffected because it declares `let cancelled = false` fresh inside the effect closure on every invocation, rather than sharing a persistent ref — StrictMode's double-invoke gives each invocation its own independent flag there.

This is a latent bug that predates this spec; it was not triggered by anything in this branch or in spec 016, and most likely started manifesting after a Raycast platform update began exercising StrictMode-style double effect invocation for extension commands (the user observed the failure begin with no local code or config changes). Fix: reset `cancelledRef.current = false` at the top of each `useEffect` invocation (before calling `refresh()`), giving each invocation the same fresh-per-run semantics as `history.tsx`'s local variable. Bundled into this branch/PR since it was found while verifying it and blocks that verification, even though it isn't part of this spec's original scope.

## Manual Verification With Zen

1. In each of "Zen Open Tabs", "Zen Recently Closed Tabs", and "Zen Bookmarks": launch the command, press Down immediately — confirm focus starts on the first real item, not a phantom "New Tab" entry. Press Up from the first item — confirm it does not jump to the last tab in the list.
2. Confirm "Zen Open" appears as its own command; typing nothing and pressing Enter opens an empty tab; typing text opens a search; typing a URL opens it directly (existing `buildNewTabArgs` behavior, unchanged).
3. Confirm "New Tab" no longer appears inside the three tab-list commands.
4. With no text selected in Zen, and some unrelated text selected in another app, run Smart Summarize on a Zen page — confirm the result is headed "Raycast Selection Summary" with no "Source:"/"URL:" line implying it came from the Zen page.
5. Confirm Zen DOM selections and active-page summaries still show accurate title/URL metadata (unaffected tiers).

## Open Questions

- Should window-targeting (new window / incognito) be added to "Zen Open" later as a separate spec once/if the CLI gains that capability? Not decided; out of scope here.
