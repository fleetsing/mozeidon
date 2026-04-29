# Spec 011: @zen AI Extension Tools

## Summary

Expose Zen Context and safe browser-control capabilities through Raycast AI Extension tools so users can `@mention` the Zen Context extension in Raycast AI workflows. The first tool set should let AI inspect the active Zen page, use selected text or page fallback, list/search tabs, retrieve tab content through the context API, and open or focus a URL without adding MCP, broad browser permissions, native messenger changes, or destructive browser actions.

## Status

- Implemented
- 2026-04-28: Implemented initial Raycast AI Extension tool manifest metadata, six `src/tools/*` entry points, shared tool handlers, representative eval metadata, and focused unit coverage. Implementation uses existing Mozeidon argument-array helpers and existing context/tab APIs without native messenger or browser permission changes.

## Milestone

M4: AI Extension Tools For `@zen`

## Problem

Zen Context currently targets Raycast commands and local context retrieval, but users also need AI workflows that can ask Raycast to inspect the current Zen tab, summarize selected text, reason over open tabs, and open or focus a relevant page. Raycast's private `{browser-tab}` placeholder should not be spoofed. The extension needs explicit AI tools with small schemas, predictable outputs, and safe Mozeidon command execution.

## Goals

- Expose initial Raycast AI Extension tools:
  - `zen_get_active_context`
  - `zen_get_selection_or_page`
  - `zen_list_tabs`
  - `zen_search_tabs`
  - `zen_get_tab_content`
  - `zen_open_or_focus_url`
- Make the extension available for Raycast AI mention workflows. The supported V1 mention is `@zen`, derived from the Raycast extension package name.
- Reuse the existing safe Mozeidon wrapper and Zen Context API.
- Keep tool names and descriptions clear enough for AI tool selection.
- Keep input schemas small, explicit, and validation-friendly.
- Return structured JSON by default, with concise Markdown only where useful for page/context content.
- Exclude destructive actions from V1.
- Add tests or evals where feasible for tool schema, command construction, output mapping, and representative `@zen` prompts.
- Run Raycast lint/build before calling implementation complete.

## Non-Goals

- No MCP server, MCP wrapper, or MCP tool schema.
- No browser add-on changes unless implementation proves the current context API is insufficient.
- No native messenger changes.
- No browser permission broadening unless implementation proves the existing context API cannot return real page content without it and this spec records the exception.
- No site adapters.
- No embeddings, local browsing memory, or persistent page-content cache.
- No destructive tools:
  - no close tab;
  - no delete history;
  - no delete bookmark;
  - no clear browsing data;
  - no bookmark mutation;
  - no tab group mutation.
- No private Raycast browser placeholder spoofing.
- No external AI provider dependencies, user API keys, or separate AI service.

## Scope

Primary scope is the Raycast extension:

- AI Extension tool registration/manifest metadata.
- Tool definitions, descriptions, and input schemas.
- Raycast-side tool handlers.
- Raycast-side Mozeidon wrapper calls.
- Raycast-side parsing and output mapping.
- Tests/evals for tool behavior where feasible.

Allowed Mozeidon CLI usage:

- existing context API:
  - `mozeidon context active --format <format>`
  - `mozeidon context selection`
- existing tab APIs:
  - `mozeidon tabs get`
  - `mozeidon tabs get --with-windows`
  - `mozeidon tabs switch <windowId>:<tabId>`
  - `mozeidon tabs new -- <url>`

Out of scope:

- `cli/` changes unless a documented context API gap blocks the tool contract.
- Firefox add-on changes unless a documented context API gap blocks the tool contract.
- Native messenger transport changes.
- MCP packages or schemas.

If implementation discovers that existing CLI/context capabilities cannot support a required tool, the implementer must update this spec with the gap before changing lower layers.

## User Workflow

### Summarize The Active Zen Tab

1. User opens Raycast AI and writes: `@zen summarize the active tab`.
2. Raycast chooses `zen_get_active_context`.
3. The tool calls the context API for active page Markdown.
4. The tool returns source metadata and page content.
5. Raycast AI summarizes the supplied content.

### Ask About Selected Text Or Page

1. User selects text in Zen or another app.
2. User writes: `@zen explain this selection in context`.
3. Raycast chooses `zen_get_selection_or_page`.
4. The tool prefers Zen DOM selection, falls back to Raycast selected text with Zen source metadata when available, then falls back to active page Markdown.
5. Raycast AI answers using the returned selected text or page content.

