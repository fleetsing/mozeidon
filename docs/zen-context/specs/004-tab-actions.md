# Spec 004: Additional Tab Actions In Raycast

## Summary

Expose additional existing Mozeidon tab actions from the Raycast Action Panel for opened Zen tabs. Actions should use the safe Raycast CLI wrapper, appear only when applicable to the selected item, refresh UI state after completion, and avoid destructive surprises.

## Status

- Implemented in Raycast extension on 2026-04-28.
- Local Zen/Raycast manual verification still required.

## Milestone

M3: Raycast Feature Expansion Over Existing CLI

## Problem

The Raycast extension currently supports core tab workflows such as switch, close, open URL/search, recently closed tabs, and bookmarks. Mozeidon CLI already exposes more tab operations that can make keyboard workflows faster, but those actions are not available from the Raycast Action Panel.

This spec defines a Raycast-only expansion path for tab actions while preserving existing behavior and safety constraints.

## Goals

- Add useful tab actions to the Raycast Action Panel where existing Mozeidon CLI commands support them.
- Prefer Raycast-only changes using the existing safe CLI wrapper.
- Show actions only for selected items that support them.
- Refresh or update Raycast UI state after actions.
- Avoid destructive surprises.
- Add tests for command construction and action availability.
- Keep existing switch/open/close behavior working.

## Non-Goals

- No native messenger changes.
- No browser permission changes.
- No new Raycast commands.
- No page content extraction.
- No site adapter behavior.
- No tab group creation UI unless a separate spec defines it.
- No broad browser management dashboard.

## Candidate Actions

Opened Zen tabs:

- Pin tab.
- Unpin tab.
- Duplicate tab.
- Move tab to start.
- Move tab to end.
- Move tab to group.
- Ungroup tab.

Existing actions that must continue working:

- Switch/open tab.
- Close tab.
- Copy URL.
- Open recently closed tab.
- Open bookmark.
- Open new empty tab.
- Open search or URL query.

## Scope

Primary scope is the Raycast extension.

Likely files:

- Raycast action components.
- Raycast Mozeidon action/client helpers.
- Raycast tab types/mappers if action availability depends on metadata.
- Raycast tests for command construction and action availability.
- Raycast README or Zen Context docs if user-visible behavior needs explanation.

Out of scope unless existing CLI commands cannot perform the action:

- `cli/`
- `firefox-addon/`
- `chrome-addon/`
- native messenger

If an action cannot be implemented using the current CLI, document that as a blocker or follow-up instead of changing lower layers immediately.

## Current CLI Capability

Use the actual command shapes registered by the current Go CLI.

Pin:

```text
mozeidon tabs update --tab-id <tabId> --window-id <windowId> --pin=true
```

Unpin:

```text
mozeidon tabs update --tab-id <tabId> --window-id <windowId> --pin=false
```

Duplicate:

```text
mozeidon tabs duplicate --tab-id <tabId> --window-id <windowId>
```

Move to start:

```text
mozeidon tabs update --tab-id <tabId> --window-id <windowId> --tab-index 0
```

Move to end:

```text
mozeidon tabs update --tab-id <tabId> --window-id <windowId> --tab-index -1
```

Move to existing group:

```text
mozeidon tabs update --tab-id <tabId> --window-id <windowId> --group-id <groupId>
```

Ungroup:

```text
mozeidon tabs update --tab-id <tabId> --window-id <windowId> --group-id -1
```

Important implementation notes:

- Use `--tab-index`, not `--index`. The CLI reference has an example using `--index`, but the actual Go command registers the flag as `--tab-index` with short flag `-i`.
- Use `--pin=true` and `--pin=false` explicitly rather than relying on boolean flag shorthand.
- Basic move-to-existing-group and ungroup are supported by the current CLI through `tabs update --group-id`.
- Do not invent new CLI commands.

## User Workflow

1. User opens the existing Raycast Mozeidon command.
2. User selects an opened Zen tab.
3. Raycast Action Panel shows only relevant tab actions.
4. User triggers an action.
5. Raycast invokes Mozeidon through the safe CLI wrapper.
6. Raycast updates the current list state or refetches opened tabs.
7. User can continue using the list without stale or misleading state.

## Proposed Design

### Action Availability

Actions should be shown only when the selected item supports them:

