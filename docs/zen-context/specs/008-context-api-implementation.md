# Spec 008: Zen Context API Implementation

## Summary

Implement the first page-content version of the Mozeidon Zen Context API defined in [Spec 007](./007-context-api-contract.md). This spec turns the approved contract into concrete CLI, Firefox add-on, and test work for extracting active page text, sanitized HTML, Markdown, selection, metadata, and links from Zen Browser.

The first implementation should prioritize correctness, clear failure modes, least-privilege permissions, and contract-compatible JSON over broad browser access or polished Raycast UX.

## Status

- Implemented
- V1 adds the CLI/add-on context extraction path without browser permission changes.
- HTML remains guarded by `html_sanitizer_missing` until sanitizer behavior is implemented and tested.
- Real DOM extraction depends on the browser granting active-tab/page script access; when unavailable, commands return structured partial/error JSON.
- Manual 7.2 verification showed that permission-denied fallbacks must clearly distinguish tab metadata from real DOM extraction.

## Milestone

M2: Zen Context V1

## Problem

Spec 007 defines the typed context contract and a minimal CLI surface that can identify the active tab. The remaining practical value requires extracting page content from the active Zen tab:

- readable text for clipboard and AI workflows;
- sanitized HTML for rich context when safe;
- Markdown for prompt-friendly page context;
- current selection;
- metadata, headings, JSON-LD, links, and images.

The browser add-on currently has tab, session, bookmark, history, group, and storage permissions, but no page-content permission. The implementation must add extraction without silently broadening privacy scope.

## Goals

- Implement context extraction for the active Zen tab according to Spec 007.
- Support the required CLI commands:
  - `mozeidon context active --format text`
  - `mozeidon context active --format html`
  - `mozeidon context active --format markdown`
  - `mozeidon context selection`
  - `mozeidon context metadata`
  - `mozeidon context links`
- Return valid structured JSON matching the Spec 007 contract.
- Preserve existing tab, bookmark, history, group, window, and profile behavior.
- Use the least-privilege browser permission model feasible for V1.
- Prefer `activeTab` and user-triggered access where feasible.
- Report permission and unsupported-page failures through structured JSON and warnings.
- Avoid native messenger changes unless implementation proves the existing command/payload shape cannot safely carry the data.
- Add focused CLI, core mapping, and add-on extraction tests where feasible.

## Non-Goals

- No Raycast AI Extension tools.
- No MCP wrapper.
- No new Raycast top-level commands unless needed only as a temporary manual invocation helper.
- No multi-tab context.
- No site adapter registry.
- No persistent page-context cache.
- No embeddings or browsing memory.
- No broad host permission such as `<all_urls>` by default.
- No raw/plain stdout output mode.
- No raw or unsafe HTML mode.
- No browser-content mutation.
- No network fetches for links, images, scripts, styles, or metadata.

## Scope

Primary scope:

- `cli/cmd/context/`
- `cli/core/context-contract.go`
- new or updated CLI context extraction/mapping helpers
- `cli/browser/core/models/commands.go`
- Firefox add-on command model and handler
- Firefox add-on context extraction service
- Firefox add-on manifest only if required for least-privilege content extraction
- tests in CLI and add-on packages
- Spec 008 progress log as implementation decisions are made

Out of scope:

- Native messenger transport changes, unless proven necessary and documented in this spec before implementation continues.
- Raycast production commands.
- Chrome add-on parity.
- Browser permission broadening beyond the accepted policy in this spec.

Likely files touched:

- `cli/cmd/context/root.go`
- `cli/core/context-contract.go`
- `cli/core/context-contract_test.go`
- `cli/core/context-extraction.go` or similar new helper
- `cli/browser/core/models/commands.go`
- `firefox-addon/src/models/command.ts`
- `firefox-addon/src/handler.ts`
- `firefox-addon/src/services/context.ts`
- `firefox-addon/src/services/context.test.ts` if the add-on test setup supports it
- `firefox-addon/manifest.json`
- `firefox-addon/package.json` only if test scripts already exist or a minimal existing-tooling script is needed

## Permission Policy

### Default Policy

Do not add broad host permissions by default.

V1 should use the least-privilege path:

1. Add or use `activeTab` if it is sufficient for user-triggered extraction.
2. Keep extraction limited to the active tab.
3. Return structured `permission_denied` or partial context when the active tab grant is unavailable.
4. Report capabilities and missing permissions according to Spec 007.

