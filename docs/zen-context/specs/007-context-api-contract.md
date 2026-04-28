# Spec 007: Zen Context API Contract

## Summary

Define a typed Mozeidon context API contract for the current active Zen tab and page context. The contract should replicate the useful parts of Raycast's `{browser-tab}` placeholder for Zen Browser, while remaining a native Mozeidon surface that does not spoof Raycast private browser-extension internals.

This spec defines CLI shapes, JSON response semantics, output formats, error behavior, size limits, selector behavior, selection fallback behavior, permission expectations, and compatibility requirements for future Raycast commands, AI Extension tools, and an optional MCP wrapper.

## Status

- Implemented
- Minimal first implementation covers active tab/page identity and structured capability reporting.
- DOM extraction, selectors, selection, metadata, links, and sanitized HTML remain permission-gated follow-up work.

## Milestone

M2: Zen Context V1

## Problem

Raycast's `{browser-tab}` placeholder is useful because it gives commands and AI workflows quick access to the active browser page. Zen Browser users need the same practical workflow, but this fork should not depend on or imitate Raycast private browser integration internals.

Mozeidon needs a stable, typed context contract that can be consumed by:

- Raycast commands and copy actions;
- future Raycast AI Extension tools for `@zen`;
- a later MCP wrapper;
- tests, fixtures, and downstream scripts.

The contract must be explicit enough to implement safely, without mixing current-tab extraction with later multi-tab context, site adapters, or local browsing memory.

## Goals

- Define a stable JSON context object for the active Zen tab/page.
- Define CLI command shapes for active page context, selection, metadata, and links.
- Define `markdown`, `text`, `html`, and `json` output semantics.
- Define selector-based extraction behavior for current-page content.
- Define selection fallback behavior.
- Define error codes and failure behavior.
- Define size limits and truncation semantics.
- Define permission and capability reporting.
- Keep current-tab extraction separate from multi-tab context and site adapters.
- Avoid Raycast `{browser-tab}` spoofing.
- Make the contract suitable for future Raycast commands, AI Extension tools, and MCP tools.

## Non-Goals

- No page-content extraction implementation in this spec.
- No browser permission changes in this spec.
- No native messenger changes in this spec.
- No site adapter registry or site-specific extraction.
- No multi-tab context API.
- No local browsing memory or embeddings.
- No mutating browser actions.
- No network transmission.
- No raw/plain stdout output mode in the first release.
- No raw or unsafe HTML output mode.
- No attempt to register or masquerade as Raycast's browser-tab placeholder.
- No guarantee that every field can be populated before the implementation specs for CLI/add-on extraction are written.

## Scope

Primary implementation scope is the CLI context contract.

Implemented areas:

- `cli/` context command group.
- CLI context contract types and tests.
- Active tab/page identity derived from existing tab/window capabilities.
- Structured JSON capability and permission reporting for unavailable DOM extraction.

Future implementation areas, not changed by this spec:

- Firefox-family add-on for active page, selection, DOM, and metadata extraction.
- Raycast extension for copy/context commands.
- Future AI Extension and MCP wrapper surfaces.
- Test fixtures for context output.

Out of scope for this spec:

- `chrome-addon/` implementation details.
- Native messenger protocol changes unless a later implementation spec proves they are required.
- New browser permissions.
- Raycast command UI implementation.
- MCP implementation.

## User Workflow

### Copy Active Page Context

1. User invokes a future Raycast command or action for the active Zen page.
2. Raycast calls Mozeidon through the safe CLI wrapper.
3. Mozeidon returns active page context in the requested format.
4. Raycast copies or inserts the context.

### Use Page Context In AI

1. User invokes a future `@zen` AI Extension tool.
2. The tool calls the same Mozeidon context API.
3. The tool receives structured JSON with the requested content representation populated.
4. The AI workflow can cite the source URL/title and understand warnings, truncation, and permissions.

### Extract A Specific Region

1. User or command passes `--selector "main article"`.
2. Mozeidon attempts to extract only the matching DOM region from the active page.
3. If the selector matches, content fields represent that region and warnings document selector behavior.
4. If the selector is valid but matches nothing, Mozeidon returns structured JSON with `ok: true`, `status: "empty"`, and warning `selector_no_match`.
5. If the selector syntax is invalid or unsupported, Mozeidon returns a non-zero structured error.

### Use Current Selection

1. User selects text in Zen.
2. User invokes a future selection command.
3. Mozeidon returns the selected text and page identity.
4. If no selection is available, behavior follows the selection fallback rules in this spec.

## Proposed Design

Add a future `context` CLI command group as the stable contract surface.

Required command shapes to design for:

```text
mozeidon context active
mozeidon context active --format markdown
mozeidon context active --format text
mozeidon context active --format html
mozeidon context active --format json
mozeidon context active --selector "..."
mozeidon context selection
mozeidon context metadata
mozeidon context links
```

All `context` commands default to JSON. JSON is the only first-release output mode for this contract.

