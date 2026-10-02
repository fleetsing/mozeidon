# Roadmap

This roadmap is directional. Each milestone should get a focused spec before implementation starts.

## Milestone 0: Documentation Foundation

Status: implemented and maintained.

Purpose: make future agent sessions productive.

Deliverables:

- Project brief.
- Architecture map.
- Goals and non-goals.
- Test strategy.
- Security and permissions guidance.
- UX principles.
- Context API sketch.
- Spec and milestone templates.

## Milestone 1: Raycast Hardening

Status: implemented.

Purpose: make the current Raycast extension safer and more predictable for Zen.

Candidate work:

- Centralize Mozeidon command execution.
- Replace shell-string `execSync` calls with argument-array `execFile`/`spawn` helpers.
- Add explicit Zen profile preference using CLI `--profile-id`.
- Improve error states for missing CLI, missing profile, and inactive add-on.
- Keep all existing behavior compatible.

Validation:

- Raycast lint/build.
- Manual Zen smoke test for open tabs, closed tabs, bookmarks, switch, close, and new tab.

## Milestone 2: Zen Context V1

Status: implemented for CLI context extraction and Raycast command consumers.

Purpose: expose current active Zen tab context from the Raycast layer.

Candidate work:

- Use `mozeidon tabs get --with-windows`.
- Identify the last-focused window and its active tab.
- Return a stable context object.
- Add Raycast commands/actions for copying context formats.
- Support URL, title, domain, Markdown link, prompt block, and JSON formats.

Validation:

- Unit tests around context derivation with sample CLI JSON.
- Manual smoke test across one window, multiple windows, and multiple profiles.

## Milestone 3: Raycast Feature Expansion Over Existing CLI

Status: implemented and manually verified, with one known deferred issue.

Purpose: expose useful Mozeidon features without changing CLI/add-on.

Candidate work:

- History search/list. Implemented and verified; pagination bug found and fixed (Spec 016).
- Tab group list and group metadata display. Implemented and verified.
- Duplicate tab. Implemented and verified.
- Pin/unpin tab. Implemented and verified.
- Move tab. Move to End works; Move to Start is a known, deferred bug (see Spec 004's progress log) — not fixed, deprioritized by the user.
- Bookmark create/update/delete where UX is clear. Implemented and verified; a dropdown-state bug found and fixed (Spec 016).

Validation:

- Confirmation gates for destructive actions: verified.
- Manual workflows in Zen: verified 2026-09-13 (specs 003–006, 016).

## Milestone 4: AI Extension Tools For `@zen`

Status: implemented for the first read-only/non-destructive tool set.

Purpose: make Zen context available to AI extension workflows.

Candidate work:

- Read-only context tools first.
- Tool outputs use the stable context API.
- Use the implemented context API for page content and selected text.

Validation:

- Contract tests for tool responses.
- Local-only behavior verification.

## Milestone 5: Optional MCP Wrapper

Status: read-only pass implemented and manually verified (Spec 020, `mcp-server/`).

Purpose: expose stable Zen context to MCP clients after the context API settles.

Candidate work:

- Thin wrapper over context API. Implemented as a new standalone `mcp-server/` package (`zen-mcp-server`), duplicating the portable core logic from `raycast/src/` rather than sharing it via a workspace (accepted tradeoff, see Spec 020).
- Read-only tools first. Implemented: `zen_get_active_context`, `zen_get_selection_or_page`, `zen_list_tabs`, `zen_search_tabs`, `zen_get_tab_content`.
- Mutating tools require explicit confirmation semantics. Not started — `zen_open_or_focus_url` is deliberately not exposed yet; needs its own spec once there's a concrete need and a designed MCP confirmation mechanism.

Validation:

- MCP schema checks: covered by unit tests plus live verification of the actual stdio protocol (`initialize`/`tools/list`/`tools/call`) against a real Zen session, including a strict-schema rejection of an unrecognized input field.
- Contract fixtures.

## Milestone 6: Site Adapters And Local Browsing Memory

Status: not started.

Purpose: add richer, site-aware context and optional local recall.

Candidate work:

- Adapter registry.
- Site-specific metadata extraction.
- Optional local memory index.
- User-visible storage and deletion controls.

Validation:

- Permission review per adapter.
- Privacy review.
- Tests with saved fixtures.
