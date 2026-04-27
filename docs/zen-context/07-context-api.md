# Context API

This document sketches the stable context shape that Raycast, AI Extension tools, and a later MCP wrapper should share. It is a target contract, not a statement that every field is implemented today.

## Design Goals

- Read-only by default.
- Derived from existing Mozeidon CLI output when possible.
- Stable enough for tests, docs, and downstream tools.
- Explicit about profile, window, and source.
- Extensible without breaking existing consumers.

## Current Tab Context

Suggested JSON shape:

```json
{
  "kind": "zen.currentTab",
  "version": 1,
  "source": {
    "app": "raycast",
    "provider": "mozeidon-cli",
    "profileId": "Zen"
  },
  "tab": {
    "id": 123,
    "windowId": 456,
    "url": "https://example.com/page",
    "title": "Example Page",
    "domain": "example.com",
    "active": true,
    "pinned": false,
    "groupId": -1,
    "index": 3,
    "lastAccessed": 1710000000000
  },
  "window": {
    "id": 456,
    "isLastFocused": true
  },
  "group": null,
  "capturedAt": "2026-04-27T00:00:00.000Z"
}
```

## Minimum Fields For V1

Required:

- `kind`
- `version`
- `source.provider`
- `tab.id`
- `tab.windowId`
- `tab.url`
- `tab.title`
- `tab.domain`
- `tab.active`
- `window.id`
- `window.isLastFocused`
- `capturedAt`

Optional:

- `source.profileId`
- `source.profileAlias`
- `tab.groupId`
- `tab.index`
- `tab.lastAccessed`
- `group`

## Current Derivation Strategy

Preferred V1 derivation:

1. Run `mozeidon --profile-id <profile> tabs get --with-windows`.
2. Find the window where `isLastFocused` is true.
3. Find the tab in that window where `active` is true.
4. Return a context object.

Fallbacks should be explicit in specs. For example, if no last-focused window is returned, a spec may choose the first active tab, but the UI should not pretend the result is precise.

## Formatting Functions

Suggested pure formatting functions:

- `formatUrl(context)`
- `formatTitle(context)`
- `formatTitleAndUrl(context)`
- `formatMarkdownLink(context)`
- `formatPromptBlock(context)`
- `formatJson(context)`

These should be unit tested with fixtures.

## Compatibility Rules

- Increment `version` for breaking context contract changes.
- Add optional fields instead of changing existing fields.
- Do not reuse a field for different semantics.
- Keep raw CLI output parsing separate from context object creation.

## Future Extensions

Possible later fields:

- selected text;
- canonical URL;
- page description;
- Open Graph metadata;
- reader-mode text;
- site adapter output;
- local memory references.

Each future extension needs a spec and permission review.
