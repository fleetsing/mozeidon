# AI Extension And MCP

Zen Context supports initial Raycast AI workflows through `@zen` AI Extension tools. MCP remains a later optional wrapper.

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

An MCP wrapper is optional and should be thin. It should wrap the stable context API rather than inventing a parallel contract.

Initial MCP tools should be read-only:

- `zen_current_tab`
- `zen_open_tabs`
- `zen_recent_tabs`

Later tools may include tab switching or bookmark actions, but only after confirmation and safety behavior is defined.

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
- How should confirmation work across Raycast and MCP clients?
- Should MCP expose only read-only tools by default?
- How should local memory be represented and cleared?
- Which context fields should be promoted from internal contract fields to external MCP fields?
