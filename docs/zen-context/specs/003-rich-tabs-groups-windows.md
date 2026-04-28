# Spec 003: Rich Tabs, Groups, And Windows In Raycast

## Summary

Use existing Mozeidon CLI capabilities to enrich Raycast tab search with tab group, window id, pinned, active, index, and optional recency metadata where available. The Raycast extension should remain fast and compatible with current tab search behavior, and missing metadata must degrade gracefully.

## Status

- Implemented

## Milestone

M2: Zen Context V1

## Problem

The Raycast extension currently treats open tabs as a flat list with basic fields. Mozeidon CLI can already expose additional tab group context through `--with-groups`, and tab records include a `windowId` when available. Raycast can use this existing data to make tab search more useful for Zen workflows without changing the CLI, add-on, native app, or browser permissions.

## Goals

- Fetch open tabs with group metadata when supported by the current Mozeidon CLI.
- Extend Raycast-side tab parsing/types to represent optional rich metadata.
- Display useful metadata in Raycast list rows and/or details without cluttering the main search workflow.
- Preserve current tab search behavior when rich metadata is missing or unavailable.
- Preserve search performance and avoid unnecessary concurrent Mozeidon commands.
- Add parsing tests for rich tab payloads and absent-field behavior.
- Document which fields may be absent.

## Non-Goals

- No native messenger changes.
- No browser permission changes.
- No new browser add-on permissions.
- No site content extraction.
- No new Raycast commands.
- No tab group mutation UI in this spec.
- No CLI output shape changes unless a required field is proven unavailable.
- No cross-browser parity work beyond consuming existing Mozeidon output.

## Scope

Primary scope is the Raycast extension.

Likely files:

- `raycast/src/interfaces/index.ts`
- Raycast tab mapping/parsing helpers
- Raycast tab list components
- Raycast Mozeidon action/client calls
- Raycast tests
- `raycast/README.md` or Zen Context docs if user-visible fields or limitations need documentation

Out of scope unless current CLI output cannot provide required fields:

- `cli/`
- `firefox-addon/`
- `chrome-addon/`
- native messenger

## Current CLI Capability

The current architecture documentation identifies these relevant commands:

```text
mozeidon tabs get
mozeidon tabs get --with-groups
```

The current CLI reference does not document `--with-windows`, so this spec must not require it. Raycast may use `tab.windowId` when it is present in tab data. Richer window metadata should be handled by a future spec if needed.

The CLI can return group metadata with tab data:

```json
{
  "data": [],
  "groups": []
}
```

This spec should prefer:

```text
mozeidon tabs get --with-groups
```

If `mozeidon tabs get --with-groups` fails or returns a shape without group metadata, Raycast should fall back to plain `mozeidon tabs get` and continue showing basic tabs. Missing rich metadata is not a setup error.

## User Workflow

1. User opens the existing Raycast Mozeidon command.
2. Open tabs still load quickly and remain searchable by title, domain, and URL.
3. When metadata is available, tab rows show useful context such as group title, pinned state, active state, or compact window id.
4. Missing group/window/recency fields do not crash the UI or remove basic tab functionality.
5. Existing tab actions such as switch, close, copy URL, and opening new tabs continue to work.

## Proposed Design

### Fetch Shape

For opened tabs, request group metadata through the existing CLI:

```text
tabs get --with-groups
```

If that command fails or returns no usable group metadata, fall back to:

```text
tabs get
```

Recently closed tabs and bookmarks should keep their current behavior unless a separate spec defines richer metadata for those surfaces. This fallback must preserve the current working tab search UI.

### Types

Extend Raycast-side types carefully so rich fields are optional. Basic tab behavior should not require any new field.

Suggested Raycast-side shape:

```ts
type RichTab = {
  id: string;
  windowId: number;
  title: string;
  url: string;
  domain: string;
  active: boolean;
  pinned: boolean;
  groupId?: number;
  group?: {
    id: number;
    title?: string;
    color?: string;
  } | null;
  index?: number;
  lastAccessed?: number;
};
```

The exact implementation can keep the existing `Tab` class or replace it with a typed object if that is the smallest safe change. Any change must preserve existing component behavior and actions.

### Parsing

Parsing should be split into pure helpers:

- parse CLI payload;
- map tabs;
- index groups by id;
- attach optional metadata.

Handle absent arrays gracefully:

- missing `groups` means every tab has `group: null` or no group;
- missing `groupId`, `index`, or `lastAccessed` remains undefined;
- unknown group ids do not crash mapping;
- missing, invalid, or zero-like `lastAccessed` is ignored.

### Display

Display should stay compact and Raycast-native.

Suggested row behavior:

- title remains the tab title;
- subtitle remains URL/domain oriented;
- pinned tabs show a compact pinned icon or tag;
- group title can appear as a compact accessory when present;
- window label appears only when there is more than one window;
- active/focused indicator appears only when useful;
- last accessed is not shown as a default visible accessory.

Avoid overloading rows with long metadata. Use accessories sparingly and keep the default row close to the current title plus URL/domain behavior.

Recommended visible metadata:

- pinned icon/tag when pinned;
- group title when present;
- window label only when there is more than one window;
- active/focused indicator only when useful.

Recommended searchable-but-hidden metadata:

