# Spec 005: Zen History Raycast Command

## Summary

Expose Mozeidon browser history workflows in Raycast through a separate History command. The command should list/search history entries, open a selected entry in Zen, and delete a selected history item with confirmation.

## Status

- Implemented in Raycast extension on 2026-04-28.
- Local Zen/Raycast manual verification still required.

## Milestone

M3: Raycast Feature Expansion Over Existing CLI

## Problem

The Raycast extension currently searches open tabs, recently closed tabs, and bookmarks. Mozeidon already exposes history listing and deletion through the CLI, but Raycast does not surface those workflows. Users should be able to search Zen history from Raycast without changing the add-on, native app, or browser permissions.

## Goals

- Add a separate Raycast command for Zen history.
- Fetch history entries using existing Mozeidon CLI history commands.
- Let Raycast search or filter history entries.
- Open a selected history entry in Zen.
- Delete a selected history item only after confirmation.
- Use the existing safe Mozeidon CLI wrapper and profile plumbing.
- Add tests for history parsing and command construction.
- Preserve existing tab/bookmark command behavior.

## Non-Goals

- No native messenger changes.
- No browser add-on changes.
- No browser permission changes.
- No new CLI commands.
- No delete-all-history action in this spec.
- No history write/edit workflows beyond deleting one selected item by URL.
- No AI Extension, MCP, context API, or site adapter behavior.

## Scope

Primary scope is the Raycast extension.

Likely files:

- `raycast/package.json`
- `raycast/src/history.tsx` or equivalent command entry point
- Raycast history action/client helpers
- Raycast interfaces/mappers for history entries
- Raycast tests for parsing and command construction
- Raycast README or Zen Context docs if user-visible behavior needs explanation

Out of scope:

- `cli/`
- `firefox-addon/`
- `chrome-addon/`
- native messenger
- browser permissions

## Current CLI Capability

Use existing Mozeidon CLI commands.

List history:

```text
mozeidon history
```

List a bounded number of history entries:

```text
mozeidon history --max <number>
```

List in chunks:

```text
mozeidon history --chunk <number>
```

Delete a single history item by URL:

```text
mozeidon history delete --url <url>
```

Do not expose `mozeidon history delete --all` in this spec.

The current CLI model shape is:

```ts
type MozeidonHistoryPayload = {
  data: MozeidonHistoryItem[];
};

type MozeidonHistoryItem = {
  id: string;
  url: string;
  title: string;
  tc: number;
  vc: number;
  t: number;
};
```

Where:

- `tc` is typed count.
- `vc` is visit count.
- `t` is last visit time.

## User Workflow

1. User opens the new Raycast history command.
2. Raycast fetches Zen history entries through Mozeidon.
3. User searches by title, URL, domain, or available metadata.
4. User opens a selected history entry.
5. Raycast opens the URL in Zen using the existing new-tab workflow.
6. User can choose `Delete History Item`.
7. Raycast shows a destructive confirmation dialog.
8. If confirmed, Raycast calls `mozeidon history delete --url <url>`.
9. Raycast refreshes or removes the deleted item from the list.

## Proposed Design

### Separate Command

Add a new command to the Raycast extension manifest:

- Name: `history` or `zen-history`
- Title: `Zen History`
- Mode: `view`
- Description: Search and open Zen Browser history via Mozeidon.

The existing `mozeidon` command should remain focused on tabs, recently closed tabs, bookmarks, and opening new tabs.

### Fetching History

Use the safe CLI wrapper.

Recommended initial command:

```ts
["history", "--max", "<configured-or-default-limit>"];
```

Default limit should be conservative enough for Raycast responsiveness. A starting value such as `500` or `1000` is acceptable if performance is verified. If the existing command can handle unbounded history efficiently, the implementation may choose unbounded fetch, but the spec recommends a bounded default for safety and UI responsiveness.

Do not use Go templates for this workflow; parse JSON output through the shared JSON parsing helper.

If chunked streaming is needed for performance, it should use the existing spawn/line streaming wrapper and parse each JSON chunk. Chunked history loading is optional for the first implementation if a bounded `--max` fetch is responsive.

### Filtering And Search

Raycast's built-in list filtering may be sufficient if entries include good titles, subtitles, and keywords.

Searchable fields should include:

- title
- URL
- URL without scheme
- domain when available or derived
- visit count strings if useful
- last visit display text if useful

The default row should remain compact:

- title: history title, falling back to URL
- subtitle: domain or URL without scheme
- accessories: sparse metadata such as visit count or last visited date

Do not put long URLs and metadata into the row in a way that makes the list noisy.

### Opening History Entries

Opening a selected history entry should reuse the existing `openNewTab(url)` flow so Zen app activation behavior stays consistent with current Raycast behavior.

Command construction should be safe through the existing new-tab argument builder:

```ts
buildNewTabArgs(historyItem.url, searchEngineBaseUrl);
```

The URL must be passed as an argument array element, not shell-interpolated.

### Deleting History Items

Add a `Delete History Item` action for selected entries.

Deletion must:

- require explicit confirmation;
- show the target title and URL in the confirmation UI where practical;
- call only URL-specific deletion;
- never call `history delete --all`;
- refresh or remove the item from local state after success;
- show a clear error toast on failure.

Command construction:

```ts
buildDeleteHistoryItemArgs(item);
// ["history", "delete", "--url", "<url>"]
```