### ActiveTab Reality

Spec 007 notes that Raycast to CLI to native-message requests may not count as browser user actions. Therefore `activeTab` alone may not make Raycast-pulled context reliable.

For V1, this is acceptable only if behavior is explicit:

- When the add-on has an active temporary grant for the current tab, CLI context commands should extract content.
- When no grant is available, commands must return valid structured JSON with `permission_denied` or a partial context plus `permission_unavailable`.
- Manual verification may use a user-triggered browser action or temporary developer flow to grant access to the active tab.

### Host Permissions

Do not add `<all_urls>` or equivalent broad host permissions in this spec.

If implementation proves that V1 cannot satisfy the required commands with `activeTab`, the implementer must stop and update this spec with a narrow permission proposal before changing the manifest. Acceptable follow-up options include:

- optional host permissions requested through explicit onboarding;
- a constrained allowlist for manual development verification only;
- separate Raycast/onboarding spec for reliable user-approved host access.

Any manifest change must document:

- exact permission added;
- why it is necessary;
- what data it exposes;
- how users can avoid or revoke it;
- behavior when permission is absent.

## Proposed Design

### Command Flow

1. CLI parses `context` command flags.
2. CLI loads the selected Mozeidon profile.
3. CLI asks the add-on for active context extraction with a structured request.
4. Add-on identifies the active tab in the last-focused window.
5. Add-on validates the URL against privileged/unsupported-page rules.
6. Add-on checks whether it can access page content.
7. Add-on extracts the requested data.
8. Add-on returns a JSON payload or partial extraction payload to CLI.
9. CLI maps the payload into the Spec 007 `zen.context` or `zen.context.error` shape.
10. CLI writes one JSON object to stdout and exits with the specified code.

### Native Messaging

The existing native messenger transports `Command{command,args}` requests and data/end responses. The implementation should first try to add a new add-on command using the existing transport:

```ts
CommandName.GET_CONTEXT = "get-context"
```

The `args` value may be a JSON string for V1 context options, for example:

```json
{
  "mode": "active",
  "format": "markdown",
  "selector": "main",
  "limits": {
    "maxBytes": 1000000,
    "maxTextBytes": 50000,
    "maxMarkdownBytes": 50000,
    "maxHtmlBytes": 250000,
    "maxLinks": 500,
    "maxImages": 200,
    "maxJsonLdBytes": 100000
  }
}
```

This does not require native messenger protocol changes because `args` is already an opaque string. If the current transport cannot reliably carry context payloads up to the global limit, implementation must document the failure and either reduce limits or propose a native messenger follow-up.

### Add-On Extraction Service

Add a Firefox add-on context service responsible for:

- active tab lookup;
- privileged/unsupported-page classification;
- permission/capability detection;
- selector validation and matching;
- text extraction;
- selection extraction;
- sanitized HTML extraction;
- Markdown conversion;
- metadata extraction;
- links/images extraction;
- truncation and warnings.

Preferred internal shape:

```ts
type ContextRequest = {
  mode: "active" | "selection" | "metadata" | "links";
  format: "json" | "text" | "markdown" | "html";
  selector?: string;
  limits: ContextLimits;
};

type ContextExtractionPayload = {
  tab: BrowserTabIdentity;
  page: PageIdentity;
  content?: ContentPayload;
  metadata?: MetadataPayload;
  extraction: ExtractionPayload;
  permissions: PermissionPayload;
  capabilities: CapabilityPayload;
};
```

The add-on does not need to emit the final Spec 007 JSON shape if CLI mapping remains cleaner, but field names should be close enough that fixtures are easy to compare.

### Script Injection Strategy

For Manifest V2, DOM extraction should use `tabs.executeScript` only after permission checks and unsupported-page checks.

Rules:

- Inject only into the active tab.
- Do not inject into privileged or unsupported URLs.
- Do not execute page-provided script.
- Keep injected code deterministic and self-contained.
- Return serializable data only.
- Do not fetch remote resources.
- Do not mutate the DOM.
- Avoid dependencies in injected code unless they can be bundled and audited.

The injected extractor should collect data using DOM APIs and return a plain JSON-serializable object. Sanitization and Markdown conversion may happen in the injected script or in the background service, but the final output must respect the same safety rules.

### Text Extraction

`mozeidon context active --format text` should populate `content.text`.

V1 text extraction should:

- prefer readable body/main content when available;
- fall back to `document.body.innerText`;
- omit script/style/template/noscript content;
- normalize whitespace for readability;
- preserve meaningful line breaks around headings, paragraphs, list items, table rows, and pre/code blocks where practical;
- respect `limits.maxTextBytes` and global `maxBytes`;
- add `content_truncated` when truncated;
- add `content_unavailable`, `unsupported_page`, or `permission_unavailable` instead of silently returning empty text.

### Sanitized HTML Extraction

`mozeidon context active --format html` should populate `content.html`.

V1 must not return successful HTML until sanitizer behavior is implemented and tested.

Sanitized HTML rules:

- no `<script>` content;
- no inline event handlers;
- no `javascript:` URLs;
- no privileged extension or browser chrome markup;
- no active forms or controls when rendered in privileged UIs;
- no external resource injection that could be executed by a downstream renderer;
- no raw full `outerHTML`;
- content scope must be reported through `extraction.contentSource`.

Scope rules:

- active without selector: sanitized readable document/body content;
- active with selector: sanitized matched element subtree;
- selection: sanitized selected range HTML when available;
- metadata/links: do not populate `content.html`.

If no sanitizer is implemented, keep the current structured `html_sanitizer_missing` behavior.

### Markdown Extraction

`mozeidon context active --format markdown` should populate `content.markdown`.

V1 Markdown should:

- be derived from sanitized/readable DOM, not raw HTML;
- include title and source URL when page content is available;
- preserve headings, paragraphs, lists, blockquotes, code blocks, tables, and links where practical;
- represent useful images with alt text and resolved source URL without fetching image bytes;
- normalize whitespace for AI prompt readability;
- not invent or summarize content;
- avoid including hidden template/script/style/control text;
- respect `limits.maxMarkdownBytes` and global `maxBytes`;
- add warnings for degraded conversion, missing permission, unsupported page, or truncation.

If robust Markdown conversion would require a new production dependency, ask before adding it. A simple local converter is acceptable for V1 if tests define its limits and warnings are explicit.

### Selector Behavior

Selector behavior must follow Spec 007 exactly:

- applies only to `context active`;
- selector input is passed as a CLI argument value and encoded in the structured request, not interpolated into shell strings;
- standard CSS selector semantics where possible;
- invalid selector syntax: non-zero structured `selector_invalid`;
- unsupported selector mode: non-zero structured `selector_unsupported`;
- valid selector with no match: exit `0`, `ok: true`, `status: "empty"`, warning `selector_no_match`;
- multiple matches: use the first match and add `selector_multiple_matches`;
- no silent fallback to full-page extraction;
- no cross-frame, cross-extension, or privileged-boundary traversal in V1.

### Selection Behavior

`mozeidon context selection` should return page identity and `content.selection`.

V1 fallback order:

1. user-selected text and sanitized selected HTML from the active document;
2. selected text from focused input or textarea;
3. empty selection response with `content.selection.source: "none"` and `selection_unavailable` warning.

No-selection should be a successful partial or empty context, not a CLI crash.

Selection extraction must respect size limits independently from full page content.

### Metadata Behavior

`mozeidon context metadata` should populate:

- `page.language`;
- `page.canonicalUrl`;
- Open Graph tags;
- raw parsed JSON-LD;
- best-effort JSON-LD summaries;
- headings;
- links;
- images.

Rules:

- malformed JSON-LD adds `json_ld_malformed` warning and does not fail the whole command;
- raw and summary JSON-LD both respect size limits;
- metadata truncation adds `metadata_truncated`;
- missing metadata is not an error;
- no network requests;
- no script execution beyond the extraction script itself.

### Links Behavior

`mozeidon context links` should populate `metadata.links`.

Rules:

- include visible text and resolved absolute `href` where possible;
- include `title`, `rel`, `target`, and link `kind` where practical;
- cap results at `limits.maxLinks`;
- add `metadata_truncated` when links are omitted due to limits;
- do not follow links.

### Privileged, Blank, And Empty Pages

Privileged and unsupported pages follow Spec 007.

V1 should classify at least:

- `about:`
- `chrome:`
- `resource:`
- `moz-extension:`
- empty or unparsable URLs
- `view-source:`
- `data:`
- `blob:`
- `file:` unless explicitly tested and permissioned

Expected behavior:

- active tab identity may still be returned when available;
- DOM extraction is not attempted;
- selector requests return structured `unsupported_page`;
- text/Markdown may return title/URL-only partial context with `unsupported_page`;
- HTML returns `html_sanitizer_missing` unless sanitizer exists, or `unsupported_page` if sanitizer exists but page is restricted;
- selection/metadata/links return partial context with `unsupported_page` warning or structured `unsupported_page` error, as long as the behavior is stable and tested.

Blank normal pages should not be treated as privileged:

- `about:blank` is special. If the browser permits injection and the page has no content, return empty/partial context rather than privileged DOM data.
- Empty pages should use `status: "empty"` or `status: "partial"` with explicit warnings, not `internal_error`.

## Implementation Tasks

### Task 1: Lock CLI Request And Mapping

- Define a typed Go request for add-on context extraction.
- Add command construction from `ContextOptions`.
- Keep existing `context` command flags and default JSON output.
- Map add-on extraction payloads into the existing Spec 007 Go contract structs.
- Preserve current minimal active-tab fallback when extraction is unavailable.
- Add CLI command parsing tests for all required commands and flags.

### Task 2: Add Add-On Context Command

- Add `GET_CONTEXT` command enum value.
- Route `GET_CONTEXT` in `firefox-addon/src/handler.ts`.
- Add `firefox-addon/src/services/context.ts`.
- Parse JSON `args` defensively.
- Return structured data and `Response.end()` consistently.
- Handle invalid request shape as structured context error payload, not unstructured logs only.

### Task 3: Permission And Page Support Checks

- Add active tab lookup using existing browser APIs.
- Add URL support classifier shared by extraction modes.
- Add access checks before script injection.
- Add structured permission/capability payloads that distinguish tab metadata from DOM/page access.
- Update `manifest.json` only if needed for `activeTab`.
- Document exact manifest change in this spec's progress log.

### Task 4: Text And Selection Extraction

- Implement injected extraction for readable text.
- Implement selection extraction and focused-input fallback.
- Add truncation helper for extracted text and selection.
- Add warnings for missing permission, no selection, empty content, truncation, and unsupported page.

### Task 5: Metadata And Links Extraction

- Extract language, canonical URL, Open Graph, headings, JSON-LD, links, and images.
- Parse JSON-LD best-effort.
- Add raw and summary JSON-LD fields.
- Enforce metadata, link, image, heading, and JSON-LD limits.
- Add malformed JSON-LD warning tests.

### Task 6: Sanitized HTML And Markdown

- Implement sanitizer or keep `html_sanitizer_missing` until sanitizer is ready.
- Implement Markdown conversion from sanitized/readable DOM.
- Add quality-focused fixtures for headings, lists, links, code blocks, tables, hidden text, and scripts/styles.
- Ask before adding a production dependency for sanitization or Markdown conversion.

### Task 7: Integration And Regression Validation

- Run Go tests and build.
- Run add-on typecheck/build/test.
- Run existing Raycast tests/lint/build if any Raycast temporary helper is touched.
- Manually verify against Zen pages listed below.
- Update this spec's progress log with any permission/native-message decisions.

## Tests

### CLI Tests

Add or update tests for:

- command parsing for `context active --format text`;
- command parsing for `context active --format html`;
- command parsing for `context active --format markdown`;
- command parsing for `context active --selector "main"`;
- command parsing for `context selection`;
- command parsing for `context metadata`;
- command parsing for `context links`;
- invalid format returns structured `invalid_format`;
- selector extraction request is sent as a structured value;
- global `--max-bytes` is propagated;
- add-on payload maps to `zen.context`;
- add-on structured errors map to `zen.context.error`;
- text/Markdown/HTML/selection truncation metadata;
- privileged page mapping;
- permission-denied mapping.

### Add-On Tests

Add add-on tests if feasible with current tooling. Prefer pure tests around extraction helpers and request parsing.

Test:

- context request parsing;
- unsupported URL classification;
- invalid selector handling;
- no-match selector handling with `selector_no_match`;
- multiple-match selector warning;
- text extraction from simple DOM fixture;
- selection extraction fixture;
- metadata extraction fixture with Open Graph and JSON-LD;
- malformed JSON-LD warning;
- link extraction and max-link truncation;
- sanitizer removes scripts, event handlers, and `javascript:` URLs;
- Markdown converter omits hidden/script/style content and preserves basic structure.

If browser API mocking is too expensive for this spec, document the gap and cover pure helpers plus manual Zen verification.

### Regression Tests