- domain;
- URL;
- group title;
- window id;
- pinned/active status strings if useful.

### Recency

Treat `lastAccessed` as optional. It may be used for sorting if present and reliable, and may be exposed in debug/detail metadata if useful. It must not be used for identity, correctness, or required UI behavior.

If `lastAccessed` is missing, invalid, or zero-like, ignore it.

### Search Performance

- Keep one Mozeidon CLI call for opened tabs.
- Do not run separate `groups get` or `windows get` calls for this workflow.
- Do not introduce concurrent Mozeidon commands for this workflow.
- Preserve existing bookmarks streaming behavior.
- Keep parsing pure and synchronous over one payload.

## API Or Contract

This spec consumes existing CLI JSON and does not change the CLI contract.

Expected rich tabs payload:

```json
{
  "data": [
    {
      "id": 123,
      "windowId": 456,
      "groupId": 789,
      "pinned": false,
      "domain": "example.com",
      "url": "https://example.com/page",
      "title": "Example Page",
      "active": true,
      "lastAccessed": 1710000000000,
      "index": 3
    }
  ],
  "groups": [
    {
      "id": 789,
      "windowId": 456,
      "title": "Work",
      "color": "blue"
    }
  ]
}
```

Fields that may be absent:

- `groups`
- `groupId`
- `lastAccessed`
- `index`
- group `title`
- group `color`

Window metadata beyond `tab.windowId` is out of scope for this spec.

## Security And Permissions

### User-Derived Inputs

No new user-derived command inputs beyond the existing optional profile preference and tab actions.

### Page-Derived Inputs

This spec uses browser metadata already returned by Mozeidon. It does not extract page content, selected text, DOM, or site metadata.

### Command Execution

All Mozeidon calls must continue to use the safe CLI wrapper and argument arrays.

### Browser Permissions

No permission changes.

### Storage

No new storage.

### Network Behavior

No new network behavior.

## Alternatives Considered

### Keep Basic Tabs Only

Rejected because existing CLI metadata can improve Raycast scanning without broadening permissions or changing the native stack.

### Fetch Groups And Windows Separately

Rejected. Separate calls would increase latency and could stress the current Mozeidon stack. Richer window metadata should be addressed by a future spec if it becomes necessary.

### Require `--with-windows`

Rejected because `--with-windows` is not documented in the current CLI reference. This spec can use `tab.windowId` when present and should not block on richer window metadata.

### Add New Raycast Commands For Groups Or Windows

Deferred. This spec enriches the existing tab search surface only.

### Change CLI JSON Output

Out of scope unless implementation proves the current CLI output cannot provide required metadata.

## Test Plan

### Unit Tests

Add tests with sanitized fixtures for:

- rich payload with `data` and `groups`;
- tab with a valid group reference;
- tab with unknown group id;
- payload missing `groups`;
- payload missing optional `groupId`, `index`, or `lastAccessed`;
- invalid or zero-like `lastAccessed` ignored;
- pinned and active tabs preserving existing fields;
- multiple `windowId` values producing compact window labels only when useful;
- basic payload still mapping successfully.

### Validation Commands

- `cd raycast && npm test` if a test script exists.
- `cd raycast && npm run lint`
- `cd raycast && npm run build`

## Manual Verification

Use local Zen Browser with Mozeidon CLI, native app, and add-on installed.

1. Open several tabs in one Zen window.
2. Confirm basic Raycast tab search still loads and filters.
3. Pin at least one tab and confirm pinned metadata appears.
4. Create or use a grouped tab if Zen/Mozeidon exposes groups, then confirm group metadata appears.
5. Open a second window and confirm a compact window label appears only when useful.
6. Switch tabs from Raycast and confirm existing actions still work.
7. Close a tab from Raycast and confirm existing action behavior remains unchanged.
8. Confirm recently closed tabs and bookmarks still work.
9. Test with a CLI/profile where groups are absent and confirm the UI falls back to basic tabs without crashing.

## Rollout Plan

1. Add fixture-driven parsing tests first.
2. Extend Raycast-side types and mappers with optional metadata.
3. Change opened-tab fetch to request `--with-groups` with fallback to plain `tabs get`.
4. Add compact metadata display.
5. Run automated validation.
6. Perform manual Zen smoke verification.

## Acceptance Criteria

- Basic tab search still works.
- Rich metadata appears when available.
- Missing rich fields do not crash the UI.
- Failed or unusable group metadata falls back to basic tabs.
- Existing tab actions keep working.
- No CLI/add-on/native/browser permission changes are required unless documented as a blocker.
- Raycast tests cover rich payload parsing and missing-field behavior.
- `cd raycast && npm run lint` passes.
- `cd raycast && npm run build` passes.

## Decisions

- Use `mozeidon tabs get --with-groups` when available.
- If `--with-groups` fails or returns a shape without group metadata, fall back to plain `mozeidon tabs get`.
- Do not require `--with-windows` in this spec because it is not documented in the current CLI reference.
- Use `tab.windowId` when present. Richer window metadata belongs in a future spec if needed.
- Missing rich metadata is not a setup error and must degrade to the current working tab search UI.
- Use accessories sparingly. The default row should remain title plus URL/domain.
- Treat `lastAccessed` as optional; ignore it when missing, invalid, or zero-like.