- Pin tab: opened tab only, visible when `tab.pinned === false`.
- Unpin tab: opened tab only, visible when `tab.pinned === true`.
- Duplicate tab: opened tab only.
- Move tab to start: opened tab only; hidden or disabled if already first when reliable index metadata is available.
- Move tab to end: opened tab only; hidden or disabled if already last when reliable index/window metadata is available.
- Move tab to group: opened tab only, visible only when group metadata and at least one valid target group are available.
- Ungroup tab: opened tab only, visible only when the tab has a valid group id.

Recently closed tabs and bookmarks should keep their current open/copy behavior and should not show opened-tab mutation actions.

### Command Execution

All actions must use the safe Mozeidon CLI wrapper and argument arrays.

Action helpers should be small and testable, for example:

```ts
buildPinTabArgs(tab)
// ["tabs", "update", "--tab-id", "<tabId>", "--window-id", "<windowId>", "--pin=true"]

buildUnpinTabArgs(tab)
// ["tabs", "update", "--tab-id", "<tabId>", "--window-id", "<windowId>", "--pin=false"]

buildDuplicateTabArgs(tab)
// ["tabs", "duplicate", "--tab-id", "<tabId>", "--window-id", "<windowId>"]

buildMoveTabToStartArgs(tab)
// ["tabs", "update", "--tab-id", "<tabId>", "--window-id", "<windowId>", "--tab-index", "0"]

buildMoveTabToEndArgs(tab)
// ["tabs", "update", "--tab-id", "<tabId>", "--window-id", "<windowId>", "--tab-index", "-1"]

buildMoveTabToGroupArgs(tab, groupId)
// ["tabs", "update", "--tab-id", "<tabId>", "--window-id", "<windowId>", "--group-id", "<groupId>"]

buildUngroupTabArgs(tab)
// ["tabs", "update", "--tab-id", "<tabId>", "--window-id", "<windowId>", "--group-id", "-1"]
```

Exact names can differ, but command construction should be separated from Raycast UI components.

### UI Refresh

After an action completes:

- pin/unpin should update local tab state or refetch opened tabs;
- duplicate should refetch opened tabs;
- move actions should refetch opened tabs or update local ordering only if the resulting order is deterministic;
- move to group/ungroup should refetch opened tabs;
- close tab should keep existing behavior or be folded into the same refresh pattern only if it preserves behavior.

Do not leave rows showing stale pinned/group/order state after mutation.

### Safety

Avoid destructive surprises:

- Closing tabs remains destructive, but this spec must not change existing close-tab behavior. Leave close-tab confirmation for the dedicated destructive-action safety spec.
- Pin/unpin, duplicate, move, group, and ungroup are generally reversible or low-risk but must have clear labels.
- Do not make destructive actions the easiest accidental default if future UI changes reorder actions.

Suggested labels:

- `Pin Tab`
- `Unpin Tab`
- `Duplicate Tab`
- `Move Tab to Start`
- `Move Tab to End`
- `Move Tab to Group`
- `Ungroup Tab`

## API Or Contract

This spec should not change CLI JSON output shapes.

Raycast action helpers should accept typed tab objects and return command argument arrays.

```ts
buildDuplicateTabArgs(tab)
// ["tabs", "duplicate", "--tab-id", "<tabId>", "--window-id", "<windowId>"]
```

Tests must lock in the real command shapes listed in this spec.

The optional Raycast `profileId` preference must continue to apply through the shared wrapper.

### Group Selection

Move-to-existing-group and ungroup are supported by the current CLI through `tabs update --group-id`; no add-on or native messenger work is needed.

For move-to-group, use existing group metadata from Spec 003 when available. If group metadata is not already available in the selected tab list state, fetch groups with:

```text
mozeidon groups get
```

Then call:

```text
mozeidon tabs update --tab-id <tabId> --window-id <windowId> --group-id <groupId>
```

Creating a brand-new group from a tab through `tabs init-group` is not required for Spec 004. It can be a later spec, or optional only if it stays very small.

## Security And Permissions

### User-Derived Inputs

Group selection, if implemented, is user-derived input. It must be passed as an argument array element, not shell-interpolated.

### Page-Derived Inputs

This spec does not add page-derived inputs.

### Command Execution

All Mozeidon invocations must use the safe CLI wrapper and argument arrays.

### Browser Permissions

No browser permission changes.

### Storage

No new storage.

### Network Behavior

