# Spec 012: Context Extractor Refactor Before Advanced AI Features

## Summary

Refactor the Firefox-family add-on context extraction service into smaller, testable modules before adding site adapters, multi-tab context workflows, MCP, or richer AI behavior. This is an internal structure change only: existing CLI context commands, output schemas, payload field names, warning codes, permissions, and extraction behavior must remain compatible.

## Status

- Implemented
- 2026-04-29: Refactored the Firefox-family add-on context extraction service into `firefox-addon/src/services/context/*` modules while keeping `firefox-addon/src/services/context.ts` as the handler-facing `getContext` entry point. Added pure-module add-on tests using the existing TypeScript compiler and Node's built-in test runner. No production dependencies, browser permissions, native messenger changes, Raycast command changes, or CLI schema changes were added.

## Milestone

Bridge milestone between M4: AI Extension Tools For `@zen` and the planned M5/M6 work.

This spec is a stabilization step for the current Zen Context V1 extraction layer. It should happen before optional MCP, site adapters, local browsing memory, or multi-tab AI workflows expand the extraction surface.

## Problem

`firefox-addon/src/services/context.ts` currently owns too many responsibilities in one file:

- native-message request parsing;
- context mode and format defaults;
- active-tab and focused-window lookup;
- unsupported URL checks;
- HTML sanitizer gating;
- error response construction;
- fallback behavior for unsupported pages and permission failures;
- payload shaping for CLI consumers;
- permission and capability derivation;
- truncation and warning bookkeeping;
- DOM extraction;
- selection extraction;
- text and Markdown shaping;
- metadata, JSON-LD, links, and images extraction;
- injected-script code construction.

That monolithic shape makes the current behavior harder to review and makes upcoming work risky. Site adapters and multi-tab extraction would add more branching to the same file, increasing the chance of unintentional CLI contract changes.

## Goals

- Preserve existing CLI context outputs for:
  - `mozeidon context active --format json`
  - `mozeidon context active --format text`
  - `mozeidon context active --format markdown`
  - `mozeidon context active --format html`
  - `mozeidon context selection`
  - `mozeidon context metadata`
  - `mozeidon context links`
- Preserve the current `html_sanitizer_missing` behavior for HTML requests.
- Preserve selection, text, Markdown, metadata, links, images, JSON-LD, selector, truncation, permission fallback, and unsupported-page behavior.
- Preserve payload field names and warning codes for this spec.
- Make request parsing, payload shaping, truncation, fallback, URL classification, and injected extraction easier to unit test.
- Keep injected request data safely serialized.
- Keep `firefox-addon/src/services/context.ts` as the public service entry point used by the existing handler, but reduce it to orchestration.
- Avoid native messenger, Raycast command, CLI contract, or browser permission changes.
- Keep build passing.

## Non-Goals

- No site adapters.
- No adapter registry.
- No MCP wrapper or MCP schema.
- No multi-tab context extraction.
- No local browsing memory, embeddings, or persistent context cache.
- No new browser permissions.
- No native messenger transport changes.
- No Raycast command behavior changes, except type or docs updates if implementation proves they are strictly needed.
- No CLI JSON schema changes.
- No warning-code taxonomy cleanup in this spec.
- No HTML sanitizer implementation.
- No new production dependencies.

## Scope

Primary scope:

- `firefox-addon/src/services/context.ts`
- new files under `firefox-addon/src/services/context/`
- add-on tests or fixtures if feasible with the existing toolchain or a separately approved dev-only test setup
- this spec and closely related documentation updates

Out of scope:

- `cli/`, unless implementation discovers a type-only mismatch that must be documented before any change.
- `raycast/`, unless implementation discovers a type-only mismatch that must be documented before any change.
- `chrome-addon/`
- native app or native messenger code.

## Proposed Module Layout

Keep the existing import surface stable:

```text
firefox-addon/src/services/context.ts
```

`context.ts` should continue exporting `getContext(port, command)` and should remain the only file imported by the current command handler. It becomes an orchestration layer:

1. parse request;
2. validate high-level request constraints;
3. get active tab and focused-window metadata;
4. apply HTML and unsupported-page guards;
5. execute extraction when allowed;
6. build and post the response.

Add a private module folder:

```text
firefox-addon/src/services/context/
  types.ts
  request.ts
  errors.ts
  browser-target.ts
  urls.ts
  extraction.ts
  injected-extractor.ts
  payload.ts
  fallbacks.ts
  truncation.ts
  permissions.ts
```

