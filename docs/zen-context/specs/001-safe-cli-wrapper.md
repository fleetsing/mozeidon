# Spec 001: Safe Raycast Mozeidon CLI Wrapper

## Summary

Create a small typed Mozeidon CLI wrapper for the Raycast extension that invokes the CLI with argument arrays, centralizes JSON parsing, wires optional profile-id support, and exposes predictable errors. This preserves current user-visible behavior while making future Raycast actions safer and easier to test.

## Status

- Implemented

## Milestone

M1: Raycast Hardening

## Problem

The current Raycast extension calls the Mozeidon CLI from multiple functions using shell-string command construction. Some calls include user-derived values, such as new-tab URL/search input, and future Zen Context workflows will include page-derived values such as URLs, titles, selections, and metadata.

Shell-string construction makes command behavior harder to audit and test, and it creates avoidable injection risk if future code interpolates user or page content into commands. The extension also has no central place for profile handling, JSON parsing, streaming output, or Mozeidon-specific error mapping.

## Goals

- Preserve current user-visible Raycast behavior.
- Invoke Mozeidon with `execFile`/`spawn`-style argument arrays.
- Prepare for future actions that pass user-derived and page-derived values safely.
- Make command construction unit-testable without invoking a real Mozeidon binary.
- Centralize JSON parsing and expose clear parse/command errors.
- Add optional `--profile-id` plumbing from Raycast preferences while preserving current default behavior when no profile is configured.
- Keep Zen app activation behavior unchanged.

## Non-Goals

- No Mozeidon CLI changes.
- No browser add-on changes.
- No native app changes.
- No browser permission changes.
- No new Raycast commands.
- No behavior changes to tab listing, recently closed tabs, bookmarks, switching tabs, closing tabs, or opening new tabs.
- No required Zen profile preference in this spec.
- No broad test framework overhaul unless a small package script/testing setup change is needed for focused unit tests.

## Scope

Primary scope is `raycast/src`.

Allowed supporting changes:

- `raycast/package.json` only if a small test script or test dev dependency setup is needed.
- Raycast documentation only if preferences or visible behavior change.

Out of scope:

- `cli/`
- `firefox-addon/`
- `chrome-addon/`
- native messenger behavior

## Current Behavior To Preserve

Existing Raycast functions must continue to support:

- `fetchOpenTabs`: returns opened tabs from `mozeidon tabs get`.
- `fetchRecentlyClosedTabs`: returns closed tabs from `mozeidon tabs get --closed`.
- `getBookmarksChunks`: streams bookmarks from `mozeidon bookmarks -c 1000`.
- `switchTab`: switches with `mozeidon tabs switch <windowId>:<tabId>` and activates Zen.
- `closeTab`: closes with `mozeidon tabs close <windowId>:<tabId>`.
- `openNewTab`: opens an empty tab, a URL, or a search-engine URL, then activates Zen.
- Zen activation through AppleScript and the configured browser open behavior remains unchanged.

## Proposed Design

Add a Raycast-side CLI wrapper module, for example:

```text
raycast/src/mozeidonClient.ts
```

or:

```text
raycast/src/lib/mozeidon.ts
```

The wrapper should provide a small API around command execution:

```ts
type MozeidonRunOptions = {
  profileId?: string;
  stdin?: string;
};

type MozeidonJsonOptions = MozeidonRunOptions & {
  fallback?: string;
};

function buildMozeidonArgs(args: string[], options?: MozeidonRunOptions): string[];
function runMozeidon(args: string[], options?: MozeidonRunOptions): Buffer | string;
function runMozeidonJson<T>(args: string[], options?: MozeidonJsonOptions): T;
function spawnMozeidon(args: string[], options?: MozeidonRunOptions): ChildProcessWithoutNullStreams;
```

Exact names can change during implementation, but the implementation must keep these responsibilities separated:

- Build the final argument array.
- Execute non-streaming commands.
- Execute streaming commands.
- Parse JSON output.
- Map low-level failures into Raycast-consumable errors.

### Argument Construction

The wrapper must insert profile arguments only when a non-empty profile id or alias is configured:

```text
mozeidon --profile-id <profile> tabs get
```

When no profile is configured, the wrapper must preserve the current default CLI behavior:

```text
mozeidon tabs get
```

Profile id values must be passed as their own argument array element. They must not be interpolated into shell strings.

### Command Execution

Use `execFile` or an equivalent child-process API for non-streaming commands.

