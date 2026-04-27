# Security And Permissions

Zen Context handles browser state. Treat URLs, titles, history, bookmarks, selected text, and page content as sensitive.

## Local-First Policy

- Keep data local by default.
- Do not transmit browsing data to network services from this repo.
- If another tool or AI workflow sends context elsewhere, make that user-controlled and visible.
- Store only what a spec requires.

## Command Execution Policy

Mozeidon commands should be invoked with argument arrays.

Preferred patterns:

- `execFile(mozeidonPath, ["--profile-id", profileId, "tabs", "get"])`
- `spawn(mozeidonPath, ["bookmarks", "-c", "1000"])`

Avoid shell-string command construction, especially with:

- user input;
- page titles;
- URLs;
- selected text;
- profile aliases;
- configurable binary paths.

If shell execution is unavoidable, the spec must explain why and document escaping behavior.

## Destructive Actions

Require confirmation before actions that can remove or overwrite user data:

- closing tabs;
- deleting bookmarks;
- deleting history;
- bulk updates;
- clearing future local browsing memory.

For reversible or low-risk actions, use clear labels and toasts. For irreversible actions, use Raycast confirmation alerts or equivalent explicit confirmation.

## Browser Permissions

Use least privilege.

Current Firefox-family add-on permissions include browser APIs for native messaging, tabs, sessions, bookmarks, history, tab groups, and storage. Do not expand permissions casually.

Content extraction permissions must be:

- optional;
- scoped;
- justified in a spec;
- documented in user-facing setup notes;
- validated by a privacy review.

Avoid broad host permissions unless a spec proves they are necessary.

## CLI JSON Compatibility

The CLI is an integration surface. Do not silently change existing JSON output shapes.

Allowed compatibility paths:

- add a new flag;
- add a new command;
- add optional fields only when consumers can safely ignore them;
- document versioned behavior.

Risky changes:

- renaming fields;
- changing field types;
- changing array/object roots;
- changing default command behavior used by scripts.

## Secrets And Sensitive Data

Do not commit:

- real browsing history;
- real bookmarks exports;
- profile IDs from personal machines when not needed;
- local native messaging manifests with personal paths unless they are examples;
- API keys or MCP tokens.

Use sanitized fixtures for tests and docs.