`--format` selects which representation should be populated inside the structured context object. It does not switch the CLI to raw/plain output in the first release. For example, `mozeidon context active --format text` should return JSON with `content.text`, not unstructured plain text on stdout.

Raw/plain output can be added later behind an explicit flag such as `--output raw` or `--plain`, but that is out of scope for the first context contract.

### Command Responsibilities

`context active`

- Returns the active tab/page context.
- May include page content when the implementation has the capability and permission.
- Supports `--format`.
- Supports `--selector`.
- Returns warnings for unavailable optional extraction fields.

`context selection`

- Returns active tab/page identity plus current selection content.
- Does not infer or scrape arbitrary page content unless selection fallback rules explicitly allow it.

`context metadata`

- Returns active tab/page identity plus page metadata.
- Includes Open Graph, JSON-LD, headings, links, images, and document language where available.
- Should be cheaper and smaller than full page content extraction.

`context links`

- Returns active tab/page identity plus extracted links.
- Designed for link-focused workflows without requiring full content extraction.

### Data Flow

1. CLI receives `context` command and options.
2. CLI applies profile targeting using the existing `--profile-id` convention.
3. CLI asks Mozeidon/add-on for active Zen tab and requested extraction.
4. Add-on returns page identity, capabilities, extracted content, metadata, warnings, and size/truncation details.
5. CLI normalizes this into the stable JSON contract.
6. CLI returns structured JSON with the requested content representation populated.

### Separation From Later Work

This spec covers one active page at one capture time.

It does not define:

- multiple open tabs in one context object;
- context for tab groups or windows beyond identifying the active source;
- adapter-specific fields;
- site-specific cleanups;
- cross-page memory;
- semantic search;
- MCP resource schema.

Those should be later specs that consume this contract rather than changing its core semantics.

## API Or Contract

### Versioning

Every JSON response must include:

- `kind`;
- `version`;
- `ok`;
- `status`;
- `source`;
- `capturedAt`.

Proposed values:

```json
{
  "kind": "zen.context",
  "version": 1,
  "ok": true,
  "status": "ok"
}
```

Compatibility rules:

- Add optional fields without changing `version`.
- Do not rename or repurpose existing fields without a new major `version`.
- Consumers must ignore unknown fields.
- Producers must keep field types stable.
- Field absence must mean unavailable, not false.
- Explicit `null` may be used only when the field is known to be empty or intentionally not present in the page.

Status rules:

- `ok: true`, `status: "ok"` means the requested context was captured.
- `ok: true`, `status: "empty"` means the command ran successfully but the requested subset was empty, such as a valid selector with no matches.
- `ok: true`, `status: "partial"` means context was captured with meaningful omissions, truncation, or degraded optional extraction.
- `ok: false`, `status: "error"` means the command failed and should include a typed error code.

### Canonical JSON Shape

The following TypeScript-like shape is the target contract. Exact implementation types may live in CLI/add-on/Raycast packages later, but must preserve these semantics.