Use `spawn` with argument arrays for streaming commands such as bookmarks.

Do not use `shell: true` for Mozeidon commands in this wrapper.

### JSON Parsing

Add a helper for parsing command output:

```ts
function parseMozeidonJson<T>(output: string | Buffer, context: string): T;
```

The helper should:

- handle empty output according to the caller-provided fallback, where current behavior already uses a fallback;
- include command context in parse errors;
- avoid leaking excessive raw browser data in user-facing errors;
- preserve enough error information for tests and debugging.

### Error Handling

Introduce typed or classified errors for at least:

- CLI execution failure.
- CLI not found or not executable.
- JSON parse failure.
- Empty or malformed expected payload.

This spec does not require a full user-facing error redesign. Existing generic error UI may remain, but lower-level errors should be structured so a later spec can map them to better Raycast messages.

### Preferences

Add optional profile-id support plumbing. The preference name should be stable and explicit, for example:

```json
{
  "name": "profileId",
  "type": "textfield",
  "required": false,
  "title": "Mozeidon Profile ID or Alias",
  "description": "Optional Mozeidon profile id or alias to use for Zen Browser commands."
}
```

If this preference is empty or omitted, command behavior must remain unchanged.

If adding the preference changes visible setup docs or metadata, update the relevant Raycast docs. This spec does not require users to configure a profile.

## API Or Contract

### Wrapper Contract

The implementation should expose a small typed API that makes these command shapes testable:

```ts
buildMozeidonArgs(["tabs", "get"], {})
// ["tabs", "get"]

buildMozeidonArgs(["tabs", "get"], { profileId: "Zen" })
// ["--profile-id", "Zen", "tabs", "get"]

buildMozeidonArgs(["tabs", "new", "--", "https://example.com"], { profileId: "Zen" })
// ["--profile-id", "Zen", "tabs", "new", "--", "https://example.com"]
```

### Existing Function Conversion

Convert these functions to call the wrapper:

- `fetchOpenTabs`
- `fetchRecentlyClosedTabs`
- `getBookmarksChunks`
- `switchTab`
- `closeTab`
- `openNewTab`

Expected command arguments:

```text
fetchOpenTabs
tabs get

fetchRecentlyClosedTabs
tabs get --closed

getBookmarksChunks
bookmarks -c 1000

switchTab
tabs switch <windowId>:<tabId>

closeTab
tabs close <windowId>:<tabId>

openNewTab, empty query
tabs new

openNewTab, URL
tabs new -- <normalized-url>

openNewTab, search query
tabs new -- <search-engine-url-with-encoded-query>
```

The `--` separator for `tabs new` is required when passing a URL or search URL.

### Compatibility

This spec must not change CLI JSON shapes or Raycast data models except where strictly necessary to route through typed helpers.

## Security And Permissions

### User-Derived Inputs

User search text, URLs, profile ids, and configured CLI paths are sensitive command inputs. They must be passed as child-process arguments, not interpolated into shell strings.

### Page-Derived Inputs

This spec does not add page-derived inputs, but the wrapper is intended to support future page-derived values safely.

### Command Execution

Mozeidon commands must use argument arrays. The wrapper must not use `shell: true` for Mozeidon CLI calls.

The configured Mozeidon binary path remains a Raycast preference. This spec does not validate or restrict the path beyond surfacing execution errors cleanly.

### Browser Permissions

No browser permission changes.

### Destructive Actions

`closeTab` remains a destructive action, but confirmation behavior is not changed in this spec. A separate M1 spec should address destructive confirmation.

### Storage

No new storage.

### Network Behavior

No new network behavior. Search-engine URL construction preserves existing behavior.

## Alternatives Considered

### Keep Shell Strings

Rejected because shell-string command construction is harder to test and unsafe for future user/page-derived values.

### Add A New CLI Command First

Rejected because current behavior can be preserved by wrapping existing CLI commands. CLI changes are not needed for M1 hardening.

### Use A General Shell Escaping Library

Rejected for now because argument-array execution avoids the shell and keeps the implementation smaller.

### Implement Full Error UI Now

Deferred. The wrapper should classify errors now, but a later spec can redesign Raycast user-facing error states.

## Proposed Tests

Prefer tests that mock `child_process` rather than invoking a real `mozeidon` binary.

### Command Construction