### Inspect Open Tabs

1. User writes: `@zen find the docs tab about context APIs`.
2. Raycast calls `zen_search_tabs`.
3. The tool returns matching open tabs with title, URL, tab id, window id, active state, and score/explanation when feasible.
4. AI can ask follow-up questions, call `zen_get_tab_content`, or call `zen_open_or_focus_url`.

### Open Or Focus A URL

1. User writes: `@zen open https://example.com in Zen`.
2. Raycast calls `zen_open_or_focus_url`.
3. The tool validates the URL.
4. The tool focuses an already-open matching tab when feasible, otherwise opens a new Zen tab through Mozeidon.
5. The tool returns structured result metadata.

## Proposed Design

Add a Raycast AI Extension tool layer that wraps the stable local Mozeidon APIs. Tool handlers should be thin and deterministic:

1. Validate tool input.
2. Build fixed Mozeidon argument arrays.
3. Invoke Mozeidon through the existing safe wrapper.
4. Parse known JSON output.
5. Return structured JSON or concise Markdown with source metadata.

Do not create a parallel context contract. AI tools should adapt the existing Zen Context contract for Raycast AI rather than redefining browser/page semantics.

### Tool Naming

Use `zen_` prefixes so tool names are easy to identify and unlikely to collide with generic Raycast tools. Tool descriptions should state:

- what the tool reads or changes;
- whether it uses the active tab, selected text, all tabs, or a URL;
- what output format it returns;
- that destructive actions are not available.

### Tool Output Pattern

Most tools should return structured JSON:

```json
{
  "ok": true,
  "tool": "zen_list_tabs",
  "data": {},
  "warnings": []
}
```

Context-heavy tools may return concise Markdown in `data.markdown` while preserving structured source fields:

```json
{
  "ok": true,
  "tool": "zen_get_active_context",
  "data": {
    "source": {
      "title": "Example",
      "url": "https://example.com"
    },
    "format": "markdown",
    "markdown": "# Example\n\n..."
  },
  "warnings": []
}
```

Errors should be structured:

```json
{
  "ok": false,
  "tool": "zen_get_active_context",
  "error": {
    "code": "content_unavailable",
    "message": "Active page content is unavailable. Check Zen context permissions or page support."
  },
  "warnings": []
}
```

### Tool Registration

Implementation should use the Raycast AI Extension tooling supported by the installed `@raycast/api` and Raycast extension manifest version. Before implementing, inspect local Raycast documentation/types in the installed dependency and prefer official SDK patterns.

The extension should expose itself to Raycast AI so users can `@mention` it. Raycast evals use the extension `name` from `package.json`; this fork now uses the Raycast package name `zen` and visible title `Zen Context`, so the supported V1 mention is `@zen`. The Mozeidon name remains for the underlying CLI, native app, and browser bridge.

## API Or Contract

### Shared Types

```ts
type ZenToolResponse<T> = {
  ok: true;
  tool: string;
  data: T;
  warnings: string[];
} | {
  ok: false;
  tool: string;
  error: {
    code: string;
    message: string;
  };
  warnings: string[];
};

type ZenSource = {
  title?: string;
  url?: string;
  tabId?: number;
  windowId?: number;
  active?: boolean;
};
```

### `zen_get_active_context`

Description:

Get the active Zen tab's page context using the Mozeidon context API. Use this to summarize, inspect, or answer questions about the current page.

Input schema:

```ts
type ZenGetActiveContextInput = {
  format?: "markdown" | "text" | "json";
  requireContent?: boolean;
};
```

Defaults:

- `format: "markdown"`
- `requireContent: true`

Mozeidon calls:

```text
mozeidon context active --format markdown
mozeidon context active --format text
mozeidon context active --format json
```

Output:

```ts
type ZenGetActiveContextData = {
  source: ZenSource;
  format: "markdown" | "text" | "json";
  markdown?: string;
  text?: string;
  context?: unknown;
};
```

Behavior:

- Return real page content only when content is available.
- If only title/URL metadata is available and `requireContent` is true, return `ok: false` with `content_unavailable`.
- Include warnings from the context API.

### `zen_get_selection_or_page`

Description:

Get selected Zen text when available, otherwise fall back to Raycast selected text with Zen source metadata, otherwise return active page content.

Input schema:

```ts
type ZenGetSelectionOrPageInput = {
  format?: "markdown" | "text";
  requireContent?: boolean;
};
```

Defaults:

- `format: "markdown"`
- `requireContent: true`

Resolution order:

1. Use Mozeidon/Zen DOM selection if available and non-empty.
2. If Zen selection is unavailable, permission-blocked, or empty, try Raycast selected text.
3. If Raycast selected text exists, attach active Zen tab/page title and URL when available.
4. If no selected text exists, return active page Markdown/text.
5. If only title/URL fallback exists and `requireContent` is true, return `content_unavailable`.

Output:

```ts
type ZenGetSelectionOrPageData = {
  source: ZenSource;
  kind: "zen-selection" | "raycast-selection" | "active-page";
  format: "markdown" | "text";
  text?: string;
  markdown?: string;
};
```

### `zen_list_tabs`

Description:

List open Zen tabs with stable IDs and source metadata. Use this to inspect current browser state before choosing a tab.

Input schema:

```ts
type ZenListTabsInput = {
  includeWindows?: boolean;
  limit?: number;
};
```

Defaults:

- `includeWindows: true`
- `limit: 50`

Mozeidon call:

```text
mozeidon tabs get --with-windows
```

Output:

```ts
type ZenListTabsData = {
  tabs: Array<{
    id: number;
    windowId?: number;
    title: string;
    url: string;
    active?: boolean;
    pinned?: boolean;
    windowFocused?: boolean;
  }>;
};
```

Behavior:

- Sort active/focused tabs first when possible, otherwise preserve CLI order.
- Enforce a conservative limit to avoid large AI context payloads.
- Do not expose history or closed tabs in this tool.

### `zen_search_tabs`

Description:

Search currently open Zen tabs by title and URL. Use this when the user asks for a known open tab or page.

Input schema:

```ts
type ZenSearchTabsInput = {
  query: string;
  limit?: number;
};
```

Defaults:

- `limit: 10`

Mozeidon call:

```text
mozeidon tabs get --with-windows
```

Output:

```ts
type ZenSearchTabsData = {
  query: string;
  matches: Array<{
    id: number;
    windowId?: number;
    title: string;
    url: string;
    active?: boolean;
    score?: number;
    reason?: string;
  }>;
};
```

Behavior:

- Implement simple deterministic local matching over title and URL first.
- Do not call external search services.
- Return an empty match list with `ok: true` when no tabs match.

### `zen_get_tab_content`

Description:

Get content for a Zen tab using the context API. Prefer the active tab; when a non-active tab is requested, focus it only if existing safe Mozeidon tab switching can identify the tab unambiguously.

Input schema:

```ts
type ZenGetTabContentInput = {
  tabId?: number;
  windowId?: number;
  url?: string;
  format?: "markdown" | "text";
  requireContent?: boolean;
};
```

Defaults:

- active tab when no `tabId`/`windowId`/`url` is provided;
- `format: "markdown"`
- `requireContent: true`

Behavior:

- If no target is provided, call active context directly.
- If `tabId` and `windowId` identify an open tab, use existing safe tab switching before context retrieval.
- If only `url` is provided, first search open tabs for an exact URL match.
- If the target cannot be identified unambiguously, return `ok: false` with `ambiguous_tab` or `tab_not_found`.
- Do not scrape inactive tabs through new add-on permissions.

Output:

```ts
type ZenGetTabContentData = {
  source: ZenSource;
  format: "markdown" | "text";
  markdown?: string;
  text?: string;
};
```

### `zen_open_or_focus_url`

Description:

Open a URL in Zen or focus an already-open matching tab. This is non-destructive browser control and does not close, delete, or mutate stored data.

Input schema:

```ts
type ZenOpenOrFocusUrlInput = {
  url: string;
  preferFocusExisting?: boolean;
};
```

Defaults:

- `preferFocusExisting: true`

Behavior:

- Validate `url` as an absolute `http:` or `https:` URL.
- If `preferFocusExisting` is true, search open tabs for exact normalized URL match and switch to it when found.
- Otherwise open a new tab with:

```text
mozeidon tabs new -- <url>
```

- Activate/focus Zen using the extension's existing Zen app activation behavior only where existing tab-opening/focusing flows already do so.

Output:

```ts
type ZenOpenOrFocusUrlData = {
  action: "focused-existing" | "opened-new";
  source: ZenSource;
};
```

## Expected `@zen` Prompt Examples

