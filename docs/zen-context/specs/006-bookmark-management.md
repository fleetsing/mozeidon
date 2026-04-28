# Spec 006: Bookmark Management In Raycast

## Summary

Expose Mozeidon bookmark create, update, and delete workflows in the Raycast extension while preserving the existing bookmark search/open behavior. Bookmark mutations should use existing Mozeidon CLI commands, the safe CLI wrapper, and explicit confirmation for destructive deletion.

## Status

- Implemented
- Manual Zen verification still required.

## Milestone

M3: Raycast Feature Expansion Over Existing CLI

## Problem

The Raycast extension can already search and open bookmarks, but it cannot create, edit, or delete bookmarks. Mozeidon already exposes bookmark write operations through the CLI, so Raycast can add practical bookmark management without changing the browser add-on, native messenger, or browser permissions.

## Goals

- Preserve existing bookmark search and open behavior.
- Add bookmark creation for an opened Zen tab where existing tab data is available.
- Add bookmark creation for the active/current Zen tab if it can be derived from existing open-tab data.
- Add edit bookmark action for existing bookmarks.
- Add delete bookmark action with confirmation.
- Use the existing safe Mozeidon CLI wrapper and profile plumbing.
- Add tests for command construction, parsing/mapping compatibility, and destructive-action safety.
- Document manual verification with Zen.

## Non-Goals

- No native messenger changes.
- No browser add-on changes.
- No browser permission changes.
- No new CLI commands.
- No new Raycast top-level command unless implementation proves the existing command cannot support the workflow clearly.
- No bookmark folder browser/tree UI.
- No bulk bookmark operations.
- No delete-folder behavior.
- No automatic bookmark synchronization or caching changes.

## Scope

Primary scope is the Raycast extension.

Likely files:

- Existing Raycast tab/bookmark list components and actions.
- Raycast Mozeidon action/client helpers.
- Raycast bookmark command builders or mapper helpers.
- Raycast tests for command construction and action availability.
- Raycast docs or Zen Context spec progress notes.

Out of scope:

- `cli/`
- `firefox-addon/`
- `chrome-addon/`
- native messenger
- browser permissions

## Current CLI Capability

Use existing Mozeidon CLI commands.

List bookmarks:

```text
mozeidon bookmarks
```

The current Raycast extension streams bookmarks with:

```text
mozeidon bookmarks -c 1000
```

Create bookmark:

```text
mozeidon bookmark new --title <title> --url <url>
```

Create bookmark in a folder:

```text
mozeidon bookmark new --title <title> --url <url> --folder-path <path>
```

Update bookmark:

```text
mozeidon bookmark update <id> --title <title>
mozeidon bookmark update <id> --url <url>
mozeidon bookmark update <id> --folder-path <path>
mozeidon bookmark update <id> --title <title> --url <url>
```

Delete bookmark:

```text
mozeidon bookmark delete <id>
```

Bookmark payload shape from current CLI:

```ts
type MozeidonBookmark = {
  id: string;
  title: string;
  url: string;
  parent: string;
};
```

Folder path rules:

- `--folder-path` must start and end with `/`.
- Folder paths are rooted at the bookmarks bar tree.
- Omitting `--folder-path` creates in the browser default bookmark location.
- Some browser default bookmark folders are not valid `--folder-path` targets for moving.

## User Workflow

### Existing Bookmark Search

1. User opens the existing Mozeidon Raycast command.
2. User switches to `Bookmarks`.
3. Existing bookmark search results load and remain searchable.
4. User opens or copies a bookmark as before.

### Add Bookmark For Selected Opened Tab

1. User opens the existing Mozeidon Raycast command.
2. User selects an opened tab.
3. Action Panel shows `Add Bookmark` when the selected item has a valid URL.
4. Raycast opens a form or action flow prefilled with tab title and URL.
5. User confirms creation.
6. Raycast calls `mozeidon bookmark new --title <title> --url <url>` with optional folder path if provided.
7. Raycast shows success or error feedback.

### Add Bookmark For Current Active Tab

If current active tab can be derived from existing open-tab data:

1. Raycast identifies an opened tab where `active === true`.
2. A suitable `Add Current Tab Bookmark` action is exposed when the open-tab list is available.
3. The same creation flow is used with the active tab title and URL.

If active/current tab cannot be derived reliably from existing Raycast data, this part should be documented as a follow-up instead of changing lower layers.

### Edit Bookmark

1. User selects a bookmark.
2. Action Panel shows `Edit Bookmark`.
3. Raycast opens a form prefilled with title, URL, and current parent/folder display where practical.
4. User submits changes.
5. Raycast calls `mozeidon bookmark update <id>` with only the fields that changed.
6. Raycast refreshes bookmark state or updates the edited item locally.

