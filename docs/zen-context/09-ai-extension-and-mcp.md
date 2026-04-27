# AI Extension And MCP

Zen Context should eventually support AI workflows, but the context contract should stabilize before broad tool surfaces are added.

## AI Extension Direction

AI Extension tools for `@zen` workflows should come before MCP.

Initial tools should be read-only:

- get current Zen tab context;
- get selected context format;
- list relevant open tabs;
- search local browser state if the CLI already supports it.

Mutating tools should come later and require explicit confirmation semantics.

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
- No page content extraction unless explicitly enabled.
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

- Which AI Extension framework will host `@zen` tools?
- How should confirmation work across Raycast and MCP clients?
- Should MCP expose only read-only tools by default?
- How should local memory be represented and cleared?
- Which context fields are stable enough for external tools?