Examples the first implementation should support:

- `@zen summarize the active tab`
- `@zen what is this current Zen page about?`
- `@zen explain the selected text`
- `@zen use the selected text if there is one, otherwise summarize the page`
- `@zen list my open tabs`
- `@zen find the open tab about OAuth callbacks`
- `@zen summarize the tab with "release notes" in the title`
- `@zen open https://developer.mozilla.org/en-US/docs/Web/API in Zen`
- `@zen focus the already-open GitHub pull request tab`
- `@zen compare the active page with the selected text`

## Security And Permissions

- User-derived inputs:
  - tool input strings such as query, URL, and format;
  - Raycast selected text;
  - natural-language AI prompt that caused tool invocation.
- Page-derived inputs:
  - title, URL, tab IDs, page Markdown/text, selected text, warnings from the Mozeidon context API.
- Command execution:
  - Use the existing Raycast Mozeidon wrapper.
  - Pass all Mozeidon arguments as arrays.
  - Do not interpolate user input into shell command strings.
  - Validate URLs before calling `tabs new`.
- Browser permissions:
  - No new permissions except the documented `<all_urls>` Firefox/Zen host-permission exception needed for native-message initiated context extraction.
  - Respect context API permission and unsupported-page errors.
- Destructive actions:
  - None in V1.
  - `zen_open_or_focus_url` may open or focus a tab, but must not close, delete, overwrite, or clear data.
- Storage:
  - Do not persist page content, selected text, tool inputs, or tool outputs outside normal Raycast transient tool execution.
- Network behavior:
  - Mozeidon calls remain local.
  - Raycast AI may use tool outputs in Raycast AI requests as part of user-initiated `@zen` workflows.
  - No additional external network calls.

## Alternatives Considered

- MCP first: rejected for this spec because Raycast AI Extension tools should validate the local tool model before adding MCP.
- Site adapters first: rejected because baseline context and tab tools should work before site-specific extraction.
- Broad add-on content permissions by default: rejected because V1 should reuse the existing context API and permission behavior. A later documented exception allowed `<all_urls>` after manual testing proved native-message initiated context extraction could otherwise only return metadata for normal web pages.
- Include destructive tab/history/bookmark actions: rejected for V1 because AI tool invocation should begin read-only plus non-destructive open/focus behavior.
- Return only Markdown from all tools: rejected because tab and action tools need structured JSON that AI can inspect reliably.

## Test Plan

Automated tests where feasible:

- Tool registration metadata includes all six tool names and clear descriptions.
- Input schemas accept valid minimal inputs and reject invalid types/options.
- Mozeidon command construction uses argument arrays:
  - `context active --format markdown`
  - `context selection`
  - `tabs get --with-windows`
  - `tabs switch <windowId>:<tabId>`
  - `tabs new -- <url>`
- `zen_get_active_context` maps successful context output and structured context errors.
- `zen_get_selection_or_page` follows selection fallback order.
- `zen_list_tabs` limits and maps tab output.
- `zen_search_tabs` returns deterministic matches and empty results.
- `zen_get_tab_content` rejects ambiguous or missing tab targets.
- `zen_open_or_focus_url` validates URL input and rejects non-http(s) schemes.
- Tool outputs do not include hidden local files, history, bookmarks, or unrelated tabs.

Evals where feasible:

- Prompt: `@zen summarize the active tab`
  - Expected tool choice: `zen_get_active_context`.
- Prompt: `@zen explain the selected text`
  - Expected tool choice: `zen_get_selection_or_page`.
- Prompt: `@zen find my GitHub PR tab`
  - Expected tool choice: `zen_search_tabs`.
- Prompt: `@zen list open tabs`
  - Expected tool choice: `zen_list_tabs`.
- Prompt: `@zen open https://example.com`
  - Expected tool choice: `zen_open_or_focus_url`.

Validation commands:

```text
cd raycast
npm run lint
npm run build
```

Run the Raycast test command if present:

```text
cd raycast
npm test
```

Manual verification:

- Confirm the extension can be `@mentioned` in Raycast AI.
- Confirm Raycast AI can call `zen_get_active_context` and summarize a normal Zen tab.
- Confirm selected text fallback works.
- Confirm open tab listing/search works.
- Confirm `zen_open_or_focus_url` focuses an existing URL when open and opens a new tab otherwise.
- Confirm unsupported pages produce clear structured errors.

## Acceptance Criteria