Suggested responsibilities:

`types.ts`

- shared context types currently local to `context.ts`;
- `ContextMode`, `ContextFormat`, `ContextStatus`;
- `ContextLimits`, `ContextRequest`, `ContextWarning`, `Truncation`, `ExtractedContext`;
- tab/window identity types used by payload builders.

`request.ts`

- `DEFAULT_LIMITS`;
- `parseContextRequest(args?: string)`;
- `parseMode`;
- `parseFormat`;
- validation of the opaque native-message `args` JSON string.

`errors.ts`

- `contextError(code, message, details?)`;
- named helpers for current top-level errors where useful:
  - `invalid_context_request`;
  - `selector_unsupported`;
  - `no_active_tab`;
  - `html_sanitizer_missing`;
  - `unsupported_page`;
  - `internal_error`.

`browser-target.ts`

- `getActiveTab()`;
- `getContextWindow(tab)`;
- any browser API adapter seams needed for tests.

`urls.ts`

- `isUnsupportedContextUrl(rawUrl?)`;
- `domainFromUrl(rawUrl?)`.

`extraction.ts`

- `executeContextExtraction(tabId, request)`;
- call `browser.tabs.executeScript`;
- log and map execution failures to current permission fallback behavior;
- call a helper that creates the injected script code.

`injected-extractor.ts`

- the injected DOM extractor function;
- `createInjectedExtractorCode(request)` or equivalent;
- serialization must pass request data through `JSON.stringify(request)`;
- no raw selector, URL, title, or page-derived value may be concatenated into executable code outside the JSON-serialized request object.

`payload.ts`

- `buildPayload(request, tab, window, extracted)`;
- `tabPayload(tab)`;
- merge extracted data with tab/window/page fields while preserving the current output shape.

`fallbacks.ts`

- `unsupportedFallback(request, tab)`;
- `permissionFallback(request, message)`;
- `fallbackContent(request, tab, warnings)`.

`truncation.ts`

- `truncate(value, maxBytes, field, warnings)`;
- `contentLimit(request, field)`;
- `truncationFromWarnings(warnings)`;
- `mergeTruncation(existing, warnings)`.

`permissions.ts`

- `permissionsForWarnings(warnings)`;
- `capabilitiesForWarnings(warnings)`.

The exact file names may change during implementation if the final boundaries are cleaner, but the refactor should keep these concepts separated.

## Design Rules

- Behavior-preserving refactor only.
- Move code first, then make only the minimal edits needed to satisfy imports and type checks.
- Keep current warning codes exactly as-is:
  - `unsupported_page`
  - `permission_unavailable`
  - `content_unavailable`
  - `content_truncated`
  - `metadata_truncated`
  - `json_ld_malformed`
  - `selection_unavailable`
  - `selector_invalid`
  - `selector_no_match`
  - `selector_multiple_matches`
- Keep current top-level error codes exactly as-is:
  - `invalid_context_request`
  - `selector_unsupported`
  - `no_active_tab`
  - `html_sanitizer_missing`
  - `unsupported_page`
  - `internal_error`
- Keep current `about:blank` handling.
- Keep current permission fallback shape, including `requiresHostPermission` and `missing: ["activeTab_or_host_permission"]`.
- Keep current Markdown V1 warning behavior, including the warning that Markdown is derived from basic page text.
- Keep current `domRead`, `contentSource`, selector, limits, and truncation fields.
- Do not introduce global mutable state for extraction behavior.
- Do not add production dependencies.

## API Or Contract

No external API or CLI contract changes are allowed.

The add-on must continue returning the current internal payload shape to the CLI mapper:

```json
{
  "ok": true,
  "status": "ok",
  "tab": {},
  "window": {},
  "page": {},
  "content": {},
  "metadata": {},
  "extraction": {
    "mode": "active",
    "selector": "main",
    "selectorMatched": true,
    "selectorMatchCount": 1,
    "contentSource": "selector",
    "domRead": true,
    "warnings": [],
    "limits": {},
    "truncation": {
      "truncated": false,
      "fields": []
    }
  },
  "permissions": {},
  "capabilities": {}
}
```

Errors must continue using:

```json
{
  "ok": false,
  "status": "error",
  "code": "html_sanitizer_missing",
  "message": "HTML context output requires sanitizer support before it can be enabled."
}
```

Optional fields remain optional exactly as they are today. This spec does not approve renaming fields, changing field types, changing warning messages as a goal, or changing default request parsing behavior.

