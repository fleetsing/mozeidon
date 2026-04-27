# Roadmap

This roadmap is directional. Each milestone should get a focused spec before implementation starts.

## Milestone 0: Documentation Foundation

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

Purpose: expose useful Mozeidon features without changing CLI/add-on.

Candidate work:

- History search/list.
- Tab group list and group metadata display.
- Duplicate tab.
- Pin/unpin tab.
- Move tab.
- Bookmark create/update/delete where UX is clear.

Validation:

- Confirmation gates for destructive actions.
- Manual workflows in Zen.

## Milestone 4: AI Extension Tools For `@zen`

Purpose: make Zen context available to AI extension workflows.

Candidate work:

- Read-only context tools first.
- Tool outputs use the stable context API.
- No page content extraction unless explicitly enabled by a later spec.

Validation:

- Contract tests for tool responses.
- Local-only behavior verification.

## Milestone 5: Optional MCP Wrapper

Purpose: expose stable Zen context to MCP clients after the context API settles.

Candidate work:

- Thin wrapper over context API.
- Read-only tools first.
- Mutating tools require explicit confirmation semantics.

Validation:

- MCP schema checks.
- Contract fixtures.

## Milestone 6: Site Adapters And Local Browsing Memory

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