### Delete Bookmark

1. User selects a bookmark.
2. Action Panel shows `Delete Bookmark`.
3. Raycast shows a destructive confirmation dialog with bookmark title and URL.
4. If confirmed, Raycast calls `mozeidon bookmark delete <id>`.
5. Raycast removes the item locally or refreshes bookmarks.

## Proposed Design

### Placement

Prefer adding actions to the existing Mozeidon command rather than adding a new top-level Raycast command.

Relevant actions:

- For opened tabs:
  - `Add Bookmark`
- For active/current opened tab:
  - optional `Add Current Tab Bookmark`, only if active tab data is available from existing loaded tabs
- For bookmarks:
  - `Edit Bookmark`
  - `Delete Bookmark`

Recently closed tabs should not show bookmark mutation actions unless implementation deliberately supports adding a recently closed URL as a new bookmark. That is optional and not required for this spec.

### Command Builders

Add pure command-builder helpers.

Create:

```ts
buildCreateBookmarkArgs({ title, url, folderPath });
// ["bookmark", "new", "--title", "<title>", "--url", "<url>"]
// ["bookmark", "new", "--title", "<title>", "--url", "<url>", "--folder-path", "<path>"]
```

Update:

```ts
buildUpdateBookmarkArgs({ id, title, url, folderPath });
// ["bookmark", "update", "<id>", "--title", "<title>", "--url", "<url>", "--folder-path", "<path>"]
```

Only include changed non-empty fields. Do not call update if no fields changed.

Delete:

```ts
buildDeleteBookmarkArgs(bookmark);
// ["bookmark", "delete", "<id>"]
```

All commands must use the safe Mozeidon wrapper and argument arrays.

### Create Bookmark UX

Use a Raycast form or equivalent action flow with:

- title field, prefilled from tab title;
- URL field, prefilled from tab URL;
- optional folder path field.

Folder path should be optional. If provided, Raycast should trim it and either:

- require it to start and end with `/`, or
- show a clear validation/error message before running the CLI.

Do not invent a folder picker in this spec.

### Edit Bookmark UX

Use a Raycast form or equivalent action flow with:

- title field, prefilled from bookmark title;
- URL field, prefilled from bookmark URL;
- optional folder path field, prefilled only if there is a reliable folder path value.

The existing bookmark `parent` field may be a display parent and may not always be a valid `--folder-path`. If not reliable, show it as context but do not automatically pass it as `--folder-path`.

The update action should include only fields that changed and are non-empty.

### Delete Bookmark UX

Deleting a bookmark is destructive and must require confirmation.

Suggested confirmation:

- Title: `Delete Bookmark?`
- Message: bookmark title and URL
- Primary action: `Delete`
- Style: destructive

Delete must call only:

```text
mozeidon bookmark delete <id>
```

### Refresh Behavior

After mutation:

- create bookmark: show success and optionally refresh bookmarks if the current view is bookmarks;
- edit bookmark: refresh bookmarks or update local item state;
- delete bookmark: remove the item locally or refresh bookmarks.

Do not break existing progressive bookmark streaming behavior.

## API Or Contract

Existing bookmark model:

```ts
interface MozeidonBookmark {
  id: string;
  parent: string;
  title: string;
  url: string;
}
```

Raycast can continue using the existing mapped `Tab` representation for bookmark list items if that is the least invasive path. If bookmark-specific edit/delete behavior is clearer with a typed `Bookmark` or `BookmarkItem` model, keep that type inside Raycast and preserve current `Tab` behavior for the visible list.

Required data for mutation:

- create: title and URL;
- update: bookmark ID and at least one changed field;
- delete: bookmark ID.

Do not rely on URL for update/delete identity; use bookmark ID.

## Security And Permissions

Bookmarks are sensitive browser data.

### User-Derived Inputs

Title, URL, folder path, and bookmark ID must be passed as argument array elements. They must not be interpolated into shell strings.

### Command Execution

All bookmark write operations must use the safe CLI wrapper.

### Destructive Action Safety

Delete requires confirmation.

Bulk delete is out of scope.

### Browser Permissions

No browser permission changes. The current add-on already has bookmark capability.

### Storage

Do not persist bookmark data outside Raycast process state.

### Network Behavior

No new network behavior beyond opening existing bookmark URLs or tab URLs as already supported.

## Alternatives Considered

### Add A Separate Bookmark Manager Command

Deferred. The existing Mozeidon command already has a bookmarks section, and keeping management actions there preserves the current mental model.

### Add A Folder Picker