```ts
type ZenContext = {
  kind: "zen.context";
  version: 1;
  ok: true;
  status: "ok" | "empty" | "partial";
  source: ZenContextSource;
  capturedAt: string;
  browser: ZenBrowserInfo;
  profile?: ZenProfileInfo;
  window: ZenWindowInfo;
  tab: ZenTabInfo;
  container?: ZenContainerInfo;
  page: ZenPageInfo;
  content?: ZenContentInfo;
  metadata?: ZenMetadataInfo;
  extraction: ZenExtractionInfo;
  permissions: ZenPermissionInfo;
  capabilities: ZenCapabilityInfo;
};

type ZenContextError = {
  kind: "zen.context.error";
  version: 1;
  ok: false;
  status: "error";
  code: ZenContextErrorCode;
  message: string;
  source: Pick<ZenContextSource, "provider" | "command"> &
    Partial<Pick<ZenContextSource, "format" | "output">>;
  capturedAt: string;
  details?: Record<string, unknown>;
};

type ZenContextErrorCode =
  | "mozeidon_not_found"
  | "profile_not_found"
  | "browser_not_running"
  | "addon_unavailable"
  | "native_messaging_unavailable"
  | "no_active_window"
  | "no_active_tab"
  | "unsupported_page"
  | "permission_denied"
  | "selector_invalid"
  | "selector_unsupported"
  | "selection_unavailable"
  | "content_unavailable"
  | "extraction_timeout"
  | "html_sanitizer_missing"
  | "invalid_format"
  | "output_too_large"
  | "internal_error";

type ZenContextSource = {
  provider: "mozeidon";
  command:
    | "context active"
    | "context selection"
    | "context metadata"
    | "context links";
  format: "json" | "markdown" | "text" | "html";
  output: "json";
  profileId?: string;
  profileAlias?: string;
};

type ZenBrowserInfo = {
  name: "Zen Browser";
  appId?: string;
  version?: string;
};

type ZenProfileInfo = {
  id?: string;
  alias?: string;
  name?: string;
  path?: string;
};

type ZenWindowInfo = {
  id: number;
  focused?: boolean;
  lastFocused?: boolean;
};

type ZenTabInfo = {
  id: number;
  windowId: number;
  active: boolean;
  pinned?: boolean;
  index?: number;
  lastAccessed?: number;
  groupId?: number;
};

type ZenContainerInfo = {
  id?: string;
  name?: string;
  icon?: string;
  color?: string;
};

type ZenPageInfo = {
  url: string;
  title: string;
  domain: string;
  favicon?: string;
  language?: string;
  canonicalUrl?: string;
  referrer?: string;
};

type ZenContentInfo = {
  text?: ZenTextContent;
  html?: ZenHtmlContent;
  markdown?: ZenMarkdownContent;
  selection?: ZenSelectionContent;
};

type ZenTextContent = {
  value: string;
  length: number;
  truncated: boolean;
};

type ZenHtmlContent = {
  value: string;
  length: number;
  truncated: boolean;
  sanitized: boolean;
};

type ZenMarkdownContent = {
  value: string;
  length: number;
  truncated: boolean;
};

type ZenSelectionContent = {
  text?: string;
  html?: string;
  markdown?: string;
  isCollapsed: boolean;
  length: number;
  source: "user-selection" | "focused-input" | "none";
  truncated: boolean;
};

type ZenMetadataInfo = {
  openGraph?: Record<string, string | string[]>;
  jsonLd?: ZenJsonLdInfo;
  headings?: ZenHeading[];
  links?: ZenLink[];
  images?: ZenImage[];
};

type ZenJsonLdInfo = {
  raw?: unknown[];
  summary?: ZenJsonLdSummary[];
  truncated: boolean;
};

type ZenJsonLdSummary = {
  type?: string | string[];
  name?: string;
  headline?: string;
  description?: string;
  url?: string;
};

type ZenHeading = {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  id?: string;
};

type ZenLink = {
  text: string;
  href: string;
  title?: string;
  rel?: string[];
  target?: string;
  kind?: "anchor" | "canonical" | "stylesheet" | "feed" | "other";
};

type ZenImage = {
  src: string;
  alt?: string;
  title?: string;
  width?: number;
  height?: number;
};

type ZenExtractionInfo = {
  mode: "active" | "selection" | "metadata" | "links";
  selector?: string;
  selectorMatched?: boolean;
  selectorMatchCount?: number;
  contentSource?: "document" | "selector" | "selection" | "focused-input" | "tab-metadata";
  domRead: boolean;
  warnings: ZenExtractionWarning[];
  limits: ZenExtractionLimits;
  truncation: ZenTruncationInfo;
};

type ZenExtractionWarning = {
  code:
    | "permission_unavailable"
    | "content_unavailable"
    | "selection_unavailable"
    | "json_ld_malformed"
    | "selector_no_match"
    | "selector_multiple_matches"
    | "content_truncated"
    | "metadata_truncated"
    | "unsupported_page"
    | "timed_out";
  message: string;
  field?: string;
};

type ZenExtractionLimits = {
  maxBytes: number;
  maxTextBytes: number;
  maxHtmlBytes: number;
  maxMarkdownBytes: number;
  maxLinks: number;
  maxImages: number;
  maxJsonLdBytes: number;
};

type ZenTruncationInfo = {
  truncated: boolean;
  fields: string[];
};

type ZenPermissionInfo = {
  canReadTabMetadata: boolean;
  hasDomAccess: boolean;
  hasActiveTabGrant: boolean;
  hasHostPermission: boolean;
  /** Legacy compatibility field; consumers should not treat this as DOM access. */
  canReadActiveTab: boolean;
  canReadSelection: boolean;
  canReadPageContent: boolean;
  canReadMetadata: boolean;
  canReadLinks: boolean;
  requiresHostPermission?: boolean;
  missing?: string[];
};

type ZenCapabilityInfo = {
  activeTab: "available" | "unavailable";
  selection: "available" | "unavailable" | "unknown";
  pageContent: "available" | "permission-required" | "unavailable";
  metadata: "available" | "permission-required" | "unavailable";
  links: "available" | "permission-required" | "unavailable";
};
```

### Example JSON

