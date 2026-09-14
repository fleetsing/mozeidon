# zen-mcp-server

A read-only [MCP](https://modelcontextprotocol.io) server wrapping the Zen context API (see [docs/zen-context/specs/020-mcp-read-only-server.md](../docs/zen-context/specs/020-mcp-read-only-server.md)). It exposes five tools — `zen_get_active_context`, `zen_get_selection_or_page`, `zen_list_tabs`, `zen_search_tabs`, `zen_get_tab_content` — to any MCP client (Claude Code, Claude Desktop, etc.), not just Raycast.

It shells out to the same `mozeidon` CLI the Raycast extension uses, so Zen Browser and the Mozeidon add-on/native app must already be set up per the main [README](../README.md).

## Build

```bash
npm install
npm run build
```

This produces `dist/index.js`.

## Configuration

Set via environment variables, passed through your MCP client's server config:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `MOZEIDON_CLI_PATH` | No | `mozeidon` (resolved via `PATH`) | Path to the `mozeidon` CLI binary. |
| `MOZEIDON_PROFILE_ID` | No | unset (CLI picks its default profile) | Zen profile id or alias, if you use more than one. |

## Adding it to Claude Code

```bash
claude mcp add zen -- node /absolute/path/to/mcp-server/dist/index.js
```

Or in `.mcp.json`:

```json
{
  "mcpServers": {
    "zen": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "MOZEIDON_CLI_PATH": "/absolute/path/to/mozeidon",
        "MOZEIDON_PROFILE_ID": "your-profile-id-or-alias"
      }
    }
  }
}
```

## Scope

Read-only by design (first pass at the roadmap's Milestone 5). `zen_open_or_focus_url` (the one mutating tool in the underlying context API) is deliberately not registered here. See spec 020 for the full design, including why `zen_get_selection_or_page` never reports a `raycast-selection` result outside Raycast, and why the core logic files are duplicated from `raycast/src/` rather than shared via a workspace package.

## Test

```bash
npm test
```
