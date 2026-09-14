# Spec 020: Read-Only MCP Server Wrapping the Zen Context API

## Summary

A new standalone package, `mcp-server/` (`zen-mcp-server`), wraps the existing Zen context API in a [Model Context Protocol](https://modelcontextprotocol.io) server, so any MCP client (Claude Code, Claude Desktop, etc.) can use it — not just Raycast's own proprietary AI Extension tool-calling. This is the roadmap's Milestone 5, first pass: read-only tools only.

## Status

- Implemented

## Problem

The `zen_*` AI tools (`zen_get_active_context`, `zen_get_selection_or_page`, `zen_list_tabs`, `zen_search_tabs`, `zen_get_tab_content`, `zen_open_or_focus_url`) only work through Raycast's own AI chat today. Nothing outside Raycast — including Claude Code itself — can reach them. The roadmap has called for an MCP wrapper since the extension was first built, deferred until "the context API settles" (Milestone 4's decision-log entry).

## Goals

- Expose the read-only subset of the Zen context API as MCP tools, usable from any MCP client.
- Reuse the existing, already-tested context/tool logic rather than reimplementing it.
- No CLI/add-on/native messenger changes — this is purely a new consumer of the already-stable `mozeidon` CLI.

## Non-Goals

- No mutating tools (`zen_open_or_focus_url` is not registered) and no confirmation-flow design work yet — deferred until this read-only pass proves out and a mutating tool is actually needed.
- No code-sharing refactor between `raycast/` and `mcp-server/` (see "Code Duplication" below) — an accepted, documented tradeoff for this first pass, not a permanent decision.
- No changes to `raycast/`.

## Proposed Design

### Package layout

```
mcp-server/
  src/
    mozeidonClient.ts    # trimmed copy of raycast/src/mozeidonClient.ts
    zenContext.ts         # copy of raycast/src/zenContext.ts
    zenContextErrors.ts   # copy of raycast/src/zenContextErrors.ts
    zenAiToolsCore.ts     # copy of raycast/src/zenAiToolsCore.ts
    interfaces.ts         # this package's own minimal MozeidonTab-only slice
    dependencies.ts       # MCP-side ZenAiToolDependencies wiring (env vars, no @raycast/api)
    schemas.ts            # Zod input schemas for the 5 registered tools
    toolResult.ts          # ZenToolResponse<T> -> MCP CallToolResult mapper
    server.ts              # registers the 5 tools on an McpServer
    index.ts               # entry point: build server, connect StdioServerTransport
  tests/                   # adapted from raycast/tests/, see below
```

### Code duplication (confirmed and accepted with the user)

`mozeidonClient.ts`, `zenContext.ts`, `zenContextErrors.ts`, and `zenAiToolsCore.ts` have zero `@raycast/api` imports in the Raycast extension — they're plain TypeScript operating on injected dependencies and Node's `child_process`. Rather than restructure the working, heavily-tested `raycast/` package into an npm workspace to share these files with a brand-new, unproven package, they're duplicated into `mcp-server/src/` with header comments marking them as copies and noting the only mechanical changes (explicit `.js` extensions on relative imports, required by this package's NodeNext ESM resolution; a local `interfaces.ts` with just the `MozeidonTab` type instead of Raycast's full, React-dependent interfaces module).

`mozeidonClient.ts`'s copy is further trimmed: `buildNewTabArgs` and its window-targeting siblings, `parseAsUrl`, and the spawn/streaming path (`spawnMozeidon`/`streamMozeidonLines`, used by Raycast's bookmarks/history commands) are all dropped, since nothing in this package's 5 tools uses them. This both shrinks what needs manual sync and reduces future drift risk, since the dropped code has no reason to ever need syncing.

**Tradeoff, accepted**: a future fix to the shared logic (e.g. a spec 017/018-style bug) needs applying in both `raycast/src/` and `mcp-server/src/` by hand, and could silently drift if one copy is updated without the other. If this package proves valuable and drift becomes a real problem, a follow-up spec should extract a shared workspace package instead.

### Tools exposed (5, all read-only)

Reused unmodified from `zenAiToolsCore.ts`: `zenGetActiveContext`, `zenGetSelectionOrPage`, `zenListTabs`, `zenSearchTabs`, `zenGetTabContent`. `zenOpenOrFocusUrl` (mutating) is simply never registered — no code change needed to exclude it.