## Safe Injection Serialization

The injected script must remain deterministic and self-contained.

Requirements:

- Use `browser.tabs.executeScript(tabId, { code })` as today.
- Build `code` from a known extractor function plus `JSON.stringify(request)`.
- Do not interpolate raw `request.selector`, page URL, title, selected text, or page-derived content into code outside the serialized request object.
- Return only JSON-serializable data from the injected function.
- Do not fetch remote resources.
- Do not mutate the DOM.
- Do not add dependencies to injected code without a separate justification.

Expected pattern:

```ts
export function createInjectedExtractorCode(request: ContextRequest) {
  return `(${injectedExtractor})(${JSON.stringify(request)})`
}
```

Implementation may add a small helper for serialization if needed, but it must preserve the same request values and output behavior.

## Test Strategy

Because the add-on currently has no dedicated automated test script, implementation should use the strongest feasible validation without turning this refactor into a tooling project.

### Unit-Test Candidates

If a test harness is already practical, add focused tests for pure modules:

- `parseContextRequest`:
  - empty args defaults to active/json/default limits;
  - invalid JSON returns `invalid_context_request`;
  - array/non-object args return `invalid_context_request`;
  - unsupported mode defaults to `active`;
  - unsupported format defaults to `json`;
  - provided limits are merged with defaults.
- `urls`:
  - `https:` and `http:` supported;
  - `about:blank` supported;
  - `about:config`, `moz-extension:`, `file:`, invalid, and empty URLs unsupported;
  - domains strip leading `www.`.
- `truncation`:
  - byte-length truncation preserves valid characters;
  - warning field names match current behavior;
  - merged truncation de-duplicates fields.
- `fallbacks`:
  - unsupported pages produce `unsupported_page`;
  - permission failures produce `permission_unavailable`;
  - active/text fallback uses title and URL;
  - active/markdown fallback preserves the current basic link and warning.
- `payload`:
  - extracted errors become top-level context errors;
  - successful payload preserves tab, window, page, extraction, permissions, and capabilities fields;
  - `domRead: false` tab-metadata fallback preserves current content behavior.
- `createInjectedExtractorCode`:
  - selector and limits appear only as JSON data;
  - generated code does not concatenate raw request fields outside serialization.

### Fixture Strategy

If full browser-like DOM tests are not feasible, add sanitized fixtures that document the existing shapes:

- active Markdown response for a normal page;
- active text response for a normal page;
- collapsed selection response;
- user selection response;
- metadata response with Open Graph, JSON-LD summary, headings, links, and images;
- links-only response;
- unsupported-page fallback;
- permission fallback;
- HTML sanitizer error.

Fixtures should avoid personal URLs and real browsing content.

### Manual Verification Steps

Run against a local Zen profile with the add-on and native app installed:

```text
mozeidon --profile-id <zen-profile> context active --format json
mozeidon --profile-id <zen-profile> context active --format text
mozeidon --profile-id <zen-profile> context active --format markdown
mozeidon --profile-id <zen-profile> context active --format html
mozeidon --profile-id <zen-profile> context selection
mozeidon --profile-id <zen-profile> context metadata
mozeidon --profile-id <zen-profile> context links
```

Manual cases:

- normal `https:` page with readable body text;
- selected page text;
- focused input or textarea selection;
- page with no selection;
- page with headings, links, images, Open Graph tags, and JSON-LD;
- page with enough text to trigger truncation by a small limit;
- `about:blank`;
- unsupported privileged page such as `about:config`;
- HTML format request, which must still return `html_sanitizer_missing`.

### Build And Static Validation

Required before implementation is called complete:

```text
cd firefox-addon && npm run build
```

If implementation touches CLI or Raycast types despite the non-goals, also run the relevant existing validation:

```text
cd cli && go test ./...
cd raycast && npm run lint
cd raycast && npm run build
```

## Acceptance Criteria

- `docs/zen-context/specs/012-context-extractor-refactor.md` exists and documents the refactor plan.
- This spec records the approved refactor scope and resulting constraints.
- `firefox-addon/src/services/context.ts` remains the handler-facing public service entry point.
- Context implementation is split into smaller modules under `firefox-addon/src/services/context/`.
- No new production dependencies are added.
- No browser permissions are added.
- No native messenger changes are made.
- No Raycast command behavior changes are made.
- Existing CLI context outputs are preserved for active, selection, metadata, links, text, Markdown, JSON, and HTML error flows.
- `html_sanitizer_missing` behavior is unchanged.
- Selection, text, Markdown, metadata, links, image, JSON-LD, selector, truncation, permission fallback, and unsupported-page behavior are unchanged.
- Payload field names and current warning codes are preserved.
- Injected request data remains safely serialized.
- Extraction helper functions are easier to test as pure modules or through small adapters.
- `cd firefox-addon && npm run build` passes.
- Manual verification steps above are completed or skipped with a documented reason.

