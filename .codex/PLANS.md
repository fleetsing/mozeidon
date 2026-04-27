# Codex Plans

This file is for future Codex sessions that need durable planning context.

## Planning Rules

- For complex tasks, make a short plan before editing.
- For behavior changes, create or update a spec in `docs/zen-context/specs/` first.
- Keep docs and implementation in sync.
- Do not use this file as a replacement for specs or decision records.

## Project Direction

Zen Context should replicate and surpass the practical benefits of Raycast's `{browser-tab}` for Zen Browser without spoofing private Raycast internals.

Preferred order of work:

1. Raycast extension over existing Mozeidon CLI features.
2. Mozeidon CLI/add-on changes only when required.
3. AI Extension tools for `@zen` workflows.
4. Optional MCP wrapper after the context API is stable.
5. Site adapters and local browsing memory later.

Do not change the native messenger unless the current transport or protocol is proven insufficient.

## Active Plan Seeds

### Raycast Hardening

- Introduce a centralized Mozeidon command helper.
- Use `execFile`/`spawn` with argument arrays.
- Add profile targeting for Zen.
- Preserve current Raycast behavior.

### Zen Context V1

- Derive current tab from `tabs get --with-windows`.
- Define and test a stable context object.
- Add copy actions for common formats.

### Future Tooling

- Reuse the context API for AI Extension and MCP tools.
- Keep read-only tools first.
- Add mutating tools only with confirmation semantics.
