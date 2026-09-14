# Spec 018: Prefer Zen Active Page Over Raycast OS-Level Selection

## Summary

Reorder the context fallback chain used by Smart Summarize and the `@zen` `zen_get_selection_or_page` tool so that Zen's active page content is preferred over Raycast's OS-level `getSelectedText()` fallback, rather than the other way around. Raycast's selection becomes a true last resort, used only when Zen has no usable page content at all.

## Status

- Implemented
- Verified end-to-end against a real Zen session

## Problem

Both call sites fall back through three tiers when there is no Zen DOM selection: `zen-selection` → `raycast-selection` (Raycast's `getSelectedText()`, which reads whatever is highlighted in the frontmost macOS app, not scoped to Zen) → `active-page` (Zen's active tab content). Spec 017 fixed the misleading metadata this fallback produced, but the *ordering* itself was still backwards: while a user is looking at a perfectly good Zen page with nothing selected there, if some unrelated text happens to be highlighted in another app (e.g. left over from an earlier copy), the tool would summarize that unrelated text instead of the Zen page the user is actually looking at. Confirmed by user testing: Smart Summarize kept producing summaries of content from other apps rather than the Zen page in view, which doesn't fit "a Raycast extension for Zen Browser."

## Goals

- Zen's active page content wins over an OS-level Raycast selection whenever Zen has something usable to show.
- Keep the Raycast-selection fallback as a genuine last resort (e.g. a Zen New Tab page, an unsupported page, or a page Zen can't extract content from) rather than removing it — it remains useful in those cases.
- Preserve all existing error semantics: when nothing at all is usable (no Zen selection, no usable active page, no OS-level selection), the same `content_unavailable`-style error is still surfaced.
- No change to how a `raycast-selection` result is labeled or reported — Spec 017's fix (no misleading Zen title/URL attached to it) is unaffected.

## Non-Goals

- No change to the Zen DOM selection tier — it still always wins when present.
- No new configuration/preference to control fallback order — this is a fixed behavior change based on user feedback, not a user-facing option.
- No change to `zen_get_active_context` (which doesn't use this fallback chain at all).

## Proposed Design

- `raycast/src/smartSummarize.ts`: `resolveSmartSummarizeContext` now checks `zen-selection`, then fetches and checks the active page (via a new non-throwing `getUsablePageMarkdownOrUndefined`, factored out of the existing throwing `getUsablePageMarkdown`), returning it immediately if usable. Only when the active page is unusable does it fall through to `raycast-selection`. If neither is usable, it re-derives the same `content_unavailable` error as before by calling the throwing `getUsablePageMarkdown` one last time.
- `raycast/src/zenAiToolsCore.ts`: `zenGetSelectionOrPage` mirrors this — after the Zen DOM selection check, it fetches the active page context and evaluates usability via a new non-throwing `getContentUsabilityError` (factored out of the existing throwing `requireRealContentContext`, reusing its exact classification and format-specific rules for markdown/text/json). If the page is usable, or the caller passed `requireContent: false` (opting out of the content check entirely), it returns `active-page` immediately without ever calling `getRaycastSelectedText`. Otherwise it tries the Raycast selection; if that's also empty, it throws the same content-usability error the page context would have produced.
- Both changes reuse 100% of the existing usability-classification logic (`classifyZenContextContent`, `requireRealMarkdownContext`, per-format checks) via a throwing/non-throwing pair of functions, rather than duplicating or approximating those rules — this avoids drift between "is this good enough" and "what error do we show when it's not."

## API Or Contract

No change to `SmartSummarizeContext` or `ZenGetSelectionOrPageData`'s shape. Behavior change only: for a given Zen state, the `source`/`kind` returned when there is no Zen DOM selection may now be `"active-page"` in cases that previously returned `"raycast-selection"` (specifically: whenever Zen has a usable page and something happens to be selected in another app). `"raycast-selection"` is still returned, unchanged, whenever Zen has nothing usable — that scenario's output is identical to before this spec.

## Security And Permissions

No changes. `getSelectedText()` usage, its permission model, and the metadata rules from Spec 017 are all unaffected — this spec only changes when that fallback tier is reached.

## Alternatives Considered

- **Remove the Raycast-selection fallback entirely.** Rejected: it remains genuinely useful when Zen has no usable page (a New Tab page, an unsupported page, a page mozeidon can't extract from), and removing it would lose real functionality to fix what was actually an ordering bug, not a fundamentally broken feature.
- **Only reorder Smart Summarize, leave `zen_get_selection_or_page` as-is.** Rejected: both call sites share the identical design rationale and the same user-facing confusion would persist for `@zen` AI tool consumers otherwise.

## Test Plan

- `cd raycast && npm test`: updated 4 tests in `smartSummarize.test.ts` and 4 in `zenAiTools.test.ts` to reflect the new preference order (active page over Raycast selection when the page is usable); added new tests confirming Raycast selection is still used when the active page is genuinely unusable. 124/124 pass.
- `cd raycast && npm run lint && npm run build`.
- No new component-level tests: this is pure fallback-selection logic in already-tested pure functions (`resolveSmartSummarizeContext`, `zenGetSelectionOrPage`), consistent with existing coverage.
- Manual Zen verification recommended before considering this fully verified (see below), though the pure-function coverage above exercises every branch of the new ordering.

## Manual Verification With Zen

1. With Zen showing a normal page (no DOM selection there) and some unrelated text selected in another app, run Smart Summarize — confirm it summarizes the Zen page, not the unrelated text.
2. With Zen showing a New Tab page (no usable content) and text selected in another app, run Smart Summarize — confirm it still falls back to summarizing that Raycast selection, headed "Raycast Selection Summary".
3. Repeat both scenarios via `@zen`'s `zen_get_selection_or_page` tool and confirm the same `kind` values.

## Follow-Up Fix: Deferred Active-Page Fetch Errors

Post-merge Copilot review correctly flagged that `getActivePageMarkdown()`/`dependencies.getContext()` don't just return unusable content sometimes — they can outright throw (CLI failure, native-app IPC error, unsupported-CLI error). In the original ordering, that fetch was the last step, so a throw there only ever mattered when nothing else was available. With the reorder, that fetch now happens much earlier, so a transient failure there would produce a hard error even when a perfectly good Raycast selection was available as a fallback — a real robustness regression versus the pre-Spec-018 behavior.

Fixed in both `resolveSmartSummarizeContext` and `zenGetSelectionOrPage` by wrapping the active-page fetch in its own try/catch and deferring any thrown error: the Raycast-selection last resort is still attempted before the deferred error is rethrown (only when no Raycast selection is available either, restoring the exact prior error). The deferred-error check uses an explicit boolean flag rather than a truthiness check on the caught value, so a legitimately falsy thrown value (`null`, `0`, `""`, `false`) isn't mistaken for "no error." Added 5 tests: 3 in `smartSummarize.test.ts` (including a regression test for a falsy thrown value) and 2 in `zenAiTools.test.ts`.

## Verification Notes

An initial retest looked like the reorder wasn't working — Zen selection didn't win even with text actively highlighted, and active-page reported "content unavailable" on a normal public page. Running `mozeidon context selection`/`context active` directly showed `hasHostPermission: false`, `requiresHostPermission: true` — the custom Zen/Firefox add-on (`firefox-addon/`, loaded as a temporary add-on per the README) had been dropped by a Zen Browser restart during unrelated troubleshooting earlier in the session, and Zen had fallen back to the plain AMO Mozeidon add-on, which intentionally lacks `<all_urls>` and can't extract page content or selection at all. Reloading the custom add-on via `about:debugging` fixed it immediately; this was not a bug in this spec's code. Worth remembering: **any Zen Browser restart during a debugging session silently drops this add-on**, and the resulting symptoms (selection/page content broken, but tabs/bookmarks/history still fine) can look exactly like a real regression.

## Open Questions

None.