```json
{
  "kind": "zen.context",
  "version": 1,
  "ok": true,
  "status": "ok",
  "source": {
    "provider": "mozeidon",
    "command": "context active",
    "format": "json",
    "output": "json",
    "profileId": "Zen"
  },
  "capturedAt": "2026-04-28T09:45:00.000Z",
  "browser": {
    "name": "Zen Browser",
    "appId": "app.zen-browser.zen"
  },
  "profile": {
    "id": "Zen"
  },
  "window": {
    "id": 456,
    "focused": true,
    "lastFocused": true
  },
  "tab": {
    "id": 123,
    "windowId": 456,
    "active": true,
    "pinned": false,
    "index": 3
  },
  "page": {
    "url": "https://example.com/page",
    "title": "Example Page",
    "domain": "example.com",
    "favicon": "https://example.com/favicon.ico",
    "language": "en",
    "canonicalUrl": "https://example.com/page"
  },
  "content": {
    "markdown": {
      "value": "# Example Page\n\nPage text...",
      "length": 29,
      "truncated": false
    },
    "selection": {
      "text": "selected words",
      "isCollapsed": false,
      "length": 14,
      "source": "user-selection",
      "truncated": false
    }
  },
  "metadata": {
    "openGraph": {
      "og:title": "Example Page"
    },
    "jsonLd": {
      "raw": [],
      "summary": [],
      "truncated": false
    },
    "headings": [
      {
        "level": 1,
        "text": "Example Page"
      }
    ],
    "links": [
      {
        "text": "Docs",
        "href": "https://example.com/docs",
        "kind": "anchor"
      }
    ],
    "images": []
  },
  "extraction": {
    "mode": "active",
    "contentSource": "document",
    "warnings": [],
    "limits": {
      "maxBytes": 1000000,
      "maxTextBytes": 50000,
      "maxHtmlBytes": 250000,
      "maxMarkdownBytes": 50000,
      "maxLinks": 500,
      "maxImages": 200,
      "maxJsonLdBytes": 100000
    },
    "truncation": {
      "truncated": false,
      "fields": []
    }
  },
  "permissions": {
    "canReadActiveTab": true,
    "canReadSelection": true,
    "canReadPageContent": true,
    "canReadMetadata": true,
    "canReadLinks": true
  },
  "capabilities": {
    "activeTab": "available",
    "selection": "available",
    "pageContent": "available",
    "metadata": "available",
    "links": "available"
  }
}
```

### Format Semantics

All first-release `--format` variants return structured JSON on stdout. `--format` controls the requested representation inside `content`, `metadata`, and `source.format`; it does not control stdout encoding.

`--format json`

- Emits the canonical JSON object.
- Must be stable for programmatic consumers.
- Must include warnings and capability information.
- Is the default for all `context` commands.

`--format markdown`

- Emits the canonical JSON object with Markdown content populated under `content.markdown` where available.
- Should be optimized for AI prompts and clipboard use, with readable structure over perfect visual fidelity.
- The JSON object must include at least title and URL.
- Should include selected or extracted page content if available.
- Should include a compact warning block if extraction was incomplete.
- Must not include raw unsanitized HTML.
- Must not execute page scripts, fetch resources, or mutate the document.
- Must not invent content that is not present in the tab, selected range, or extraction metadata.
- Must omit scripts, styles, hidden template content, active controls, and extension/browser chrome markup.
- Should preserve headings, paragraphs, lists, block quotes, code blocks, tables, and links where practical.
- Links should preserve visible text and absolute target URLs where available.
- Images should be represented only when useful, normally as Markdown image syntax with `alt` text and resolved source URL; image bytes must not be fetched.
- Whitespace should be normalized enough for prompt readability without collapsing meaningful code or preformatted text.
- If conversion quality is degraded, add a warning such as `content_unavailable`, `permission_unavailable`, `unsupported_page`, or a future `markdown_degraded` warning rather than silently returning misleading content.
- A future raw Markdown output mode may use a shape like this, but raw output is out of scope for the first release:

```markdown
# Example Page

Source: https://example.com/page
Captured: 2026-04-28T09:45:00.000Z

Page text or selected text...

Warnings:

- Content was truncated at 50000 bytes.
```

`--format text`

- Emits the canonical JSON object with plain text populated under `content.text` where available.
- `content.text.value` should include readable content with no Markdown headings or HTML tags.
- The JSON object should still include page title, URL, warnings, limits, permissions, and capabilities.
- Raw plain stdout can be added later behind `--output raw` or `--plain`.

`--format html`

- Reserves sanitized HTML under `content.html`.
- Means sanitized HTML, not raw `outerHTML`.
- Scope depends on the command:
  - `context active --format html` without `--selector` represents sanitized active document content, preferably readable body/main content rather than browser UI or full serialized document chrome.
  - `context active --format html --selector "..."` represents the sanitized matched element subtree.
  - `context selection --format html` represents the sanitized selected range HTML when available.
  - `context metadata` and `context links` should not populate `content.html` unless a later spec explicitly adds an HTML summary representation.
- The selected scope must be reported through `extraction.contentSource` as `"document"`, `"selector"`, `"selection"`, or `"focused-input"`.
- Must not include executable scripts, event handlers, external resource injection, or privileged extension markup.
- Should include source metadata in comments or simple non-executable elements only if useful.
- Must not return success before sanitizer behavior is implemented and tested.
- Until sanitizer support exists, `--format html` should return a structured capability error such as `html_sanitizer_missing`.
- A future explicit `raw-html` or `--unsafe-raw-html` debug mode can be considered later, but it is out of scope for the first context implementation.

### Selector Behavior

`--selector` applies only to `context active` in this contract.

Rules:

- Selector syntax should follow standard CSS selector semantics where possible.
- Selector input is user-derived and must be passed as a CLI argument array element, never interpolated into shell strings.
- Selector evaluation happens against the active page DOM at capture time.
- If one element matches, content and metadata should be scoped to that element where practical.
- If multiple elements match, the first implementation should use the first match and add `selector_multiple_matches` unless a later spec defines multi-match behavior.
- Valid selector with a match: exit `0`, `ok: true`, `status: "ok"`.
- Valid selector with no match: exit `0`, `ok: true`, `status: "empty"`, `selectorMatched: false`, and warning `selector_no_match`.
- Invalid selector syntax: non-zero exit, preferably `2`, `ok: false`, error `selector_invalid`.
- Unsupported selector mode: non-zero exit, preferably `2`, `ok: false`, error `selector_unsupported`.
- Permission, restricted page, and transport failures: non-zero exit with structured JSON when possible.
- Do not silently fall back from a selector request to full-page extraction unless a later spec adds an explicit fallback option.
- Invalid selectors must not crash extraction.
- Selectors must not cross browser/extension privilege boundaries.
- Selectors must not allow script execution.

Selector metadata fields:

- `extraction.selector`
- `extraction.selectorMatched`
- `extraction.selectorMatchCount`
- `extraction.contentSource: "selector"`

### Selection Fallback Behavior

`context selection` should prefer real user selection.

Fallback order:

1. Selected text/HTML from the active document.
2. Selected text from the focused input or textarea, if available.
3. Empty selection response with `selection_unavailable`.

Rules:

- Do not silently fall back to full-page content for `context selection`.
- If no selection exists, return page identity plus `content.selection.source: "none"` and a warning, or return a typed no-selection error. The implementation spec must choose one behavior.
- If selection HTML is unavailable, return text when possible and add a warning only if the caller requested HTML.
- Selection is sensitive and should be truncated independently from page content.

### Privileged And Unsupported Pages

Mozeidon must distinguish active tab identity from DOM/page-content extraction.

Active tab identity may still be returned for privileged or unsupported pages when the existing tab API exposes URL/title/window information. DOM extraction must not be attempted on pages where the browser denies or should deny extension script access.

Privileged or unsupported page classes include:

- browser UI and internal pages such as `about:`, `chrome:`, `resource:`, and equivalent Zen/Firefox internal schemes;
- extension pages such as `moz-extension:` and other browser-extension origins;
- reader, view-source, PDF, file, data, blob, or sandboxed pages when the add-on lacks a safe tested extraction path;
- any page where `tabs.executeScript` or a later content-extraction primitive is denied by the browser;
- any page where extracting content would cross a browser, extension, container, or privilege boundary.

Rules:

- `context active --format json` should return active tab identity when available, with capabilities showing page content as unavailable when the page is unsupported.
- `context active --format text` and `--format markdown` may return title/URL-only structured content for unsupported pages, but must add `unsupported_page` if page content extraction was expected or attempted.
- `context active --selector "..."` must not fall back to full-page or title/URL extraction on unsupported pages. It should return a structured non-zero `unsupported_page` error when the active page cannot support selector extraction.
- `context selection`, `context metadata`, and `context links` should return structured `unsupported_page` or a partial context with `unsupported_page` warning, depending on whether active tab identity is still useful to the caller.
- Unsupported-page responses must not expose privileged DOM, browser chrome markup, extension internals, or hidden browser UI state.
- Unsupported-page behavior must be visible through `extraction.warnings`, `permissions`, and `capabilities`; it must not silently return empty content as if the page had no data.

### Metadata Semantics

`context metadata` should prioritize stable page metadata:

- URL/title/domain/favicon/language.
- Canonical URL.
- Open Graph tags.
- JSON-LD script payloads.
- Headings.
- Links.
- Images.

Metadata extraction must be best-effort. Missing metadata is not an error unless the active tab itself cannot be identified.

JSON-LD must use separate raw and summary fields:

- `metadata.jsonLd.raw`: parsed JSON-LD values as close to the page-provided structure as size limits allow.
- `metadata.jsonLd.summary`: best-effort normalized summaries for common fields such as type, name, headline, description, and URL.

Malformed JSON-LD must not fail the whole command. It should add `json_ld_malformed` and continue with other metadata. Both raw and summary data must respect configured size limits and report truncation when needed.

### Links Semantics

`context links` returns link metadata for the active page.

Rules:

- Include resolved absolute URLs where possible.
- Preserve visible link text.
- Include `rel`, `target`, and title attributes when available.
- Cap output at `limits.maxLinks`.
- Add `metadata_truncated` if links are truncated.
- Do not follow links or make network requests.

## Error Behavior

Errors should be typed and stable. CLI implementations may return non-zero exit codes for hard failures, but JSON error output should be available for programmatic consumers where practical.

Proposed error shape:

```json
{
  "kind": "zen.context.error",
  "version": 1,
  "ok": false,
  "status": "error",
  "code": "no_active_tab",
  "message": "No active Zen tab is available.",
  "source": {
    "provider": "mozeidon",
    "command": "context active",
    "format": "json",
    "output": "json"
  },
  "capturedAt": "2026-04-28T09:45:00.000Z",
  "details": {
    "profileId": "Zen"
  }
}
```

Proposed error codes:

- `mozeidon_not_found`
- `profile_not_found`
- `browser_not_running`
- `addon_unavailable`
- `native_messaging_unavailable`
- `no_active_window`
- `no_active_tab`
- `unsupported_page`
- `permission_denied`
- `selector_invalid`
- `selector_unsupported`
- `selection_unavailable`
- `content_unavailable`
- `extraction_timeout`
- `html_sanitizer_missing`
- `invalid_format`
- `output_too_large`
- `internal_error`

Hard failure examples:

- CLI binary cannot communicate with native app.
- Zen is not running and active context cannot be derived.
- No active tab exists.
- Required permission is missing for the requested command.
- Selector syntax is invalid.
- Selector mode is unsupported.
- `--format html` is requested before sanitizer support exists.

Soft warning examples:

- Optional metadata is missing.
- Selection is unavailable in `context active`.
- Content was truncated.
- Some JSON-LD entries could not be parsed.
- Some images or links were omitted due to limits.
- A valid selector matched no elements, resulting in `ok: true`, `status: "empty"`, and `selector_no_match`.

Exit code guidance:

- `0`: success or empty structured result, even with warnings.
- `1`: command or extraction failure.
- `2`: invalid CLI usage or invalid options.
- `3`: permission/capability failure.
- `4`: no active context.

Selector-specific guidance:

- valid selector with match: exit `0`, `ok: true`, `status: "ok"`;
- valid selector with no match: exit `0`, `ok: true`, `status: "empty"`, warning `selector_no_match`;
- invalid selector syntax: exit `2`, `ok: false`, error `selector_invalid`;
- unsupported selector mode: exit `2`, `ok: false`, error `selector_unsupported`;
- permission, restricted page, and transport failures: non-zero exit with structured JSON when possible.

## Size Limits

The context API must set explicit limits to avoid enormous CLI output, Raycast UI freezes, AI prompt bloat, and MCP transport issues.

Recommended default limits:

- global JSON output target: 1 MB;
- text content: 50,000 bytes;
- markdown content: 50,000 bytes;
- HTML content: 250,000 bytes after sanitization;
- selection content: 50,000 bytes;
- links: 500;
- images: 200;
- headings: 200;
- JSON-LD: 100,000 bytes total serialized size;
- Open Graph: 100 fields;

Rules:

- Truncated fields must set `truncated: true`.
- Truncation must add `content_truncated` or `metadata_truncated`.
- Result JSON must report whether truncation happened at all.
- Result JSON must report which fields were truncated.
- Result JSON must report the configured limits.
- Truncation should happen at valid string boundaries.
- `--format text`, `--format markdown`, and `--format html` still return JSON and must indicate truncation through the same structured fields.
- Defaults should be conservative for Raycast.
- Define both global and per-field limits in the contract.
- The first implementation may expose only a global `--max-bytes` flag, but any generated `content.text`, `content.markdown`, or `content.html` field must still respect that global limit.
- `--max-bytes` is a target cap for the structured context payload. Until full global accounting exists, implementation specs may apply it first to generated content fields and must report configured limits in `extraction.limits`.
- Later flags may include:
  - `--max-text-bytes`;
  - `--max-markdown-bytes`;
  - `--max-html-bytes`;
  - `--max-links`;
  - `--max-images`.

Fallback rules:

- Title and URL fallback from tab metadata is not page-content extraction.
- Tab metadata fallback must report `extraction.contentSource: "tab-metadata"` and `extraction.domRead: false`.
- Real DOM extraction must report `extraction.domRead: true`.
- If DOM access is unavailable, selection, metadata, and links must be represented as unavailable through warnings/permissions/capabilities, not as empty successful reads.
- Empty metadata/link arrays mean the page was actually read and none were found.

## Permission Model

This spec does not authorize new browser permissions. It defines how the API should report permissions and capabilities.

The current Firefox-family add-on is Manifest V2. Its manifest currently has:

- `nativeMessaging`
- `tabs`
- `sessions`
- `bookmarks`
- `history`
- `tabGroups`
- `storage`

It does not currently have page-content permission.

Principles:

- Active tab identity can use existing tab capabilities if available.
- DOM extraction capabilities all share the same access class:
  - page text;
  - sanitized HTML;
  - selection text;
  - selection HTML;
  - metadata;
  - links and images.
- For Manifest V2, DOM extraction requires `tabs.executeScript` plus permission for the target URL, either through host permission or `activeTab`.
- Do not rely on `activeTab` alone for Raycast-triggered context extraction, because Raycast to CLI to native-message requests may not count as browser user actions.
- `activeTab` is useful for browser-action, context-menu, and extension-shortcut flows, but reliable Raycast-pulled context likely needs explicit host permission and onboarding.
- Missing optional permissions should degrade clearly with capabilities and warnings.
- A command that explicitly requests content requiring unavailable permission should fail clearly or return a context object with missing capability, depending on the implementation spec.
- No broad host permission should be added without a separate implementation and privacy spec.
- Do not add `<all_urls>` by default in this contract.
- Do not change permissions in this contract-only spec.

Permission reporting:

- `permissions.canReadActiveTab`
- `permissions.canReadTabMetadata`
- `permissions.hasDomAccess`
- `permissions.hasActiveTabGrant`
- `permissions.hasHostPermission`
- `permissions.canReadSelection`
- `permissions.canReadPageContent`
- `permissions.canReadMetadata`
- `permissions.canReadLinks`
- `permissions.requiresHostPermission`
- `permissions.missing`

Capability reporting:

- `capabilities.activeTab`
- `capabilities.selection`
- `capabilities.pageContent`
- `capabilities.metadata`
- `capabilities.links`

The API must distinguish:

- unavailable because permission is missing;
- unavailable because the page is unsupported;
- unavailable because extraction timed out;
- unavailable because the page simply lacks the requested data.

## Security And Privacy

Zen context can include sensitive URLs, titles, selected text, page content, metadata, and links.

### Local-First Behavior

- No context command should send data to network services.
- No links or images should be fetched.
- AI Extension and MCP clients may transmit context later, but that transmission is outside this CLI contract and must be user-visible in those specs.

### User-Derived Inputs

The following are user-derived and must be handled safely:

- `--selector` values;
- `--format` values;
- future limit flags;
- profile IDs or aliases.

They must be passed as argument array elements by callers. They must not be shell-interpolated.

### Page-Derived Inputs

The following are page-derived and untrusted:

- title;
- URL;
- favicon URL;
- language;
- page text;
- page HTML;
- Markdown conversion output;
- selection;
- Open Graph tags;
- JSON-LD;
- headings;
- links;
- images.

Consumers must treat these as untrusted strings. HTML output must be sanitized. Markdown output can contain prompt-injection content and should not be treated as instructions by AI tools without tool-level framing.

### Prompt Injection

Page content may contain instructions intended to manipulate AI tools. Future AI Extension and MCP specs must wrap content with clear source boundaries and should expose URL/title/capture metadata separately from user instructions.

### HTML Sanitization

`--format html` means sanitized HTML. It does not mean raw page `outerHTML`.

Do not allow `--format html` as a successful output before sanitizer behavior is implemented and tested. Until then, implementations should return structured JSON with `ok: false` and error code `html_sanitizer_missing`.

HTML output must remove or neutralize:

- `<script>` content;
- inline event handlers;
- `javascript:` URLs;
- privileged extension URLs;
- external resource injection when the formatted output is rendered in a privileged UI;
- forms or active controls if rendered in Raycast or another tool.

A future explicit `raw-html` or `--unsafe-raw-html` debug mode can be considered later, but it is out of scope for the first context implementation.

### Storage

The context API should not persist captured context by default.

If future tools cache context, they need a separate storage, retention, and deletion spec.

## Compatibility With Future Surfaces

### Raycast Commands

Raycast should consume the JSON contract and apply formatting locally where practical. Future commands can expose:

- copy active page as Markdown;
- copy active page as plain text;
- copy active page JSON;
- copy selection;
- copy metadata summary;
- copy links.

Raycast must not depend on private Raycast browser placeholder internals.

### AI Extension Tools

AI Extension tools should wrap this contract directly.

Recommended tools:

- `zen_context_active`;
- `zen_context_selection`;
- `zen_context_metadata`;
- `zen_context_links`.

Tools should default to read-only JSON. Mutating browser actions remain out of scope.

### MCP Wrapper

MCP should be a thin wrapper over the same contract.

Recommended future tools:

- `zen_context_active`;
- `zen_context_selection`;
- `zen_context_metadata`;
- `zen_context_links`.

MCP resources or tool results should include the same warnings, limits, permissions, and capabilities fields.

### Fixtures And Contract Tests

Future implementation should add sanitized fixtures for:

- active page with full content;
- active page with no content permission;
- selected text;
- no selection;
- metadata-only page;
- link-heavy page with truncation;
- selector match;
- selector no match;
- unsupported page.

## Alternatives Considered

### Spoof Raycast `{browser-tab}`

Rejected. This project should replicate the practical benefits of the placeholder, not impersonate Raycast internals or depend on private extension contracts.

### Raycast-Only Context Object

Rejected. Raycast is the near-term UX surface, but the contract should also serve AI Extension tools, tests, and MCP.

### Full Page Content By Default

Rejected. Full content extraction has permission, privacy, performance, and prompt-size costs. The contract allows content when available, but reports permissions, warnings, and limits explicitly.

### Site Adapters In V1

Rejected. Site adapters should build on the stable context object after active-page extraction is working.

### Multi-Tab Context In V1

Rejected. Multi-tab context is useful, but it needs its own selection, size, privacy, and UX rules.

## Test Plan

Implemented tests include:

- Go unit tests for JSON contract shape;
- Go unit tests for active-tab derivation;
- Go unit tests for structured format population;
- Go unit tests for permission/capability fields;
- Go unit tests for typed error output;
- Go unit tests for JSON-LD raw and summary field presence.

Future implementation specs should add:

- unit tests for selector behavior;
- unit tests for selection fallback behavior;
- unit tests for size limits and truncation warnings;
- Raycast lint/build if Raycast consumes the contract;
- CLI integration tests with sanitized add-on/native fixtures where possible;
- manual Zen verification on normal pages, internal pages, pages with selection, and pages with large content.

## Manual Verification

Future implementation should manually verify:

1. `mozeidon context active --format json` returns active Zen tab identity.
2. `mozeidon context active --format markdown` returns JSON with `content.markdown`, title, URL, and warnings.
3. `mozeidon context active --format text` returns JSON with readable `content.text`.
4. `mozeidon context active --format html` returns structured JSON with sanitized HTML when sanitizer support exists, or structured `html_sanitizer_missing` before sanitizer support exists.
5. `mozeidon context active --selector "main"` scopes extraction correctly.
6. Invalid selector behavior is clear and stable.
7. `mozeidon context selection` returns selected text.
8. No-selection behavior follows this contract.
9. `mozeidon context metadata` returns Open Graph, JSON-LD, headings, links, and images when present.
10. `mozeidon context links` returns links without fetching them.
11. Unsupported pages return typed errors or warnings.
12. Missing permissions are reported without crashes.
13. Output truncation is visible and does not break JSON.

## Rollout Plan

1. Accept this contract spec.
2. Implement minimal active-tab JSON using existing tab/window capabilities.
3. Create a follow-up implementation spec for page content and selection extraction, including permission review.
4. Expand structured format population after page content extraction and sanitizer tests exist.
5. Add Raycast copy actions over the context API.
6. Add AI Extension tools over the stable context API.
7. Add optional MCP wrapper after Raycast and AI Extension consumers prove the contract.
8. Add site adapters and multi-tab context in separate specs.

## Acceptance Criteria

- Contract is specific enough to implement.
- Required CLI command shapes are documented.
- Required JSON fields are documented.
- Format semantics are documented.
- Error behavior is documented.
- Size limits are documented.
- Selector behavior is documented.
- Selection fallback behavior is documented.
- Permission model is documented.
- Security risks are documented.
- Compatibility with future Raycast commands, AI Extension tools, and MCP is documented.
- Current-tab extraction is separated from multi-tab context and site adapters.
- Spec explicitly avoids Raycast `{browser-tab}` spoofing.

## Decisions

- All first-release `context` commands return structured JSON by default.
- `--format text`, `--format markdown`, and `--format html` populate structured content fields instead of switching stdout to raw output.
- Valid selectors with no match return `ok: true`, `status: "empty"`, and warning `selector_no_match`.
- Invalid selector syntax and unsupported selector modes return non-zero structured errors.
- Selector requests do not fall back to full-page extraction unless a later explicit fallback option is added.
- Current Manifest V2 DOM extraction requires `tabs.executeScript` plus target URL permission through host permission or `activeTab`.
- Raycast-pulled context should not rely on `activeTab` alone because CLI/native-message requests may not count as browser user actions.
- No `<all_urls>` permission is added by this contract.
- `--format html` is reserved for sanitized HTML and should return `html_sanitizer_missing` until sanitizer behavior is implemented and tested.
- The contract defines global and per-field limits; the first implementation may expose only `--max-bytes`.
- Metadata includes both `metadata.jsonLd.raw` and `metadata.jsonLd.summary`.
- Malformed JSON-LD adds a warning and does not fail the whole command.
- Privileged and unsupported pages may still return active tab identity, but DOM extraction must fail or degrade visibly with `unsupported_page`.
- Markdown output should favor readable, sanitized, source-faithful content over visual fidelity and must warn on degraded extraction.
- Sanitized HTML scope is command-dependent: full/readable document content, selector subtree, or selected range, with the scope reported in `extraction.contentSource`.
- Tab metadata fallback is marked with `contentSource: "tab-metadata"` and `domRead: false`; consumers must not treat title/URL fallback as page-content extraction.
- Permission fields distinguish tab metadata availability from DOM access. `canReadActiveTab` is retained only as a legacy compatibility field and must not be interpreted as page-content access.

## Progress Log

- 2026-04-28: Added `mozeidon context` CLI command group with `active`, `selection`, `metadata`, and `links` subcommands.
- 2026-04-28: Added typed Go contract structs and pure builders for `zen.context` and `zen.context.error`.
- 2026-04-28: Implemented minimal `context active` from existing tabs/windows data. It returns active tab/page identity, profile/source data, limits, truncation fields, and explicit permission/capability information.
- 2026-04-28: Kept DOM extraction, selector matching, selection text, metadata extraction, links extraction, and sanitized HTML disabled without changing add-on permissions. These surfaces return structured warnings or errors indicating permission/sanitizer requirements.
- 2026-04-28: Added Go tests for active-context shape, active-tab derivation, structured text population, JSON-LD metadata fields, structured errors, and format parsing.
- 2026-04-28: Tightened contract language for privileged pages, Markdown quality, HTML scope, warnings, and global content truncation.

## Open Questions

- Which exact onboarding UX should a later implementation use for explicit host permissions?
- Should raw output use `--output raw`, `--plain`, or a different flag name in a later CLI ergonomics spec?