**`zen_get_selection_or_page`'s behavior differs from Raycast's, by design.** Its `raycast-selection` fallback tier depends entirely on the injected `getRaycastSelectedText()` dependency. There is no generic "read the frontmost app's selection" capability outside Raycast, so this server's `dependencies.ts` wires that function to always resolve `undefined`. The existing, unmodified fallback logic (spec 018's ordering: zen-selection → active-page → raycast-selection) then naturally degrades to a 2-tier chain — `kind: "raycast-selection"` simply never appears in this server's output. This required no fork of `zenAiToolsCore.ts`, only a different dependency value.

**`zen_get_tab_content` still internally moves focus.** Its spec 014 focus-then-read stabilization calls `switchTab` to bring a background tab to the front, read it, then switch back (`restoreFocus`, default `true`). This is an internal implementation detail, not a lasting mutation — the tool's contract (content in, content out) stays read-only, and `switchTab` here is wired to a plain `mozeidon tabs switch <windowId>:<tabId>` call, mirroring `raycast/src/zenAiToolRuntime.ts`'s equivalent.

**`openUrl` throws instead of no-op.** `ZenAiToolDependencies` requires it structurally, but only `zenOpenOrFocusUrl` calls it, and that tool is never registered here. Wiring it to throw ("not supported by the read-only zen-mcp-server") means a future maintenance mistake that accidentally registers the excluded tool fails loudly rather than silently doing nothing.

### Configuration

Environment variables, the standard way a locally-spawned MCP server receives config from a client's server entry (see `mcp-server/README.md`):
- `MOZEIDON_CLI_PATH` (default: `mozeidon`, resolved via `PATH`)
- `MOZEIDON_PROFILE_ID` (optional)

### MCP SDK usage

Confirmed against the actually-installed `@modelcontextprotocol/sdk` (v1.30.0) type definitions directly, since web documentation for the SDK was found to be inconsistent across sources: `McpServer.registerTool(name, config, callback)` accepts a plain Zod raw shape or a full schema instance for `inputSchema`; this package uses full `z.object({...}).strict()` instances so unrecognized input fields are rejected (verified live: an extra field produces a clear `Unrecognized key` validation error, not silent ignoring). Each tool's `annotations` sets `{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }`. `StdioServerTransport` is used, the standard transport for a locally-spawned server.

## API Or Contract

New package, new tool surface for MCP clients. No changes to the CLI, add-on, native messenger, or Raycast extension. `zen_get_selection_or_page`'s `source`/`kind` contract is unchanged in shape, but `kind: "raycast-selection"` is unreachable through this server (see above) — a real, documented behavior difference from the Raycast build of the same tool.

## Security And Permissions

Read-only tools only. No new CLI/add-on/native-messenger capability or permission is introduced — this consumes only already-existing, already-permissioned CLI commands (`context active`, `context selection`, `context tab`, `tabs get --with-windows`, `tabs switch`). `tabs switch` is used only as an internal, auto-restored implementation detail of `zen_get_tab_content`, not exposed as its own callable action.

## Alternatives Considered

- **Share code via an npm workspace now.** Rejected for this first pass — see "Code duplication" above.
- **Encode `zen_open_or_focus_url` with a confirmation-required annotation instead of omitting it.** Rejected: MCP's elicitation/confirmation patterns aren't yet designed for this project, and the user confirmed read-only-only for this pass. Revisit in a follow-up spec once a real mutating-tool need arises.

## Test Plan

- `cd mcp-server && npm test` — 41 tests: adapted subsets of `raycast/tests/mozeidonClient.test.ts` (only what the trimmed `mozeidonClient.ts` still exports) and `raycast/tests/zenAiTools.test.ts` (the 5 retained tools' full existing coverage, dropping only manifest/`package.json`-specific assertions and all `zen_open_or_focus_url` tests), plus new tests for `toolResult.ts`'s response mapping.
- `cd mcp-server && npm run build`.
- Manual, live verification against a real Zen session (see below) — confirmed working end-to-end over the actual MCP stdio protocol (`initialize` → `tools/list` → `tools/call`), not just unit tests, including live tab search/list results and a strict-schema rejection of an unrecognized field.

## Manual Verification With Zen

1. `cd mcp-server && npm run build`.
2. Add it to an MCP client's config (see `mcp-server/README.md`) with `MOZEIDON_CLI_PATH`/`MOZEIDON_PROFILE_ID` matching the real setup.
3. Confirm exactly 5 `zen_*` tools appear — `zen_open_or_focus_url` must be absent.
4. With Zen running, exercise each tool; confirm `zen_get_selection_or_page` never reports `kind: "raycast-selection"`.
5. Confirm a deliberately bad `MOZEIDON_CLI_PATH` produces a clear tool-level error, not a crash.

## Open Questions

- Should a mutating-tools pass (with MCP confirmation semantics) follow once there's a concrete use case for it? Not decided; out of scope here.