Existing behavior that must remain unchanged:

- `tabs get`;
- tab switch/update/close/duplicate/new;
- groups get/update/move;
- bookmarks list/create/update/delete;
- history search/delete;
- profiles update;
- windows get;
- Raycast commands that consume those CLI features.

## Manual Verification

Run against a locally installed Zen profile with the Mozeidon add-on installed.

Required pages:

1. Normal article/documentation page.
2. Privileged/internal page such as `about:config`.
3. Blank page, including `about:blank` if available.
4. Page with selected text.
5. Page with selected text inside an input or textarea.
6. Page with Open Graph tags.
7. Page with valid and malformed JSON-LD.
8. Page with many links.
9. Page with scripts/styles/hidden content.
10. Page where selector matches one element.
11. Page where selector matches multiple elements.
12. Page where selector matches no elements.

Commands:

```text
mozeidon context active --format text
mozeidon context active --format markdown
mozeidon context active --format html
mozeidon context active --selector "main"
mozeidon context active --selector ".does-not-exist"
mozeidon context selection
mozeidon context metadata
mozeidon context links
```

Verify:

- each command emits one valid JSON object;
- output matches `kind`, `version`, `ok`, `status`, `source`, `capturedAt`, and contract fields;
- without host permission, active text/Markdown may include title+URL fallback, but it must be marked as `extraction.contentSource: "tab-metadata"` and `extraction.domRead: false`;
- without host permission, selection, metadata, and links must be unavailable/permission-gated rather than empty successful reads;
- warnings appear for truncation, unavailable permissions, unsupported pages, selector no-match, malformed JSON-LD, and degraded extraction;
- privileged pages do not expose DOM or browser chrome content;
- no broad permission prompt appears unless explicitly documented;
- existing tabs/bookmarks/history commands still work.

### Narrow Host-Permission Verification

To verify real DOM extraction locally without committing broad permissions:

1. Temporarily add only the test origin to `firefox-addon/manifest.json`, for example `https://en.wikipedia.org/*`.
2. Run `npm run build` from `firefox-addon/`.
3. Reload the temporary add-on in Zen.
4. Open `https://en.wikipedia.org/wiki/Raycast_(software)` and select the first paragraph.
5. Run the context commands above.
6. Confirm text, selection, metadata, and links report `extraction.domRead: true` and real page-derived fields.
7. Revert the temporary manifest permission before committing.

The committed default must not include `<all_urls>` or this Wikipedia host permission.

## Build And Validation Commands

CLI:

```text
cd cli
GOCACHE=/tmp/mozeidon-go-build go test ./...
GOCACHE=/tmp/mozeidon-go-build go build ./...
```

Firefox add-on:

```text
cd firefox-addon
npm test
npm run build
```

If `npm test` does not exist for the add-on, run the closest available typecheck/build command and document the exact limitation.

Raycast, only if touched:

```text
cd raycast
npm test
npm run lint
npm run build
```

## Risks

- `activeTab` may not be reliable for Raycast-triggered CLI extraction.
- Adding host permissions would improve reliability but increases privacy scope and must not happen without explicit approval.
- Sanitized HTML is security-sensitive and should not ship without sanitizer tests.
- Markdown conversion can produce misleading context if hidden/script/style content is not removed.
- Large page outputs may stress the current native-message transport.
- Add-on test infrastructure may need small setup work before handler tests are practical.
- Unsupported privileged pages vary across Firefox/Zen versions and need manual verification.

## Dependencies

- Spec 007 contract must remain the source of truth.
- Existing CLI context command group from Spec 007.
- Existing Mozeidon profile and native-message connection.
- Firefox add-on APIs for active tabs and script execution.
- Any new production dependency for sanitization or Markdown conversion requires explicit explanation and approval before implementation.

## Acceptance Criteria

- Required context commands return valid JSON matching Spec 007.
- `--format text` populates `content.text` when permission and page support allow.
- `--format markdown` populates `content.markdown` when permission and page support allow.
- `--format html` either returns sanitized `content.html` with tests or structured `html_sanitizer_missing`.
- `context selection` returns selected content or explicit no-selection warning/error.
- `context metadata` returns metadata fields where available and warnings where degraded.
- `context links` returns links where available and truncation warnings where limited.
- Privileged pages do not expose privileged DOM and return structured warnings/errors.
- Permission-denied cases return structured JSON, not crashes.
- Existing tabs/bookmarks/history behavior remains unchanged.
- Go tests and build pass.
- Add-on build passes.
- Add-on tests pass where test infrastructure exists, or gaps are documented.
- Raycast lint/build/tests pass if Raycast is touched.

