# Raycast UX Principles

The Raycast extension should feel fast, predictable, and native to Raycast. Avoid turning it into a bulky browser management dashboard unless a workflow needs that surface.

## Core UX Goals

- Fast access to current Zen context.
- Clear actions for open tabs, recently closed tabs, bookmarks, and future context formats.
- Minimal configuration, with explicit profile targeting when multiple browsers are active.
- Safe defaults for destructive actions.
- Useful errors when Zen, Mozeidon CLI, the add-on, or the native app is missing.

## Command Shape

Prefer small focused commands over one overloaded command when workflows differ.

Candidate command categories:

- Browse tabs.
- Copy current tab context.
- Search history.
- Manage tab groups.
- Configure Zen profile.

The existing `Mozeidon` command can remain the main browser list. Zen Context commands can be added only when a spec defines the workflow.

## Context Formatting

Common output formats:

- URL.
- Title.
- Title and URL.
- Markdown link.
- Prompt block.
- JSON context object.

Formatting should be deterministic and testable. Do not rely on hidden Raycast placeholder behavior.

## Confirmation Behavior

Require confirmation for destructive actions. Labels should be explicit:

- "Close Tab"
- "Delete Bookmark"
- "Delete History Item"
- "Clear Local Memory"

Avoid hiding destructive actions as default actions.

## Error Behavior

Errors should tell the user what failed and what to check:

- CLI path invalid.
- Zen is not running.
- Mozeidon add-on is not active.
- Native app is not reachable.
- No Zen profile matched the configured profile ID or alias.
- CLI output could not be parsed.

Prefer actionable error messages over generic failures.

## Performance

- Avoid unnecessary repeated CLI calls.
- Use streaming only when it improves perceived responsiveness, as with bookmarks.
- Do not run concurrent Mozeidon commands unless the implementation proves the stack handles it.
- Cache short-lived UI state only when stale data cannot cause surprising actions.

## Accessibility And Polish

- Use Raycast-native components and actions.
- Keep action names short and direct.
- Use subtitles for domain, profile, group, or window context.
- Avoid decorative UI that slows scanning.