- `buildMozeidonArgs(["tabs", "get"])` returns `["tabs", "get"]`.
- `buildMozeidonArgs(["tabs", "get"], { profileId: "Zen" })` returns `["--profile-id", "Zen", "tabs", "get"]`.
- Empty, whitespace-only, or undefined profile id does not insert `--profile-id`.
- Profile aliases containing spaces are passed as one argument element.

### New Tab Argument Handling

- Empty query produces `["tabs", "new"]`.
- Valid URL query produces `["tabs", "new", "--", "<normalized-url>"]`.
- Search query produces `["tabs", "new", "--", "<engine-url><encoded-query>"]`.
- Queries containing quotes, semicolons, shell operators, or `$()` are passed as data inside one argument, never interpolated into a command string.

### JSON Parsing

- Open tabs JSON parses into current `TabState` behavior.
- Recently closed tabs JSON parses into current `TabState` behavior.
- Bookmark JSON lines parse into bookmark chunks.
- Empty output uses the same fallback behavior where current code already uses `TABS_FALLBACK`.
- Malformed JSON throws a classified parse error with command context.

### Child Process Invocation

- Non-streaming commands call `execFile` or equivalent with binary path and argument array.
- Streaming bookmark command calls `spawn` with binary path and argument array.
- `shell: true` is not used for Mozeidon commands.
- User input appears only in the args array passed to the child-process mock.

### Validation Commands

- `cd raycast && npm run lint`
- `cd raycast && npm run build`

If a test script is added:

- `cd raycast && npm test`

## Implementation Steps

Do not implement until this spec is explicitly approved.

Recommended sequence after approval:

1. Add or confirm a minimal Raycast unit test setup if one does not exist.
2. Add the wrapper module with argument building, non-streaming execution, streaming execution, JSON parsing, and classified errors.
3. Add optional `profileId` preference typing and read it from Raycast preferences.
4. Convert `fetchOpenTabs` to use `runMozeidonJson`.
5. Convert `fetchRecentlyClosedTabs` to use `runMozeidonJson`.
6. Convert `getBookmarksChunks` to use `spawnMozeidon`.
7. Convert `switchTab`, `closeTab`, and `openNewTab` to use argument arrays.
8. Keep Zen app activation calls unchanged.
9. Add focused unit tests for command construction, parsing, profile insertion, and user-input safety.
10. Run lint/build and any added tests.
11. Perform manual Zen/Raycast smoke verification.

## Manual Verification Steps

Use a local Zen Browser setup with the Mozeidon add-on, native app, and CLI configured.

1. Open Raycast Mozeidon command.
2. Confirm opened tabs list loads.
3. Switch to an opened tab and confirm Zen activates.
4. Close a tab and confirm it disappears from the Raycast list.
5. Load recently closed tabs.
6. Reopen a recently closed tab.
7. Load bookmarks and confirm streaming still works.
8. Open an empty new tab.
9. Enter a valid URL and confirm it opens as a URL.
10. Enter a search query and confirm it opens using the configured search engine.
11. If a profile id/alias is configured, repeat opened tabs and new tab checks with that profile.
12. Clear the profile preference and confirm default CLI profile behavior still works.

## Rollout Plan

This change can ship as an internal refactor plus optional profile plumbing:

1. Land wrapper and tests while preserving behavior.
2. Keep existing command names and UI flow unchanged.
3. Leave improved user-facing error UI and destructive confirmations to later M1 specs.
4. Use the wrapper as the required foundation for M2 current-tab context work.

## Acceptance Criteria

- A typed Raycast-side Mozeidon CLI wrapper exists.
- Existing Raycast functions listed in this spec use the wrapper.
- Mozeidon commands are invoked with argument arrays.
- No Mozeidon command uses shell-string interpolation or `shell: true`.
- Optional profile id/alias support is plumbed into command construction.
- Empty profile setting preserves current default CLI behavior.
- URL/search query handling preserves current behavior.
- JSON parsing is centralized and produces classified errors.
- Unit tests cover command construction, profile insertion, parsing, and user-input safety.
- `cd raycast && npm run lint` passes.
- `cd raycast && npm run build` passes.
- Manual Zen/Raycast verification steps pass or skipped steps are documented with reasons.

## Open Questions

- Which test runner should Raycast use for focused unit tests if none exists yet?
- Should the optional profile preference be added in this spec's implementation or introduced behind a follow-up UI/documentation spec?
- Should typed errors remain internal for now, or should the first implementation also map them to distinct Raycast error views?