## Manual 7.2 Decisions

Manual verification against a Wikipedia page without host permission showed that the V1 fallback path was structurally valid but too easy for consumers to misread as successful page extraction.

Decisions:

- Title and URL fallback is tab metadata, not page-content extraction.
- Fallback content must expose `extraction.contentSource: "tab-metadata"` and `extraction.domRead: false`.
- Real DOM extraction must expose `extraction.domRead: true` and an appropriate `contentSource` such as `"document"`, `"selector"`, `"selection"`, or `"focused-input"`.
- Permission reporting should distinguish tab metadata availability from DOM access. V1 payloads should prefer:
  - `permissions.canReadTabMetadata`
  - `permissions.hasDomAccess`
  - `permissions.hasActiveTabGrant`
  - `permissions.hasHostPermission`
  - `permissions.canReadPageContent`
  - `permissions.canReadSelection`
- `permissions.canReadActiveTab` is legacy and should not be treated as DOM access. V1 should set it to `false` in permission-denied DOM paths and use `canReadTabMetadata` for tab identity availability.
- If DOM permission is missing, `context selection` must not report a definite `isCollapsed: true` / `source: "none"` selection state. Omit `content.selection` and report `permission_unavailable`.
- If DOM permission is missing, `context metadata` and `context links` must not return empty arrays/objects as if extraction succeeded. Omit those extracted fields and report `permission_unavailable`.
- Empty metadata/link arrays mean the page was actually read and none were found.
- `--format html` remains disabled with `html_sanitizer_missing` until sanitizer support is implemented and tested.
- A local verification build may temporarily add a narrow host permission such as `https://en.wikipedia.org/*`, but committed defaults must not add broad host permissions.
- `--require-content` is needed by future Raycast summarization flows; it is documented as an immediate follow-up unless added in this spec.

## Open Questions

- Is `activeTab` plus a browser-action/manual-grant flow acceptable for the first usable implementation, knowing Raycast-pulled context may need later onboarding?
- Does the current native-message transport reliably carry near-1 MB JSON payloads, or should V1 lower `maxBytes` before proposing transport changes?
- Should sanitized HTML ship in the same implementation as text/Markdown/selection, or remain `html_sanitizer_missing` until a sanitizer dependency is reviewed?
- Is a lightweight local Markdown converter sufficient for V1, or should implementation propose an audited dependency?
- Should `--require-content` be implemented on the CLI context commands before the first Raycast summarization command, or should it land with the Raycast command that needs it?

## Progress Log

- 2026-04-28: Created implementation spec from approved Spec 007 contract. No code implemented.
- 2026-04-28: Added CLI context extraction request/payload mapping over the existing `Command{command,args}` transport.
- 2026-04-28: Added Firefox add-on `get-context` command and context extraction service using active-tab script execution when the browser permits it.
- 2026-04-28: Kept native messenger protocol unchanged by encoding the context request as JSON in the existing `args` string.
- 2026-04-28: Kept browser add-on permissions unchanged; no `<all_urls>`, host permissions, or `activeTab` manifest permission were added in this implementation.
- 2026-04-28: Kept `--format html` as structured `html_sanitizer_missing`; sanitized HTML extraction remains a follow-up.
- 2026-04-28: Added Go tests for context command flags, request construction, extraction payload mapping, truncation, unsupported pages, and existing contract behavior.
- 2026-04-28: Fixed V1 add-on extraction to honor global `maxBytes` for extracted content, skip malformed page-derived link/image URLs without aborting extraction, and warn that Markdown is plain-text-derived until richer conversion ships.
- 2026-04-28: Fixed add-on profile registration reuse so temporary add-on reconnects do not rotate `profileId` on every native-app reconnect.
- 2026-04-28: Updated V1 semantics from manual 7.2 verification: tab metadata fallback is explicitly marked as non-DOM, permission-denied selection/metadata/links are unavailable instead of empty successful reads, and permission fields distinguish tab metadata from DOM access.
- 2026-04-28: Addressed PR review gaps in the add-on extraction path: malformed context requests now return stable structured errors, selectors are rejected outside `context active`, metadata item/JSON-LD caps report truncation, and string truncation no longer uses quadratic byte checks.