No new network behavior.

## Alternatives Considered

### Do Nothing

Rejected because existing CLI capabilities can improve Raycast keyboard workflows without changing lower layers.

### Add Separate Raycast Commands For Each Action

Rejected for this spec. These are selected-tab actions and belong in the existing Action Panel.

### Change The CLI First

Rejected unless implementation proves the current CLI cannot perform a candidate action.

### Create New Groups In This Spec

Deferred. Creating a brand-new group from a tab through `tabs init-group` can be a later spec or an optional small follow-up, but it is not required here.

## Test Plan

### Unit Tests

Add tests for:

- command args for pin tab;
- command args for unpin tab;
- command args for duplicate tab;
- command args for move tab to start;
- command args for move tab to end;
- command args for move tab to group;
- command args for ungroup tab;
- profile id insertion still applies through the shared wrapper;
- action availability for opened tabs vs recently closed tabs/bookmarks;
- pin action hidden for pinned tabs and unpin action hidden for unpinned tabs;
- group actions hidden when group metadata is absent;
- ungroup action hidden for ungrouped tabs.

Tests should mock child process execution or test pure argument builders. They should not invoke a real Mozeidon binary.

### Validation Commands

- `cd raycast && npm test` if a test script exists.
- `cd raycast && npm run lint`
- `cd raycast && npm run build`

## Manual Verification

Use local Zen Browser with Mozeidon CLI, native app, and add-on installed.

1. Open Raycast Mozeidon command.
2. Select an opened unpinned tab and verify `Pin Tab` appears.
3. Pin the tab and verify the UI refreshes to show pinned state.
4. Select a pinned tab and verify `Unpin Tab` appears.
5. Unpin the tab and verify the UI refreshes.
6. Duplicate an opened tab and verify the duplicate appears.
7. Move a tab to start and verify ordering in Zen and Raycast.
8. Move a tab to end and verify ordering in Zen and Raycast.
9. If group metadata and CLI support are available, move a tab to a group and verify group metadata updates.
10. If grouped, ungroup a tab and verify group metadata is removed.
11. Confirm switch/open/close behavior still works.
12. Confirm recently closed tabs and bookmarks do not show opened-tab mutation actions.

## Rollout Plan

1. Confirm actual CLI command shapes from local code and docs.
2. Add pure argument builder and action availability tests.
3. Add Raycast action helpers using the safe CLI wrapper.
4. Add Action Panel items for supported actions.
5. Add UI refresh behavior after actions.
6. Run automated validation.
7. Perform manual Zen smoke verification.

## Acceptance Criteria

- Actions work on Zen opened tabs where supported by existing CLI commands.
- Actions appear only when the selected item supports them.
- Existing switch/open/close behavior still works.
- Raycast uses the safe CLI wrapper for all new Mozeidon calls.
- Raycast refreshes or updates UI after actions.
- No native messenger changes.
- No browser permission changes.
- Tests cover command construction and action availability.
- `cd raycast && npm run lint` passes.
- `cd raycast && npm run build` passes.

## Decisions

- Use `tabs update --tab-id <tabId> --window-id <windowId> --pin=true` for pinning.
- Use `tabs update --tab-id <tabId> --window-id <windowId> --pin=false` for unpinning.
- Use `tabs duplicate --tab-id <tabId> --window-id <windowId>` for duplication.
- Use `tabs update --tab-id <tabId> --window-id <windowId> --tab-index 0` for move to start.
- Use `tabs update --tab-id <tabId> --window-id <windowId> --tab-index -1` for move to end.
- Use `tabs update --tab-id <tabId> --window-id <windowId> --group-id <groupId>` for move to existing group.
- Use `tabs update --tab-id <tabId> --window-id <windowId> --group-id -1` for ungroup.
- Use `--tab-index`, not `--index`.
- Use explicit `--pin=true` and `--pin=false`.
- Move-to-existing-group and ungroup require no add-on or native messenger changes.
- Creating new groups is not required for this spec.
- Do not change existing close-tab behavior in this spec; leave close-tab confirmation to the destructive-action safety spec.

## Progress Log

- 2026-04-28: Added Raycast-only tab action command builders, action availability helpers, Action Panel items, open-tab refresh after mutations, and unit coverage for command shapes and visibility rules.
- 2026-04-28: Kept native messenger, browser add-on permissions, and Raycast command list unchanged.
