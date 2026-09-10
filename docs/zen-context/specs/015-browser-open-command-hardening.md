# Spec 015: Browser-Open Command Hardening

## Summary

Replace the last shell-string `execSync` calls in the Raycast extension with argument-array `execFileSync` execution. The browser-open preference (`FIREFOX_OPEN_COMMAND`) is currently executed as an interpolated shell string; this spec tokens it into an argv array so no user-controlled preference value is ever interpreted by a shell.

## Status

- Proposed
- 2026-09-09: Implementation included in this change set for review together with the spec.

## Problem

Spec 001 and Milestone 1 replaced Mozeidon command execution with argument-array helpers (`runMozeidon`, `spawnMozeidon`), but `raycast/src/actions/index.ts` still executes the browser-open preference through `execSync`:

- `openFirefox()` runs `execSync(FIREFOX_OPEN_COMMAND)`.
- `openFirefoxAtMozeidonPage()` runs `` execSync(`${FIREFOX_OPEN_COMMAND} ${MOZEIDON_DOCUMENTATION_URL}`) ``.

The interpolated URL is a repo constant, so this is not an injection path today. The remaining risk is structural: the preference value is documented as a shell command, and any future call site that interpolates user-derived data into it would silently reintroduce a shell-interpolation sink. A tokenized argv execution removes the shell from the path entirely.

## Goals

- Execute `FIREFOX_OPEN_COMMAND` through argument-array `execFileSync`.
- Support appending extra arguments (for example, a documentation URL) as argv entries, never as interpolated strings.
- Preserve the existing default behavior: `open -b app.zen-browser.zen` opens Zen; `open -b app.zen-browser.zen <url>` opens the URL in Zen.
- Preserve single-quote and double-quote handling for preference values so quoted arguments survive tokenization.
- Fail with a clear error when the preference is empty or whitespace-only.
- Add unit tests for tokenization and argv assembly.

## Non-Goals

- No changes to Mozeidon command execution in `mozeidonClient.ts` (already argument-array based).
- No changes to the AppleScript-based `startFirefox`/`isFirefoxRunning` helpers, which do not interpolate user data.
- No changes to the preference name, default value, or its "shell command" description semantics beyond tokenization.
- No new browser permissions and no add-on or CLI changes.

## Proposed Design

Add a small pure helper module `raycast/src/browserOpenCommand.ts`:

- `tokenizeCommand(command: string): string[]` — splits a shell-like command string into argv tokens, honoring single quotes, double quotes, and backslash escapes outside quotes.
- `buildBrowserOpenArgs(command: string, extraArgs: string[] = []): string[]` — returns the tokenized command with extra arguments appended; throws an `Error` with a user-facing message when the command tokenizes to nothing.

`raycast/src/actions/index.ts` then executes the result with `execFileSync(tokens[0], tokens.slice(1).concat(extraArgs))` — no shell is spawned, and no value is interpolated into a command string.

## Security And Permissions Review

- Removes the last `execSync` sink from the Raycast extension.
- No new permissions, entitlements, or network access.
- Preference values still choose which binary runs; that is unchanged and documented behavior.

## Test Plan

- Unit tests for `tokenizeCommand`: default command, quoted arguments, escaped characters, empty input.
- Unit tests for `buildBrowserOpenArgs`: extra argument appending and the empty-command error.
- Existing Raycast test suite continues to pass (`npm test`).

## Open Questions

- None.
