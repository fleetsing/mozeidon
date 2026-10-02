# Spec 022: Paginate "Zen History" Rendering to Fix Extension Memory-Limit Crash

## Summary

"Zen History" rendered its entire fetched history as `List.Item`s at once, which blew past Raycast's 100 MB extension JS heap limit on a large-enough history (confirmed at ~7,700 items). Fix: keep fetching and searching the full history in memory as before, but render it through Raycast's built-in `List` pagination, mounting only one page (50 items) at a time and growing as the user scrolls.

## Status

- Implemented

## Problem

The user reported "Zen History" hitting an out-of-memory bug, suspecting it was loading too many entries at once.

Raycast's own log (`~/Library/Logs/com.raycast.macos/raycast-x-*.log`) confirmed the exact same error as Spec 021's: `Command terminated after reaching the extension memory limit (100 MB JS heap)`. However, this is **not** a recurrence of Spec 021's bug:

- Spec 021 fixed an orphaned `mozeidon` child process accumulating heap *across repeated launches* in one long-lived dev session (~6,000 items at the time, not correlated with a single run's data volume). That fix (killing the process in `streamMozeidonLines`'s `finally` block) has been on `main` since 2026-09-17 and is unchanged.
- This crash instead happened within a **single** "Zen History" launch. The log's `Transferred extension subprocesses to the native reaper` line shows exactly one still-running `mozeidon` child at the moment of the crash — i.e. the command's own worker process (not an orphan from a prior launch) ran out of heap mid-run.

The actual history size was confirmed directly: `mozeidon history -m 100000` returns 7,719 items as ~2 MB of JSON in ~0.2s — fetching the data is cheap and fast, ruling out the CLI call itself as the bottleneck.

`history.tsx` streamed history in CLI-side chunks of 500 (`getHistoryChunks`, unrelated to UI rendering) but appended every chunk directly into React state and rendered the *entire* accumulated array as `List.Item`s with no cap:

```tsx
<List.Section title={`${sortedHistoryItems.length} History Items`}>
  {sortedHistoryItems.map((item) => <HistoryListItem key={item.id} item={item} ... />)}
</List.Section>
```

By the time all chunks arrived, up to 7,719 `List.Item` elements (each with an icon, accessories, and an `ActionPanel`) were mounted simultaneously. That's what exhausted the 100 MB heap cap — a real data-volume problem, just not the same mechanism as Spec 021, and not something `mozeidon history`'s own size (2 MB raw JSON) would suggest on its own.

## Goals

- Keep "Zen History" working for histories much larger than today's (~7,700 items) without hitting Raycast's extension memory limit.
- Preserve existing behavior: full-history search, delete, open, and progressive loading feedback while the CLI streams in the data.

## Proposed Design

Decouple *fetching* (unchanged: still streams all chunks into an in-memory array once per launch; cheap, ~0.2s/2MB) from *rendering* (now paginated):

- Add `filterHistoryItems(items, searchText)` to `historyMappers.ts`: a pure substring match (case-insensitive) over title, URL, scheme-stripped URL, domain, and visit count — the same fields the old `keywords` prop exposed to Raycast's built-in filtering.
- In `history.tsx`, disable Raycast's built-in filtering (`filtering={false}`) and drive search manually via `onSearchTextChange`, since built-in filtering only matches against currently-*rendered* items — incompatible with pagination, where most items aren't mounted yet.
- Track a `page` state and slice `filteredHistoryItems` to `(page + 1) * PAGE_SIZE` (50) for what's actually rendered; wire Raycast's `List` `pagination` prop (`pageSize`, `hasMore`, `onLoadMore`) to grow `page` as the user scrolls.
- Reset `page` to 0 whenever the search text changes, so a new search doesn't leave pagination pointing past the end of a newly-filtered (and likely much smaller) list.
- Drop the now-dead `keywords` prop on `List.Item` (Raycast ignores it once `filtering={false}`).

This bounds rendered-element memory to a constant page size regardless of total history size, while keeping the full dataset in memory for instant, complete search (filtering 7,700 plain objects by substring is sub-millisecond — negligible compared to the cost of mounting thousands of React elements).

## Non-Goals

- No change to `getHistoryChunks`/`streamMozeidonLines`/`mozeidonClient.ts` — the Spec 021 process-cleanup fix is correct and unrelated to this bug.
- No fuzzy matching in the custom search (substring only) — a reasonable simplification; Raycast's built-in fuzzy ranking isn't replicated.
- No change to "Zen Bookmarks" (`bookmarks.tsx`), which doesn't share this code path and has historically had far fewer items; revisit only if it's reported to hit the same limit.

## API Or Contract

No change to the `mozeidon` CLI or any shared `zenAiToolsCore`/MCP-facing contract. Purely internal to the Raycast "Zen History" command's UI.

## Security And Permissions

None.

## Alternatives Considered

- **Cap total fetched history with `-m`.** Would silently hide older entries from search entirely; rejected in favor of keeping full-history search while only bounding what's rendered.
- **`usePromise`'s built-in pagination helper (`@raycast/utils`).** Raycast's documented pattern for data sources that are *themselves* paginated (e.g. a remote API called page-by-page). Here the CLI already returns everything cheaply in one fast call, so introducing an async-paginated-fetch abstraction over already-in-memory data would add indirection without benefit; plain state (`page`, `visibleHistoryItems`) is simpler and keeps the existing pure-logic-in-`historyMappers.ts` testing convention intact.

## Test Plan

- `cd raycast && npm test` — 143/143 pass. Added `filterHistoryItems matches across title, url, domain, and visit count` covering: title/URL/domain match, case-insensitivity, visit-count match, blank search returns everything, and a non-matching query returns empty.
- `cd raycast && npm run lint && npm run build` — both clean.

## Manual Verification With Zen

1. Rebuilt and reloaded via `npm run dev`.
2. User confirmed "Zen History" loads without the memory-limit crash, with search and scrolling working, against their real ~7,700-item history.

## Open Questions

None.