## Security And Permissions

This refactor keeps the existing security posture:

- no new browser permissions;
- no new content extraction scope;
- no storage changes;
- no network requests;
- no destructive actions;
- no shell command construction;
- no native messenger protocol changes;
- no page mutation from injected scripts.

Page-derived values remain sensitive and must only flow through the existing local context path. The refactor should make this easier to audit by separating browser APIs, payload shaping, and injected DOM extraction.

## Alternatives Considered

### Leave `context.ts` Monolithic

Rejected because advanced adapters and multi-tab workflows would make the existing file more fragile and harder to test.

### Implement Site Adapter Registry Now

Rejected because adapters are explicitly a follow-up. The extraction foundation should be stabilized before adding site-specific behavior.

### Rewrite Context Extraction Around A New Contract

Rejected because the CLI context API is already consumed by Raycast commands and AI tools. This spec is compatibility-preserving.

### Add A Browser DOM Test Framework First

Deferred. DOM tests may be useful, but this spec should not be blocked on adding a new test stack unless implementation proves the risk justifies it. Any dev-only test dependency should be documented separately before adding it.

## Follow-Up Work

- Warning taxonomy cleanup. Current warnings mix availability, degradation, parsing, and truncation concerns. Preserve them for this spec, then consider a follow-up that documents stable warning categories and compatibility rules.
- HTML sanitizer implementation. Keep `html_sanitizer_missing` unchanged here.
- Site adapter registry after this refactor lands and contract fixtures are stable.
- Multi-tab context workflows after the single-tab extractor has clearer module boundaries.
- Optional MCP wrapper after context contracts and AI tool outputs remain stable.

## Decision Log

- 2026-04-29: Kept `context.ts` as the only command-handler import surface and moved request parsing, browser target lookup, extraction execution, injected extractor code, payload shaping, fallbacks, truncation, permissions/capabilities, URL helpers, errors, and shared types into dedicated files under `firefox-addon/src/services/context/`.
- 2026-04-29: Added a dev-only add-on test script without new dependencies. The script compiles pure context modules into `.test-dist` using the existing `typescript` dev dependency and runs plain JavaScript tests with Node's built-in `node --test` runner.
- 2026-04-29: Limited automated add-on tests to pure modules that do not require a browser extension runtime: request parsing, URL classification, truncation, and injected request serialization. DOM extraction and end-to-end CLI context behavior remain covered by build plus manual Zen verification steps.
- 2026-04-30: Added golden JSON fixtures for `html_sanitizer_missing`, permission fallback selection payloads, and unsupported-page Markdown fallback payloads. Tests compare JSON-serialized helper output so undefined optional fields are treated the same way native-message JSON transport treats them.

## Validation Log

- 2026-04-29: `cd firefox-addon && npm test` passed.
- 2026-04-29: `cd firefox-addon && npm run build` passed.
- 2026-04-29: `cd raycast && npm test` passed.
- 2026-04-29: `cd raycast && npm run lint` passed after rerunning with network access for Raycast schema/user validation.
- 2026-04-29: `cd raycast && npm run build` passed after rerunning with permission to write Raycast build output under the local Raycast config directory.
- 2026-04-29: Manual Zen context CLI checks were not completed in this environment. A non-destructive `mozeidon profiles get` probe failed because the CLI attempted to delete a profile file under `~/Library/Application Support/mozeidon_profiles`, which is outside the writable sandbox and is a mutating filesystem action.
- 2026-04-30: `cd firefox-addon && npm test` passed with eight tests, including the new golden fixture checks.
- 2026-04-30: `cd firefox-addon && npm run build` passed after adding golden fixtures.

## Open Questions

- Resolved 2026-04-29: Add a minimal dev-only pure-module test runner using existing tooling.
- Resolved 2026-04-29: Export pure helpers where needed for context orchestration and focused tests; keep the handler-facing service import as `firefox-addon/src/services/context.ts`.
- Deferred: Golden output fixtures for full CLI/add-on context payloads remain useful follow-up work because this implementation did not add a browser-runtime DOM test harness.