Suggested confirmation copy:

- Title: `Delete History Item?`
- Primary action: `Delete`
- Message: selected title and URL, truncated by Raycast if needed

## API Or Contract

Add typed history models in Raycast:

```ts
interface MozeidonHistoryItem {
  id: string;
  url: string;
  title: string;
  tc: number;
  vc: number;
  t: number;
}

interface HistoryItem {
  id: string;
  title: string;
  url: string;
  domain: string;
  typedCount?: number;
  visitCount?: number;
  lastVisitTime?: number;
}
```

Normalize optional or invalid fields defensively:

- title may be empty; fall back to URL.
- URL may be malformed; do not crash the UI.
- `tc`, `vc`, and `t` may be absent, zero-like, or invalid; ignore invalid values.

If `id` is missing or unstable, use URL plus last visit time as a Raycast list id fallback. Do not rely on `id` for delete correctness; delete uses URL.

## Security And Permissions

History is sensitive browsing data.

### User-Derived Inputs

Search text and selected URLs must never be interpolated into shell strings.

### Command Execution

All history commands must use the safe CLI wrapper with argument arrays.

### Destructive Action Safety

Deleting a history item is destructive and must require confirmation.

Do not expose delete-all-history in this spec.

### Browser Permissions

No browser permission changes. The current add-on already has history capability.

### Storage

Do not persist history entries outside Raycast process state.

### Network Behavior

No new network behavior beyond opening a selected URL in Zen.

## Alternatives Considered

### Add History To Existing Mozeidon Command Dropdown

Rejected for this spec. History is a distinct workflow with different privacy and destructive-action expectations. A separate command makes it easier to find and easier to constrain.

### Expose Delete All History

Rejected. It is too destructive for this milestone and should require a dedicated safety spec if ever added.

### Add CLI Search First

Rejected for the first Raycast implementation. Raycast can search/filter fetched entries locally using existing CLI output. CLI-side search can be considered later if bounded fetch is not performant.

### Change Add-On Or Native App

Rejected. Existing CLI history commands are sufficient for this spec.

## Test Plan

### Unit Tests

Add tests for:

- parsing `mozeidon history` JSON payloads;
- mapping history payloads into Raycast history items;
- title fallback when title is empty;
- URL/domain fallback when URL is malformed;
- invalid or zero-like visit metadata being ignored;
- command args for fetching history;
- command args for deleting a selected history URL;
- profile id insertion through the shared wrapper;
- open history entry uses the existing new-tab argument construction;
- dangerous delete-all command is not produced by item deletion helpers;
- user-provided URLs are passed as args, not interpolated into shell commands.

Tests should mock child process execution or test pure argument builders. They should not invoke a real Mozeidon binary.

### Validation Commands

- `cd raycast && npm test`
- `cd raycast && npm run lint`
- `cd raycast && npm run build`

## Manual Verification

Use local Zen Browser with Mozeidon CLI, native app, and add-on installed.

1. Open Raycast and confirm the new `Zen History` command appears.
2. Open the command and verify history entries load.
3. Search by title and verify matching entries remain visible.
4. Search by domain or URL and verify matching entries remain visible.
5. Open a selected entry and verify Zen opens the URL.
6. Confirm existing Zen app activation behavior is unchanged.
7. Select a history entry and trigger `Delete History Item`.
8. Cancel the confirmation and verify no deletion occurs.
9. Trigger `Delete History Item` again and confirm deletion.
10. Verify the item disappears from Raycast after deletion or after refresh.
11. Verify the deleted URL no longer appears in Zen history or `mozeidon history`.
12. Verify no action deletes all history.
13. Verify the existing Mozeidon tab/bookmark command still works.

## Rollout Plan

1. Add history types, mapper, and command argument builder tests.
2. Add history fetch and delete helpers using the safe CLI wrapper.
3. Add the separate Raycast command entry in `package.json`.
4. Build the `Zen History` list UI.
5. Add open and confirmed-delete actions.
6. Add local refresh/removal behavior after deletion.
7. Run automated validation.
8. Perform manual Zen verification.

## Acceptance Criteria

- History command appears in Raycast.
- History entries load from existing Mozeidon CLI history output.
- Raycast search/filter works for history entries.
- Opening a history entry works.
- Deleting a history item requires confirmation.
- Deletion uses `mozeidon history delete --url <url>` only.
- All Mozeidon invocations use the safe CLI wrapper and argument arrays.
- No native messenger changes.
- No browser add-on changes.
- No browser permission changes.
- Tests cover parsing and command construction.
- `cd raycast && npm run lint` passes.
- `cd raycast && npm run build` passes.

## Decisions

- Add a separate Raycast command for history rather than adding history to the existing tab/bookmark command.
- Use existing CLI commands: `history`, optional `--max`, optional `--chunk`, and `history delete --url`.
- Do not expose `history delete --all`.
- Use confirmation for every history item deletion.
- Use the existing open-new-tab behavior for opening history entries.

## Progress Log

- 2026-04-28: Added Raycast history parsing and command-construction helpers with unit coverage.
- 2026-04-28: Added the separate `Zen History` Raycast command using existing Mozeidon history CLI commands.
- 2026-04-28: Kept native messenger, add-on permissions, browser permissions, and CLI behavior unchanged.
