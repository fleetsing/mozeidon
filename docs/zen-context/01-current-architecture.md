# Current Architecture

Mozeidon is a browser add-on, native app, CLI, and optional desktop UI architecture. This fork keeps that shape and focuses on the Raycast extension as the first Zen-specific integration layer.

## Components

### Raycast Extension

Location: `raycast/`

The Raycast extension is a local UI over Mozeidon CLI commands. It currently:

- lists open tabs with `mozeidon tabs get`;
- lists recently closed tabs with `mozeidon tabs get --closed`;
- streams bookmarks with `mozeidon bookmarks -c 1000`;
- switches to a tab with `mozeidon tabs switch <windowId>:<tabId>`;
- closes an open tab with `mozeidon tabs close <windowId>:<tabId>`;
- opens a URL or search query with `mozeidon tabs new`;
- activates Zen Browser with AppleScript bundle ID `app.zen-browser.zen`;
- opens Zen with the user-configured browser command, defaulting to `open -b app.zen-browser.zen`.

The current extension uses shell-string command execution in several places. Future work should replace that pattern with argument-array helpers around `execFile` or `spawn`.

### Mozeidon CLI

Location: `cli/`

The CLI is a Go Cobra application. It talks to the native app over IPC and exposes browser operations for:

- tabs;
- recently closed tabs;
- bookmarks;
- history;
- tab groups;
- active browser profiles.

Every command can use the global `--profile-id` flag. The value can be a profile ID or profile alias. If omitted, the CLI chooses the preferred profile by rank and registration time.

Important existing commands for Zen Context:

- `mozeidon profiles get`
- `mozeidon tabs get`
- `mozeidon tabs get --with-windows`
- `mozeidon tabs get --with-groups`
- `mozeidon tabs switch <windowId>:<tabId>`
- `mozeidon bookmarks`
- `mozeidon history`

The `--with-windows` tab flag exists in code and returns window focus metadata. Keep docs in sync with this behavior.

### Firefox-Family Add-On

Location: `firefox-addon/`

Zen uses the Firefox-family add-on. The add-on receives commands from the native app and uses WebExtension APIs for tabs, sessions, bookmarks, history, tab groups, windows, and storage.

The add-on is the right layer only when data cannot be derived from existing CLI output. Examples that may require add-on work later include selected text, page DOM metadata, or readable page content.

### Chrome Add-On

Location: `chrome-addon/`

The Chromium add-on mirrors Firefox-family behavior where possible. It is useful for cross-browser context but is not the first target for Zen Context.

### Native App

Repository: upstream `mozeidon-native-app`

The native app is a message broker between browser add-on and CLI. Treat it as infrastructure. Do not change it unless a spec proves that the current transport or protocol blocks required behavior.

## Data Flow

Current Raycast flow:

1. Raycast command starts.
2. Raycast checks whether Zen is running and activates Zen if needed.
3. Raycast invokes Mozeidon CLI commands.
4. CLI finds the target profile, then sends IPC commands to the native app.
5. Native app relays to the browser add-on.
6. Add-on queries browser APIs and returns JSON data.
7. Raycast renders lists or performs an action.

## Current Gaps

- Raycast does not expose profile selection even though the CLI supports it.
- Raycast does not expose current active tab as a first-class context object.
- Raycast does not consume `--with-windows` or `--with-groups`.
- Raycast does not expose history, tab groups, pin/move/duplicate, or bookmark write operations.
- Current command execution is shell-string based.
- There are no automated tests in the repo.