- The Raycast extension exposes the six initial AI Extension tools.
- Raycast can `@mention` the extension in AI workflows.
- Raycast AI can call tools to summarize or inspect the active Zen tab.
- Tool input schemas are small and explicit.
- Tool outputs are structured JSON or concise Markdown where appropriate.
- Destructive actions are absent from the tool list.
- No MCP implementation is added.
- No native messenger changes are made.
- No browser add-on permission changes are made unless this spec is updated with a required gap.
- `cd raycast && npm run lint` passes.
- `cd raycast && npm run build` passes.

## Rollout Plan

1. Inspect installed Raycast AI Extension tool API and local TypeScript definitions.
2. Add tool metadata and shared response types.
3. Implement read-only context tools first:
   - `zen_get_active_context`
   - `zen_get_selection_or_page`
4. Implement tab inspection tools:
   - `zen_list_tabs`
   - `zen_search_tabs`
   - `zen_get_tab_content`
5. Implement non-destructive browser control:
   - `zen_open_or_focus_url`
6. Add tests/evals.
7. Run lint/build/tests.
8. Manually verify representative `@zen` prompts.

## Progress Log

- 2026-04-28: Confirmed current Raycast docs define AI tools through a top-level `tools` manifest array and `src/tools/<tool-name>.ts` entry points. The installed local `@raycast/api` types do not expose a dedicated tool helper, so handlers are plain default-exported async functions following the documented pattern.
- 2026-04-28: Added all six initial tool entries:
  - `zen_get_active_context`
  - `zen_get_selection_or_page`
  - `zen_list_tabs`
  - `zen_search_tabs`
  - `zen_get_tab_content`
  - `zen_open_or_focus_url`
