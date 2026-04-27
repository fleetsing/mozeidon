# Spec 002: Raycast Profile Support

## Summary

Allow the Raycast extension to pass an optional Mozeidon profile ID or alias to every Mozeidon CLI command. When no profile is configured, the extension must preserve the current default CLI profile behavior.

## Status

- Implemented

## Milestone

M1: Raycast Hardening

## Problem

Mozeidon supports a global `--profile-id` flag, but the Raycast extension needs a clear, tested contract for using it. Zen users may have multiple browser profiles or multiple Mozeidon registrations, and the extension should let them target the intended Zen profile without changing behavior for users who rely on Mozeidon's default profile selection.

## Goals

- Add an optional Raycast preference for a Mozeidon profile ID or alias.
- Pass `--profile-id <value>` to every Mozeidon CLI command when the preference is configured.
- Preserve current behavior when the preference is empty or whitespace-only.
- Make profile argument construction testable.
- Document the preference and expected fallback behavior.

## Non-Goals

- No Mozeidon CLI changes.
- No browser add-on changes.
- No native app changes.
- No browser permission changes.
- No new Raycast commands.
- No profile discovery UI.
- No validation that the configured profile exists before command execution.

## Scope

Raycast extension only.

Likely files:

- `raycast/package.json`
- `raycast/README.md`
- `raycast/src/constants.ts`
- Raycast Mozeidon CLI wrapper/client files
- Raycast tests for argument construction

Out of scope:

- `cli/`
- `firefox-addon/`
- `chrome-addon/`
- native messenger

## User Workflow

1. User opens Raycast extension settings.
2. User optionally enters a Mozeidon profile ID or alias, for example `Zen`.
3. Raycast commands continue to look and behave the same.
4. If the preference is set, all Mozeidon CLI calls target that profile.
5. If the preference is empty, Raycast lets Mozeidon choose the default profile as it does today.

## Proposed Design

Add an optional Raycast preference:

```json
{
  "name": "profileId",
  "type": "textfield",
  "required": false,
  "title": "Mozeidon Profile ID or Alias",
  "description": "Optional Mozeidon profile id or alias to use for Zen Browser commands.",
  "placeholder": "e.g. Zen"
}
```

Read and trim the preference in the Raycast layer. Treat `undefined`, empty string, and whitespace-only values as not configured.

Centralize profile insertion in the Mozeidon CLI wrapper so individual actions do not manually add `--profile-id`.

Expected argument behavior:

```ts
buildMozeidonArgs(["tabs", "get"], { profileId: undefined })
// ["tabs", "get"]

buildMozeidonArgs(["tabs", "get"], { profileId: "" })
// ["tabs", "get"]

buildMozeidonArgs(["tabs", "get"], { profileId: "Zen" })
// ["--profile-id", "Zen", "tabs", "get"]

buildMozeidonArgs(["bookmarks", "-c", "1000"], { profileId: "Zen Personal" })
// ["--profile-id", "Zen Personal", "bookmarks", "-c", "1000"]
```

Every current Mozeidon invocation must route through the shared wrapper or an equivalent central helper:

- `tabs get`
- `tabs get --closed`
- `bookmarks -c 1000`
- `tabs switch <windowId>:<tabId>`
- `tabs close <windowId>:<tabId>`
- `tabs new`
- `tabs new -- <url-or-search-url>`

## API Or Contract

Profile insertion is a Raycast wrapper concern. The Mozeidon CLI command contract remains unchanged.

When configured:

```text
mozeidon --profile-id <profile> <command> <args...>
```

When not configured:

```text
mozeidon <command> <args...>
```

The profile value must be passed as a separate child-process argument. It must not be interpolated into a shell string.

## Security And Permissions

### User-Derived Inputs

The profile preference is user-provided input. It must be passed as its own argument array element.

### Command Execution

Mozeidon commands must continue to use argument arrays. This spec must not reintroduce shell-string command construction for Mozeidon calls.

### Browser Permissions

No browser permission changes.

### Storage

The profile value is stored only through Raycast's normal extension preference mechanism.

### Network Behavior

No new network behavior.

## Alternatives Considered

### Rely On Mozeidon's Default Profile Only

Rejected because multiple active profiles can make the default ambiguous, especially for Zen-focused workflows.

### Add Profile Discovery UI Now

Deferred. A text preference is enough for M1 hardening and avoids expanding the Raycast UI surface.

### Validate Profile Before Every Command

Deferred. It would add extra CLI calls and could slow common workflows. Missing or invalid profiles should surface through the existing command error path.

## Test Plan

### Unit Tests

Add or keep tests for:

- no profile option returns original command args;
- empty profile returns original command args;
- whitespace-only profile returns original command args;
- configured profile prepends `["--profile-id", profile]`;
- profile aliases containing spaces are passed as one argument;
- representative commands include profile correctly:
  - opened tabs;
  - recently closed tabs;
  - bookmarks streaming;
  - switch tab;
  - close tab;
  - new tab with empty query;
  - new tab with URL;
  - new tab with search query.

Prefer tests that inspect the child-process mock call arguments rather than invoking a real Mozeidon binary.

### Validation Commands

- `cd raycast && npm test` if a test script exists.
- `cd raycast && npm run lint`
- `cd raycast && npm run build`

## Manual Verification

Use a local Zen Browser setup with Mozeidon CLI, native app, and add-on installed.

1. Leave the profile preference empty.
2. Confirm opened tabs load using the default Mozeidon profile behavior.
3. Confirm recently closed tabs load.
4. Confirm bookmarks load.
5. Confirm switch tab works.
6. Confirm close tab works.
7. Confirm new empty tab works.
8. Confirm new tab with URL works.
9. Confirm new tab with search query works.
10. Set the profile preference to a known Zen profile ID or alias.
11. Repeat opened tabs, bookmarks, switch tab, and new tab checks.
12. Set the profile preference to an invalid value and confirm the extension surfaces an error rather than silently using another profile.

## Rollout Plan

1. Add preference and wrapper support in one Raycast-only change.
2. Keep the preference optional and unset by default.
3. Verify empty preference preserves existing behavior.
4. Document the preference in Raycast docs.

## Acceptance Criteria

- Existing command behavior is unchanged when the profile preference is empty.
- With the profile preference set, every Mozeidon CLI command includes `--profile-id <profile>` before the command.
- Profile values are passed as argument array elements, not shell-interpolated.
- Raycast docs mention the optional profile preference and default fallback behavior.
- Unit tests cover profile insertion and fallback behavior.
- `cd raycast && npm run lint` passes.
- `cd raycast && npm run build` passes.

## Open Questions

- Should a later spec add profile discovery using `mozeidon profiles get`?
- Should invalid profile errors receive a dedicated Raycast error view?
