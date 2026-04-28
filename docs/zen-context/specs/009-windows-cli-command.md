# Spec 009: Windows CLI Command

## Summary

Expose the existing Mozeidon window-listing capability as `mozeidon windows get`. The Firefox add-on already supports `get-windows`, and the Go core already has `WindowsGet()`. This spec adds the missing public CLI command so manual testing and future Zen Context work can inspect focused-window state directly.

## Status

- Implemented

## Problem

Zen Context relies on active tab and last-focused window identity. Manual testing currently references window-aware behavior, but `/tmp/mozeidon-context windows get` fails because the root CLI does not register a `windows` command. That makes it harder to verify context behavior across multiple Zen windows and creates an unnecessary gap before multi-tab or AI/MCP context work.

## Goals

- Add `mozeidon windows get`.
- Reuse the existing add-on `get-windows` command and Go `core.WindowsGet()` helper.
- Preserve the current JSON shape from the internal windows model.
- Support `--profile-id` through existing root CLI profile plumbing.
- Add focused CLI command tests.

## Non-Goals

- No add-on changes.
- No native messenger changes.
- No browser permission changes.
- No Raycast UI changes.
- No new window mutation commands.
- No changes to `tabs get --with-windows`.

## User Workflow

1. User runs `mozeidon profiles get` to identify a Zen profile if needed.
2. User runs `mozeidon --profile-id <profile> windows get`.
3. CLI prints the active browser windows and marks the last-focused window.
4. User can compare that output with `context active` or `tabs get --with-windows` during manual verification.

## Proposed Design

Add a new `cli/cmd/windows` package mirroring the existing command package layout:

- `WindowsCmd` root command with `Use: "windows"`.
- `GetWindowsCmd` subcommand with `Use: "get"`.
- Register `WindowsCmd` in `cli/cmd/root.go`.

The `get` command should:

1. load the selected profile with `core.NewAppWithProfile(flags.ProfileID)`;
2. call `app.WindowsGet()`;
3. marshal the returned `models.Windows` value;
4. print one JSON object to stdout.

## API Or Contract

Command:

```text
mozeidon windows get
mozeidon --profile-id <profile-id-or-alias> windows get
```

Output shape:

```json
{
  "data": [
    {
      "id": 123,
      "isLastFocused": true
    }
  ]
}
```

Compatibility:

- This exposes an existing model shape; it does not change existing commands.
- Consumers should treat additional future window fields as optional.

## Security And Permissions

- No user-derived page content is read.
- No page-derived input is executed.
- No shell command construction is added.
- No browser permission changes are required; the add-on already uses the existing `tabs`/window APIs.
- The command is read-only and non-destructive.
- No storage or network behavior changes.

## Alternatives Considered

- Continue using `tabs get --with-windows`: useful, but it forces tab retrieval when the verifier only needs window focus state.
- Keep `WindowsGet()` internal: this leaves a manual verification gap that has already caused confusion.

## Test Plan

Automated:

- Add Go tests that `windows` exposes a `get` subcommand.
- Run `cd cli && GOCACHE=/tmp/mozeidon-go-build go test ./...`.
- Run `cd cli && GOCACHE=/tmp/mozeidon-go-build go build ./...`.

Manual:

```text
mozeidon profiles get
mozeidon --profile-id <profile> windows get
mozeidon --profile-id <profile> tabs get --with-windows
mozeidon --profile-id <profile> context active --format text
```

Verify:

- `windows get` returns valid JSON.
- exactly one open normal browser window should normally report `isLastFocused: true`;
- context active uses the same focused window when multiple windows are open.

## Rollout Plan

Ship as a small CLI-only addition. Existing users are unaffected because no current command changes shape or behavior.

## Open Questions

- Should future specs add window type/state fields if the add-on can expose them reliably?
