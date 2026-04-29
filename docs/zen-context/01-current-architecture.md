# Current Architecture

Mozeidon is a browser add-on, native app, CLI, and optional desktop UI architecture. This fork keeps that shape and focuses on the Raycast extension as the first Zen-specific integration layer.

## Components

### Raycast Extension

Location: `raycast/`

The Raycast extension is a local UI and AI tool surface over Mozeidon CLI commands. It currently:

- lists open tabs with `mozeidon tabs get`;
- lists recently closed tabs with `mozeidon tabs get --closed`;
- streams bookmarks with `mozeidon bookmarks -c 1000`;
- searches and opens history;
- switches to a tab with `mozeidon tabs switch <windowId>:<tabId>`;
- closes an open tab with `mozeidon tabs close <windowId>:<tabId>`;
- opens a URL or search query with `mozeidon tabs new`;
- copies active page Markdown with source attribution;
- summarizes the active page with Raycast AI;
- asks Raycast AI a page-grounded question;
- smart-summarizes Zen selection, Raycast selected text, or active page content;
- exposes `@zen` Raycast AI Extension tools for context, selection/page fallback, tab listing/search, tab content, and non-destructive URL open/focus;
- activates Zen Browser with AppleScript bundle ID `app.zen-browser.zen`;
- opens Zen with the user-configured browser command, defaulting to `open -b app.zen-browser.zen`.

Mozeidon CLI calls from the Raycast extension are centralized through argument-array helpers around `execFile` or `spawn`.

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
- `mozeidon context active --format markdown`
- `mozeidon context selection`
- `mozeidon context metadata`
- `mozeidon context links`
- `mozeidon bookmarks`
- `mozeidon history`
- `mozeidon windows get`

The `--with-windows` tab flag exists in code and returns window focus metadata. Keep docs in sync with this behavior.

### Firefox-Family Add-On

Location: `firefox-addon/`

Zen uses the Firefox-family add-on. The add-on receives commands from the native app and uses WebExtension APIs for tabs, sessions, bookmarks, history, tab groups, windows, and storage.

The add-on is the right layer only when data cannot be derived from existing CLI output. Current Zen Context page extraction uses the Firefox-family add-on for selected text, page DOM metadata, readable page content, and links.

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
7. Raycast renders lists, runs a local command action, or returns structured tool output to Raycast AI.

## Current Gaps

- Raycast still does not expose every Mozeidon browser action, such as pin/unpin, move, duplicate, group mutation, or bookmark write flows.
- MCP is intentionally not implemented yet.
- Site adapters and local browsing memory are intentionally not implemented yet.
- Context extraction on normal web pages depends on the documented Firefox/Zen `<all_urls>` host-permission exception.
