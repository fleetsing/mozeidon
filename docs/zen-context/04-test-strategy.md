# Test Strategy

The project should move toward spec-driven and test-driven changes. There are currently no automated tests in the repo, so early milestones should add focused tests where behavior is easiest to isolate.

## Test Levels

### Documentation Validation

For documentation-only changes:

- Check links and paths manually.
- Keep terminology consistent.
- Confirm docs do not promise unimplemented behavior without labeling it as planned.

### Raycast Unit Tests

Use for pure logic, especially:

- parsing CLI JSON;
- deriving current tab from tabs and windows;
- formatting context output;
- validating command arguments;
- mapping errors to user-facing states.

Prefer extracting pure helpers from UI components when adding tests.

### Raycast Build And Lint

Run before completing Raycast implementation work:

- `cd raycast && npm run lint`
- `cd raycast && npm run build`

Do not run long-lived `npm run dev` as validation unless the task explicitly needs interactive Raycast testing.

### CLI Tests

Use for Go logic that does not require a live browser:

- `cd cli && go test ./...`

Add fixtures for JSON shape compatibility when adding CLI behavior. Do not silently change existing CLI JSON output shapes.

### Add-On Tests

The add-ons currently do not have an automated test setup. If add-on behavior becomes necessary:

- isolate browser API adapters where possible;
- add fixtures around command input and output;
- prefer contract tests that prove CLI/add-on output shape.

### Manual Zen Smoke Tests

Use for end-to-end workflows that require Zen, the add-on, native app, and CLI:

- `mozeidon profiles get`
- `mozeidon --profile-id <zen-profile> tabs get`
- `mozeidon --profile-id <zen-profile> tabs get --with-windows`
- Raycast open tabs list.
- Switch tab.
- New tab from URL and search query.
- Recently closed tabs.
- Bookmarks.

## Destructive Action Testing

Destructive actions include:

- close tab;
- close multiple tabs;
- delete bookmark;
- delete history;
- move or overwrite user organization;
- clear local memory.

Tests and manual flows must confirm:

- the action is not hidden behind a default key path without clear labeling;
- confirmation is required where data may be lost;
- cancellation leaves state unchanged.

## Fixture Guidance

Keep fixture data realistic but sanitized:

- avoid real personal URLs;
- include multiple windows;
- include one active tab per window;
- include a last-focused window;
- include grouped and ungrouped tabs;
- include pinned and unpinned tabs;
- include multiple profiles when testing profile selection.

## Completion Standard

For implementation tasks, final summaries should include:

- files changed;
- tests/lint/builds run;
- manual checks performed;
- skipped validation and why;
- unresolved risks.
