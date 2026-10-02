# AI Extension And MCP

Zen Context supports initial Raycast AI workflows through `@zen` AI Extension tools, and an optional read-only MCP wrapper (`mcp-server/`, Spec 020) for MCP clients other than Raycast.

## AI Extension Direction

AI Extension tools for `@zen` workflows come before MCP and are implemented for the first local tool set.

Initial tools:

- `zen_get_active_context`
- `zen_get_selection_or_page`
- `zen_list_tabs`
- `zen_search_tabs`
- `zen_get_tab_content`
- `zen_open_or_focus_url`

The first tool set is read-only except for the non-destructive `zen_open_or_focus_url`, which opens an HTTP(S) URL or focuses an already-open matching tab. Destructive tools should come later, if at all, and require explicit confirmation semantics.

## MCP Direction

Implemented as a standalone `mcp-server/` package (`zen-mcp-server`), a thin wrapper over the same context API used by the Raycast AI Extension tools rather than a parallel contract. It duplicates the portable core logic from `raycast/src/` instead of sharing it via a workspace (accepted tradeoff; see Spec 020 for why).

Implemented MCP tools (all read-only), reusing the AI Extension tool names and contracts directly:

- `zen_get_active_context`
- `zen_get_selection_or_page`
- `zen_list_tabs`
- `zen_search_tabs`
- `zen_get_tab_content`

`zen_open_or_focus_url` (the one mutating tool in the underlying API) is deliberately not registered here. Exposing it, or any other mutating tool, requires its own spec and a designed MCP confirmation mechanism first.

## Safety Rules

- No private Raycast internals.
- No spoofing Raycast browser placeholders.
- No hidden network transmission.
- Page content extraction only through the documented context API and Firefox/Zen host-permission exception.
- No broad permissions without a spec.
- No destructive tools without confirmation semantics.

## Contract Reuse

The same context object should be usable by:

- Raycast copy actions;
- Raycast AI actions;
- AI Extension tools;
- MCP tools;
- tests and fixtures.

Keep formatting separate from retrieval so tools can choose structured JSON or user-facing text.

## Open Questions

- Should Raycast AI tools add confirmation-gated mutating actions?
- How should confirmation work across Raycast and MCP clients, once a mutating MCP tool is added?
- How should local memory be represented and cleared?