- 2026-04-28: Added `ai.instructions` and representative `ai.evals` in `raycast/package.json`.
- 2026-04-28: Added focused tests for manifest tool metadata, eval prompts, context output mapping, selection fallback, tab listing/search, tab-content target resolution, URL validation, and open/focus behavior.
- 2026-04-28: Addressed review gaps by rejecting JSON metadata-only context when `requireContent` is true, falling back from recoverable Zen selection failures to Raycast selected text, and attaching active Zen page title/URL metadata to Raycast selected-text output when available.
- 2026-04-28: Validation after fixes: `cd raycast && npm test` passed with 68 tests. `npm run lint` and `npm run build` passed outside the sandbox; sandboxed lint could not resolve Raycast schema/user endpoints and sandboxed build hit a Raycast CLI nil-pointer runtime error.
- 2026-04-28: Addressed review gaps by returning structured errors for missing `zen_search_tabs` query input and missing `zen_open_or_focus_url` URL input.
- 2026-04-28: Manual testing found that the configured `/opt/homebrew/bin/mozeidon` can be older than this fork and may not expose the `context` command. AI tools now map `unknown command "context"` failures to a structured `context_command_unavailable` setup error.
- 2026-04-28: Manual testing found that a current CLI can still fail when the native app IPC/profile connection is unavailable (`Cannot read via ipc with host: ...`). AI tools now map that failure to a structured `mozeidon_unavailable` setup error instead of returning raw child-process output.
- 2026-04-28: Validation after IPC error handling: `cd raycast && npm test` passed with 85 tests. `npm run lint` and `npm run build` passed outside the sandbox. Sandboxed lint could not resolve Raycast network schema/user endpoints, and sandboxed build hit the Raycast CLI nil-pointer runtime error.
- 2026-04-28: Manual testing exposed two context API insufficiencies outside Raycast scope: profile-id lookup could choose an older matching native-app IPC record, and `context active` could deadlock while waiting for a missing `get-context` IPC response. The CLI now prefers the best matching profile record and bounds `get-context` waiting before falling back to tab metadata.
- 2026-04-28: Validation after CLI hardening: `cd cli && go test ./...`, `cd raycast && npm test`, `cd raycast && npm run lint`, and `cd raycast && npm run build` passed outside the sandbox. Rebuilt `/Users/jarnolouhelainen/.local/bin/mozeidon`; `context selection` and `context active --format markdown` now return structured partial context instead of IPC/deadlock failures.
- 2026-04-28: Manual testing found the Raycast parser still assumed `content.markdown` and `content.text` were strings, while the context API returns structured `{ value, length, truncated }` objects. Raycast now extracts `.value`, includes `extraction.warnings`, and treats `extraction.contentSource: "tab-metadata"` as metadata-only so tools do not present title/URL fallback as real page content.
- 2026-04-28: Validation after structured content parsing fix: `cd raycast && npm test` passed with 87 tests. `cd raycast && npm run lint` and `cd raycast && npm run build` passed outside the sandbox.
- 2026-04-28: Manual testing reproduced an additional native-app lifecycle race: a context tool call could succeed, then a follow-up context call could immediately fail because the native app profile disappeared or re-registered under a new IPC host. The CLI now retries profile lookup and IPC connection together so AI tool context chains can survive native profile rotation.
- 2026-04-28: Validation after native profile retry hardening: `cd cli && go test ./...`, `cd raycast && npm test`, `cd raycast && npm run lint`, and `cd raycast && npm run build` passed outside the sandbox. Rebuilt `/Users/jarnolouhelainen/.local/bin/mozeidon`; five sequential `context selection` plus `context active --format markdown` pairs completed successfully with the explicit Zen profile id.
- 2026-04-28: Manual testing confirmed the active tab is the Wikipedia Raycast page, but context extraction remains metadata-only because the Firefox/Zen add-on lacks host permission for normal web pages. The add-on manifest now includes `<all_urls>` for the Firefox/Zen build so native-message initiated context extraction can execute on pages; `activeTab` alone would not cover Raycast-triggered native-message calls because there is no browser extension user gesture.
- 2026-04-28: Reloading the unpacked add-on can rotate the Mozeidon profile id, making a previously configured Raycast profile preference stale. Raycast context reads now retry once without the configured profile id when the CLI returns `profile_not_found`, so a single current default Zen profile can recover automatically during development.
- 2026-04-29: Manual testing showed selection-aware AI tools ignored valid Zen selection payloads from the add-on because the add-on marks `window.getSelection()` content as `source: "user-selection"` and focused input selections as `source: "focused-input"`, while Raycast only accepted `source: "dom"`. Raycast now treats both add-on sources as real Zen DOM selection data when text is present.
- 2026-04-29: Manual testing showed `@zen summarize the active tab` could not access the extension tools even though normal Raycast commands worked. The Raycast extension was still pinned to `@raycast/api` 1.70.3, while Raycast AI tools were introduced in 1.93.0. The Raycast SDK is now updated to 1.104.13 with matching React/Node type packages, and tests guard against dropping below a tool-capable SDK version. `npm run build` now lists and bundles all six `src/tools/*` entry points.
- 2026-04-29: Independent review tightened hidden semantics: `zen_get_tab_content` no longer refocuses a tab that is already active in the focused Zen window, manifest/tool-definition titles are tested for drift, context CLI connection failures are classified as `native_messaging_unavailable`, and the documented `<all_urls>` permission exception is reflected in the security guidance.
- 2026-04-29: Raycast eval verification showed that AI Extension eval prompts must mention the extension package name. This fork now renames the Raycast extension package to `zen` and the visible extension title to `Zen Context`, so the supported AI mention and eval examples are `@zen`. Mozeidon remains the local CLI/native-app/browser-bridge name, and the Raycast CLI path preference remains named for Mozeidon.
- 2026-04-29: PR review follow-up tightened `zen_get_tab_content` input validation so partial tab targets and empty URL targets return `invalid_input` instead of silently reading the active tab. IPC client connection errors now preserve the failed operation and wrapped underlying cause for easier diagnosis.

## Open Questions

- Should `zen_get_tab_content` focus non-active tabs automatically, or return a `requires_focus` response for AI/user confirmation first?
- Should `zen_open_or_focus_url` support non-http(s) schemes in a later version with explicit confirmation?

## Resolved Decisions

- 2026-04-28: AI Extension tools are registered with a top-level `tools` array in `raycast/package.json`, with each tool name mapping to `src/tools/<tool-name>.ts`. Tool handlers are plain default-exported functions. AI instructions and evals are defined under the top-level `ai` manifest key.
- 2026-04-29: The supported V1 Raycast AI mention is `@zen`, because the Raycast extension package name is `zen`. The visible extension title is `Zen Context`; the Mozeidon name is retained only where it refers to the underlying executable and browser bridge.
- 2026-04-29: Raycast evals are run with `env PATH="$PWD/node_modules/.bin:$PATH" ./node_modules/.bin/ray evals --skipBuild` in this workspace because the eval runner shells out to `ray build` internally.