Deferred. Folder path behavior has browser-specific caveats, and a picker may require additional data or UX work. A typed optional folder path field is enough for this spec.

### Add Bookmark Support To Recently Closed Items

Deferred. It may be useful, but the required goal is selected/current tab and existing bookmarks. Recently closed items can remain open/copy only.

### Change CLI Or Add-On For Current Tab

Rejected for this spec. Add current/selected tab only if existing Raycast open-tab data is enough.

## Test Plan

### Unit Tests

Add tests for:

- create bookmark args with title and URL;
- create bookmark args with optional folder path;
- update bookmark args with changed title;
- update bookmark args with changed URL;
- update bookmark args with optional folder path;
- update helper refusing or returning no command when no fields changed;
- delete bookmark args by ID;
- profile id insertion through the shared wrapper;
- user-derived title, URL, folder path, and ID passed as args without shell interpolation;
- folder path validation;
- action availability:
  - opened tabs can show `Add Bookmark`;
  - bookmarks can show edit/delete;
  - recently closed entries do not show bookmark mutation actions by default;
- bookmark mapping/search still preserves existing behavior.

Tests should mock child process execution or test pure command builders. They should not invoke a real Mozeidon binary.

### Validation Commands

- `cd raycast && npm test`
- `cd raycast && npm run lint`
- `cd raycast && npm run build`

## Manual Verification

Use local Zen Browser with Mozeidon CLI, native app, and add-on installed.

1. Open the existing Mozeidon Raycast command.
2. Switch to `Bookmarks` and verify existing bookmark search still works.
3. Open a bookmark and verify existing behavior still works.
4. Select an opened tab and verify `Add Bookmark` appears.
5. Create a bookmark for the selected tab and verify it appears in Zen bookmarks or `mozeidon bookmarks`.
6. If active/current tab support is implemented, verify the active Zen tab can be bookmarked.
7. Edit an existing bookmark title and verify the update persists.
8. Edit an existing bookmark URL and verify the update persists.
9. If folder path editing is implemented, move a bookmark to a valid folder path and verify it persists.
10. Attempt an invalid folder path and verify Raycast shows a clear error without running an unsafe command.
11. Trigger delete bookmark and cancel confirmation; verify the bookmark remains.
12. Trigger delete bookmark and confirm; verify the bookmark is removed.
13. Verify no native messenger, add-on permission, or browser permission changes are required.

## Rollout Plan

1. Add pure bookmark command builder and validation tests.
2. Add Raycast bookmark write helpers using the safe CLI wrapper.
3. Add create bookmark flow for selected opened tabs.
4. Add optional current active tab bookmark action if existing open-tab data supports it cleanly.
5. Add edit bookmark flow for bookmark results.
6. Add confirmed delete bookmark flow.
7. Preserve and verify existing bookmark streaming/search.
8. Run automated validation.
9. Perform manual Zen verification.

## Acceptance Criteria

- Existing bookmark search still works.
- Existing bookmark open/copy behavior still works.
- New bookmark actions work where supported by existing CLI commands.
- Adding a bookmark for a selected opened tab works.
- Adding a bookmark for the active/current tab works if existing open-tab data supports it without lower-layer changes.
- Editing bookmark title and URL works.
- Delete bookmark requires confirmation.
- Delete uses `mozeidon bookmark delete <id>`.
- All bookmark write commands use the safe CLI wrapper and argument arrays.
- No native messenger changes.
- No browser add-on changes.
- No browser permission changes.
- Tests cover command construction and action availability.
- `cd raycast && npm run lint` passes.
- `cd raycast && npm run build` passes.

## Decisions

- Keep bookmark management inside the existing Mozeidon Raycast command.
- Use existing CLI commands: `bookmark new`, `bookmark update`, and `bookmark delete`.
- Use bookmark ID for edit/delete identity.
- Require confirmation for delete.
- Do not add a folder picker in this spec.
- Do not change lower layers for current-tab detection; use existing open-tab data only.

## Progress Log

- 2026-04-28: Implemented Raycast-only bookmark management using pure command builders, the safe Mozeidon CLI wrapper, and existing CLI commands.
- 2026-04-28: Added selected opened-tab bookmark creation through an `Add Bookmark` form. The same flow covers the active/current tab when it is selected in the opened-tabs list; no separate top-level command or lower-layer current-tab API was added.
- 2026-04-28: Added bookmark edit and confirmed delete actions for bookmark results. Edit submits only changed non-empty title/URL values plus an explicitly entered folder path. Delete uses a destructive Raycast confirmation before calling the CLI.
- 2026-04-28: Added unit tests for bookmark command construction, profile insertion, action availability, folder-path validation, existing bookmark mapping, and child-process argument safety.
