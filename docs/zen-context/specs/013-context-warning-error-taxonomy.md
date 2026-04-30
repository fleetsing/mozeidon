# Spec 013: Context Warning And Error Taxonomy Cleanup

## Summary

Define a precise warning, error, and status taxonomy for Zen Context outputs before adding site adapters, multi-tab workflows, MCP, or richer AI behavior. The taxonomy reserves `content_unavailable` for true content failure, separates degraded-but-usable content from metadata-only fallback, and gives Raycast commands, `@zen` AI tools, and future consumers a reliable way to decide whether extracted content is usable.

## Status

- Implemented
- 2026-04-30: Implemented in Raycast parser/AI usability checks, Firefox-family add-on context warnings, and CLI fallback context contract.

## Milestone

Stabilization step after the initial Zen Context implementation, Raycast commands, and `@zen` AI tools.

This spec should be implemented before:

- site adapters;
- multi-tab context workflows;
- MCP surfaces;
- richer AI context routing.

## Problem

The current context warning and error vocabulary is too coarse for downstream consumers that need to make safety and quality decisions.

Known ambiguities:

- `content_unavailable` may describe both real content failure and degraded Markdown output.
- Markdown may be derived from plain DOM text. That is usable, but lower-quality than structured Markdown.
- Title and URL fallback is useful source metadata, but is not page content and must not be summarized as if it were content.
- Missing permissions, restricted pages, failed script injection, selector no-match, invalid selector syntax, and browser/runtime failures need distinct meanings.
- Empty arrays and objects can currently be misread as "we inspected and found none" when they may actually mean "we could not inspect."

AI commands need to distinguish:

- real DOM page content;
- selected text;
- degraded but usable text-derived Markdown;
- tab metadata fallback only;
- unavailable content due to permissions, restricted pages, or runtime failure.

## Goals

- Reserve `content_unavailable` for true failure to provide usable page or selection content.
- Define warning codes for degraded-but-usable content.
- Define explicit metadata-only fallback indicators.
- Define permission, selector, truncation, transport, and runtime codes with stable semantics.
- Preserve status semantics for `ok`, `partial`, `empty`, and `error`.
- Make Raycast parser and AI content-usability decisions deterministic.
- Keep the migration additive and safe for current commands.
- Avoid schema-breaking changes unless clearly proposed as optional future hardening.

## Non-Goals

- No code implementation in this task.
- No native messenger changes.
- No new browser permissions.
- No site adapters.
- No MCP implementation or schema.
- No new production dependencies.
- No changes to Raycast command UX in this spec.
- No change to the current native-message transport or protocol.
- No broad rewrite of the context contract from Spec 007.

## User Workflow

### Summarize Active Page

1. User invokes a Raycast AI summarization command or `@zen` tool.
2. Raycast requests active page context.
3. The context payload reports whether content came from DOM content, selection, degraded Markdown, or tab metadata fallback.
4. Raycast accepts real DOM text, real DOM Markdown, selected text, or text-derived Markdown.
5. Raycast rejects title+URL-only fallback unless the command explicitly allows metadata-only fallback.

### Copy Page Context

1. User invokes a copy command.
2. Raycast requests page context.
3. If content is degraded but usable, copy output may include the content and preserve warnings.
4. If only tab metadata exists, the command labels it as metadata-only instead of presenting it as page Markdown.

### Selector Extraction

1. User requests context from a CSS selector.
2. A valid selector with no matching nodes returns `ok: true`, `status: "empty"`, and `selector_no_match`.
3. Invalid or unsupported selector requests return `ok: false`, `status: "error"` with non-zero exit.
4. Selector requests do not silently fall back to full-page content or title+URL metadata.

## Proposed Design

The taxonomy has three layers:

1. Top-level response status: whether the operation fulfilled, partially fulfilled, found an empty result, or failed.
2. Extraction source and quality: whether content is real DOM content, selected text, degraded content, or metadata-only fallback.
3. Warning/error codes: machine-readable reasons for degradation, fallback, emptiness, or failure.

The design is migration-safe:

- keep the existing response shape;
- add specific warning/error codes;
- keep `extraction.contentSource`, `extraction.domRead`, `permissions`, and `capabilities` as primary classification fields;
- tolerate legacy codes during migration;
- update Raycast parser/tests before tightening producer behavior.

### Status Semantics

| Response | Meaning | Consumer behavior |
| --- | --- | --- |
| `ok: true`, `status: "ok"` | Requested content was extracted successfully. | Consumers may use the requested content after normal field checks. |
| `ok: true`, `status: "partial"` | Some useful data exists, but warnings must be inspected. | Consumers must classify warnings and source before AI use. |
| `ok: true`, `status: "empty"` | Extraction succeeded and found no matching content. | Consumers should not treat this as a failure, but should not invent content. |
| `ok: false`, `status: "error"` | Requested operation cannot be fulfilled. | Consumers must not use content from this payload as requested output. |

Empty arrays and objects mean "we inspected successfully and found none." They must not be used to represent "we could not inspect." If inspection was not possible, omit the field and emit a warning or error that explains why.

### Content Usability Classes

| Class | Required signals | AI summarization default |
| --- | --- | --- |
| Real DOM page content | `extraction.domRead: true`, `contentSource: "document"` or `"selector"`, non-empty `content.text` or `content.markdown` | Accept |
| Selected text | `contentSource: "selection"` or `"focused-input"`, non-empty `content.selection`, `content.text`, or `content.markdown` | Accept |
| Degraded text-derived Markdown | Non-empty Markdown or text plus `markdown_derived_from_text` or `markdown_structure_unavailable` | Accept with warning |
| Tab metadata fallback only | `contentSource: "tab-metadata"` or warning `tab_metadata_fallback` / `metadata_only`; `domRead: false` | Reject unless explicitly allowed |
| Unavailable content | `ok: false` with `content_unavailable`, or `ok: true` partial with unavailable-content warnings and no usable content | Reject |

Tab metadata fallback must be explicitly labeled and must not be treated as real page content.

## Current Problematic Codes And Proposed Replacements

| Current code/field | Current ambiguity | Proposed replacement or interpretation |
| --- | --- | --- |
| `content_unavailable` warning for degraded Markdown | Conflates true content failure with usable low-quality Markdown. | Use `markdown_derived_from_text`, `reader_markdown_unavailable`, or `markdown_structure_unavailable`. Reserve `content_unavailable` for no usable page/selection content. |
| `content_unavailable` warning with title+URL fallback | Can make metadata-only fallback look like degraded content. | Use `tab_metadata_fallback` plus `metadata_only` and, when relevant, `dom_content_unavailable`. |
| `extraction.contentSource: "tab-metadata"` without warning | Consumers may miss that content is not real page content. | Keep `contentSource: "tab-metadata"` and add `tab_metadata_fallback` / `metadata_only`. |
| `permission_unavailable` | Too broad to distinguish missing host permission, missing active-tab grant, restricted pages, or injection failure. | Keep as generic compatibility code, add `host_permission_missing`, `active_tab_grant_missing`, `restricted_page`, or `injection_unavailable` as specific codes. |
| Empty `metadata`, `links`, or `selection` after failed DOM access | Looks like successful inspection found none. | Omit unavailable extracted fields and emit `permission_unavailable`, `dom_content_unavailable`, or a specific permission/restricted-page code. |
| `selector_no_match` | Correct when valid selector inspection succeeded. | Keep as warning with `ok: true`, `status: "empty"`, exit `0`. |
| `selector_invalid` | Correct for syntax/validation failure. | Keep as error with `ok: false`, `status: "error"`, non-zero exit. |
| `metadata_truncated` | Specific to metadata but less useful for generalized field truncation. | Keep tolerated; prefer `field_truncated` with `field`, optionally also emit legacy `metadata_truncated` during migration. |
| `content_truncated` | Correct for requested content truncation but can be too broad for nested fields. | Keep for primary content; add `field_truncated` for specific non-primary fields. |
| `content_unavailable` warning for an individual malformed metadata URL | Incorrectly implies page content is unusable when only one extracted field failed. | Use `field_unavailable` with `field` for individual non-primary fields. |
| `unsupported_page` | Can mean restricted browser page or unsupported request format. | Prefer `restricted_page` for browser-restricted pages and `unsupported_format` for unsupported requested output. Keep `unsupported_page` tolerated as legacy. |
| `native_messaging_unavailable` / mapped Raycast setup errors | Existing Raycast-facing setup code differs from context taxonomy. | Map transport/runtime failures into `transport_error`, `native_message_error`, `browser_context_unavailable`, or existing Raycast setup errors where appropriate. |

## Final Warning And Error Codes

Severity values:

- `info`: useful annotation, content remains usable.
- `warning`: degraded, partial, empty, or fallback state that consumers must inspect.
- `error`: operation cannot be fulfilled as requested.

AI use values:

- `yes`: AI commands may use resulting content by default.
- `conditional`: AI commands may use resulting content only if a command explicitly supports that fallback or field.
- `no`: AI commands must not use resulting content as page/selection content.

| Code | Type | Severity | When emitted | AI may use content | Exit code |
| --- | --- | --- | --- | --- | --- |
| `markdown_derived_from_text` | warning | info | Markdown was synthesized from extracted DOM text rather than structured Markdown/reader output. | yes | zero |
| `reader_markdown_unavailable` | warning | info | Preferred reader/structured Markdown extraction was unavailable, but text or simpler Markdown exists. | yes | zero |
| `markdown_structure_unavailable` | warning | warning | Structural Markdown features such as headings, lists, links, or semantic blocks could not be preserved. | yes | zero |
| `tab_metadata_fallback` | warning | warning | DOM content was unavailable and payload contains title/URL fallback only. | conditional | zero when fallback is allowed; non-zero if request requires content |
| `metadata_only` | warning | warning | Payload contains tab/page metadata only, not page or selection content. | conditional | zero when metadata-only output is requested; non-zero if request requires content |
| `dom_content_unavailable` | warning | warning | DOM page content could not be read, but tab metadata or another fallback may exist. | no for page summarization unless another usable content field exists | zero for partial fallback; non-zero if request requires DOM content |
| `permission_unavailable` | warning or error | warning/error | Generic compatibility code for unavailable permission when no more specific code is known. | no unless another usable content field exists | zero for partial fallback; non-zero for hard failure |
| `host_permission_missing` | warning or error | warning/error | Required host permission for the page URL is missing. | no unless another usable content field exists | zero for partial fallback; non-zero when content is required |
| `active_tab_grant_missing` | warning or error | warning/error | Active-tab grant is required and unavailable. | no unless another usable content field exists | zero for partial fallback; non-zero when content is required |
| `restricted_page` | error | error | Page is a browser, extension, internal, or otherwise restricted URL that cannot expose DOM content. | no | non-zero |
| `injection_unavailable` | warning or error | warning/error | Script injection could not run for the target tab. | no unless another usable content field exists | zero for partial fallback; non-zero when content is required |
| `selector_no_match` | warning | warning | Selector was valid and inspection succeeded, but matched no elements. | no resulting selector content exists | zero |
| `selector_invalid` | error | error | Selector syntax or validation failed. | no | non-zero |
| `selector_unsupported` | error | error | Selector was supplied for an unsupported command, mode, format, or page type. | no | non-zero |
| `content_truncated` | warning | warning | Primary page/selection content was truncated. | yes, with truncation caveat | zero |
| `field_truncated` | warning | warning | A specific non-primary field was truncated; `field` must identify it. | conditional based on field | zero |
| `field_unavailable` | warning | warning | A specific non-primary field could not be extracted or normalized; `field` must identify it. | conditional based on field | zero |
| `transport_error` | error | error | Raycast/CLI could not complete the command transport or process invocation. | no | non-zero |
| `native_message_error` | error | error | Native messaging returned an error or failed mid-request. | no | non-zero |
| `browser_context_unavailable` | error | error | Browser, profile, add-on, active window, or active tab context required for the operation is unavailable. | no | non-zero |
| `tab_not_found` | error | error | Requested tab ID/window target no longer exists or cannot be found. | no | non-zero |
| `unsupported_format` | error | error | Requested format is not supported for the command or is disabled, such as HTML before sanitizer support. | no | non-zero |
| `content_unavailable` | error | error | No usable page or selection content exists for the requested operation. This excludes degraded-but-usable Markdown. | no | non-zero |

Compatibility notes:

- `permission_unavailable` may remain as a broad warning during migration, but producers should also emit a specific permission code when known.
- `metadata_truncated`, `selection_unavailable`, `selector_multiple_matches`, `json_ld_malformed`, `html_sanitizer_missing`, `no_active_tab`, `addon_unavailable`, `browser_not_running`, `native_messaging_unavailable`, `invalid_context_request`, `invalid_format`, `output_too_large`, `extraction_timeout`, and `internal_error` remain tolerated existing codes. Future cleanup may alias or fold them into this taxonomy, but this spec does not require removing them.
- `unsupported_page` remains tolerated as legacy input. New restricted browser-page failures should prefer `restricted_page`.

## API Or Contract

This spec does not require a major schema version bump. It proposes additive codes and stricter semantics for existing fields.

### Warning Shape

Existing warning objects are sufficient:

```ts
type ZenExtractionWarning = {
  code: string;
  message: string;
  field?: string;
  severity?: "info" | "warning" | "error";
  details?: Record<string, unknown>;
};
```

`severity` and `details` are optional proposed additions. Consumers must not require them during migration.

### Required Producer Rules

- `content_unavailable` must mean there is no usable page or selection content for summarization or AI context.
- Degraded Markdown must use `markdown_derived_from_text`, `reader_markdown_unavailable`, or `markdown_structure_unavailable`, not `content_unavailable`.
- Tab metadata fallback must set `extraction.contentSource: "tab-metadata"` and `extraction.domRead: false`.
- Tab metadata fallback must emit `tab_metadata_fallback` or `metadata_only`.
- If DOM content could not be read, producers should emit `dom_content_unavailable` plus a more specific permission/restricted/injection code when known.
- Empty extracted arrays/objects are valid only after successful inspection.
- Unavailable extracted fields should be omitted or explicitly marked unavailable through warnings, permissions, and capabilities.
- Selector no-match must not fall back to full-page or metadata-only content.
- Truncated fields must set their field-level `truncated: true` where that field shape supports it, and must be represented in `extraction.truncation.fields`.

### Required Consumer Rules

- Do not rely on `ok: true` alone to decide AI usability.
- Treat `contentSource: "tab-metadata"`, `tab_metadata_fallback`, and `metadata_only` as not real page content.
- Accept text-derived Markdown as usable when non-empty and degraded warnings are present.
- Reject `ok: false`, `status: "error"` payloads for requested content use.
- Treat `status: "empty"` as successful inspection with no requested content, not as a runtime failure.
- Treat absent fields plus warnings differently from present empty arrays/objects.

## JSON Examples

### Real DOM Text Success

```json
{
  "kind": "zen.context",
  "version": 1,
  "ok": true,
  "status": "ok",
  "source": {
    "provider": "mozeidon",
    "command": "context active",
    "format": "text",
    "output": "json"
  },
  "capturedAt": "2026-04-30T09:00:00.000Z",
  "tab": {
    "id": 42,
    "windowId": 7,
    "active": true
  },
  "page": {
    "url": "https://example.com/article",
    "title": "Example Article",
    "domain": "example.com"
  },
  "content": {
    "text": {
      "value": "Article body text...",
      "length": 20,
      "truncated": false
    }
  },
  "extraction": {
    "mode": "active",
    "contentSource": "document",
    "domRead": true,
    "warnings": [],
    "truncation": {
      "truncated": false,
      "fields": []
    }
  },
  "permissions": {
    "canReadTabMetadata": true,
    "hasDomAccess": true,
    "canReadPageContent": true
  },
  "capabilities": {
    "pageContent": "available"
  }
}
```

### Markdown Derived From Text

```json
{
  "kind": "zen.context",
  "version": 1,
  "ok": true,
  "status": "partial",
  "source": {
    "provider": "mozeidon",
    "command": "context active",
    "format": "markdown",
    "output": "json"
  },
  "capturedAt": "2026-04-30T09:00:00.000Z",
  "page": {
    "url": "https://example.com/article",
    "title": "Example Article",
    "domain": "example.com"
  },
  "content": {
    "markdown": {
      "value": "# Example Article\n\nArticle body text...",
      "length": 38,
      "truncated": false
    }
  },
  "extraction": {
    "mode": "active",
    "contentSource": "document",
    "domRead": true,
    "warnings": [
      {
        "code": "markdown_derived_from_text",
        "message": "Markdown was derived from readable page text."
      },
      {
        "code": "markdown_structure_unavailable",
        "message": "Some document structure could not be preserved."
      }
    ],
    "truncation": {
      "truncated": false,
      "fields": []
    }
  }
}
```

### Tab Metadata Fallback Only

```json
{
  "kind": "zen.context",
  "version": 1,
  "ok": true,
  "status": "partial",
  "source": {
    "provider": "mozeidon",
    "command": "context active",
    "format": "markdown",
    "output": "json"
  },
  "capturedAt": "2026-04-30T09:00:00.000Z",
  "page": {
    "url": "https://example.com/article",
    "title": "Example Article",
    "domain": "example.com"
  },
  "content": {
    "markdown": {
      "value": "# Example Article\n\nhttps://example.com/article",
      "length": 45,
      "truncated": false
    }
  },
  "extraction": {
    "mode": "active",
    "contentSource": "tab-metadata",
    "domRead": false,
    "warnings": [
      {
        "code": "tab_metadata_fallback",
        "message": "Only tab title and URL were available."
      },
      {
        "code": "metadata_only",
        "message": "No page or selection content was extracted."
      },
      {
        "code": "dom_content_unavailable",
        "message": "DOM page content could not be read."
      }
    ],
    "truncation": {
      "truncated": false,
      "fields": []
    }
  },
  "permissions": {
    "canReadTabMetadata": true,
    "hasDomAccess": false,
    "canReadPageContent": false
  },
  "capabilities": {
    "pageContent": "permission-required"
  }
}
```

### Permission Missing

```json
{
  "kind": "zen.context.error",
  "version": 1,
  "ok": false,
  "status": "error",
  "code": "host_permission_missing",
  "message": "Zen Context does not have host permission to read this page.",
  "source": {
    "provider": "mozeidon",
    "command": "context active",
    "format": "markdown",
    "output": "json"
  },
  "capturedAt": "2026-04-30T09:00:00.000Z",
  "details": {
    "url": "https://example.com/article",
    "legacyCode": "permission_unavailable"
  }
}
```

### Selector No Match

```json
{
  "kind": "zen.context",
  "version": 1,
  "ok": true,
  "status": "empty",
  "source": {
    "provider": "mozeidon",
    "command": "context active",
    "format": "markdown",
    "output": "json"
  },
  "capturedAt": "2026-04-30T09:00:00.000Z",
  "page": {
    "url": "https://example.com/article",
    "title": "Example Article",
    "domain": "example.com"
  },
  "content": {},
  "extraction": {
    "mode": "active",
    "selector": ".does-not-exist",
    "selectorMatched": false,
    "selectorMatchCount": 0,
    "contentSource": "selector",
    "domRead": true,
    "warnings": [
      {
        "code": "selector_no_match",
        "message": "The selector did not match any elements."
      }
    ],
    "truncation": {
      "truncated": false,
      "fields": []
    }
  }
}
```

### Invalid Selector

```json
{
  "kind": "zen.context.error",
  "version": 1,
  "ok": false,
  "status": "error",
  "code": "selector_invalid",
  "message": "The selector is not valid CSS.",
  "source": {
    "provider": "mozeidon",
    "command": "context active",
    "format": "markdown",
    "output": "json"
  },
  "capturedAt": "2026-04-30T09:00:00.000Z",
  "details": {
    "selector": "main >>"
  }
}
```

### Restricted Page

```json
{
  "kind": "zen.context.error",
  "version": 1,
  "ok": false,
  "status": "error",
  "code": "restricted_page",
  "message": "Zen Context cannot read browser-internal or restricted pages.",
  "source": {
    "provider": "mozeidon",
    "command": "context active",
    "format": "markdown",
    "output": "json"
  },
  "capturedAt": "2026-04-30T09:00:00.000Z",
  "details": {
    "url": "about:preferences",
    "legacyCode": "unsupported_page"
  }
}
```

### Truncated Content

```json
{
  "kind": "zen.context",
  "version": 1,
  "ok": true,
  "status": "partial",
  "source": {
    "provider": "mozeidon",
    "command": "context active",
    "format": "text",
    "output": "json"
  },
  "capturedAt": "2026-04-30T09:00:00.000Z",
  "content": {
    "text": {
      "value": "Long article body...",
      "length": 50000,
      "truncated": true
    }
  },
  "extraction": {
    "mode": "active",
    "contentSource": "document",
    "domRead": true,
    "warnings": [
      {
        "code": "content_truncated",
        "message": "Page text was truncated at the configured limit.",
        "field": "content.text"
      },
      {
        "code": "field_truncated",
        "message": "The text content field was truncated.",
        "field": "content.text"
      }
    ],
    "truncation": {
      "truncated": true,
      "fields": ["content.text"]
    }
  }
}
```

## Migration Strategy

### Raycast Parser And Tests First

1. Update Raycast parsing helpers to normalize warning/error codes from both top-level `warnings` and `extraction.warnings`.
2. Add a classification helper that returns a content usability class:
   - `usable-page-content`;
   - `usable-selection`;
   - `usable-degraded-content`;
   - `metadata-only`;
   - `empty`;
   - `unavailable`;
   - `error`.
3. Make AI commands use that helper instead of ad hoc checks for `contentSource` and selected warning strings.
4. Add fixture tests for every example in this spec.
5. Keep old codes tolerated while producers are updated.

### Producer Updates

1. Replace degraded Markdown `content_unavailable` warnings with `markdown_derived_from_text`, `reader_markdown_unavailable`, or `markdown_structure_unavailable`.
2. Add `tab_metadata_fallback` and `metadata_only` when `contentSource` is `tab-metadata`.
3. Add `dom_content_unavailable` when DOM content could not be read.
4. Add specific permission codes where the failure mode is known.
5. Keep legacy `permission_unavailable`, `unsupported_page`, and `metadata_truncated` where needed during one compatibility window.
6. Stop emitting `content_unavailable` for degraded-but-usable content after Raycast and tests accept the new codes.

### Compatibility Window

Old codes should be temporarily tolerated:

- `content_unavailable` as a warning may be treated as "possibly metadata-only or unavailable" only when no usable content field exists.
- If a payload has non-empty DOM text/Markdown and `domRead: true`, Raycast may treat legacy `content_unavailable` warning as degraded legacy behavior, but tests should mark this as compatibility-only.
- `unsupported_page` maps to `restricted_page` for restricted browser URLs and remains a generic unsupported-page fallback until producers are updated.
- `metadata_truncated` maps to `field_truncated` with metadata fields.
- `native_messaging_unavailable` maps to `native_message_error` or existing Raycast setup error surfaces.

Avoid breaking current commands by making consumer changes permissive before producer changes strict. Existing user-visible commands should keep working even when connected to an older Mozeidon binary or add-on.

## Security And Permissions

- No new permissions are introduced by this spec.
- Permission codes describe existing availability only; they must not trigger automatic permission requests.
- Page-derived text, title, URL, selectors, metadata, and errors remain local unless the user explicitly sends them through Raycast AI or another tool.
- Restricted pages must not expose privileged DOM. `restricted_page` should be a hard error for content extraction.
- Metadata-only fallback must be visibly marked so AI prompts do not accidentally launder title and URL into a fake page summary.
- Selector strings remain user input and must continue to be passed as structured values, not shell strings.
- Transport/runtime errors must not include excessive sensitive page content in messages or details.

## Alternatives Considered

### Add A New `contentQuality` Field Immediately

Rejected as a required change for this spec because it would be a schema expansion that every producer and consumer must learn at once. The same classification can be derived from existing `contentSource`, `domRead`, content fields, and warning codes. A future additive `contentQuality` field remains possible.

### Treat Metadata Fallback As `ok: false`

Rejected as a blanket rule. Metadata-only output can be useful for copy commands, diagnostics, tab tools, and commands that explicitly allow fallback. The correct behavior is to label it precisely and let commands requiring content reject it.

### Keep `content_unavailable` Broad

Rejected. Broad `content_unavailable` prevents AI commands from distinguishing degraded-but-usable text-derived Markdown from true content failure.

### Use Only `status: "partial"`

Rejected. `partial` explains that consumers must inspect warnings, but it does not say whether the remaining data is usable page content, metadata-only fallback, or a permission failure.

## Test Strategy

### Unit Tests For Parser Classification

Add Raycast parser tests covering:

- real DOM text success;
- real DOM Markdown success;
- selected text success;
- `markdown_derived_from_text`;
- `reader_markdown_unavailable`;
- `markdown_structure_unavailable`;
- `contentSource: "tab-metadata"`;
- `tab_metadata_fallback`;
- `metadata_only`;
- `dom_content_unavailable`;
- legacy `content_unavailable` warning with and without usable content;
- `ok: false` structured errors;
- empty arrays/objects after successful inspection versus omitted fields with warnings.

### Unit Tests For AI Command Usability Decisions

Add tests verifying:

- AI summarization accepts real DOM text/Markdown.
- AI summarization accepts selected text.
- AI summarization accepts degraded text-derived Markdown with warnings.
- AI summarization rejects title+URL-only fallback by default.
- Commands with explicit fallback allowance may use metadata-only output.
- Selector no-match does not call AI with empty content.
- Permission, restricted page, injection, transport, and native-message errors surface as structured failures.
- Truncated content remains usable but warnings are preserved.

### Fixture-Based Context Payload Tests

Create fixtures for:

- real DOM text success;
- Markdown derived from text;
- metadata-only fallback;
- permission missing;
- selector no-match;
- invalid selector;
- restricted page;
- truncated content;
- legacy warning compatibility cases.

Fixtures should be consumed by parser tests and AI tool tests to prevent divergence between command and tool behavior.

### Producer Tests For Eventual Implementation

When implementation starts, add producer-side tests for:

- degraded Markdown no longer emits `content_unavailable`;
- metadata fallback emits `tab_metadata_fallback` / `metadata_only`;
- permission failures emit specific codes where known;
- selector no-match remains `ok: true`, `status: "empty"`, exit `0`;
- invalid selector remains `ok: false`, `status: "error"`, non-zero exit;
- restricted pages do not expose DOM content;
- truncation emits `content_truncated` or `field_truncated` and marks field-level truncation.

## Manual Verification Steps

1. Open a normal web article in Zen and run `mozeidon context active --format text`; verify `ok: true`, `status: "ok"`, `domRead: true`, and `contentSource: "document"`.
2. Run `mozeidon context active --format markdown` on a page where Markdown is text-derived; verify degraded Markdown warnings are present and `content_unavailable` is absent.
3. Force or simulate missing DOM access; verify any title+URL fallback has `contentSource: "tab-metadata"`, `domRead: false`, and metadata-only warnings.
4. Verify Raycast summarize rejects metadata-only fallback by default and shows a clear content-unavailable state.
5. Verify a command that explicitly allows metadata fallback can still display or copy title+URL.
6. Run `mozeidon context active --selector ".does-not-exist"` on a readable page; verify exit `0`, `ok: true`, `status: "empty"`, and `selector_no_match`.
7. Run an invalid selector; verify structured `selector_invalid` and non-zero exit.
8. Open a restricted page such as a browser-internal page; verify structured `restricted_page` or legacy-compatible restricted-page mapping and no DOM content.
9. Lower content limits or use a long page; verify truncation warnings, field-level truncation flags, and AI usability with preserved warnings.
10. Run Raycast tests, lint, and build after implementation changes.

## Rollout Plan

1. Land this spec.
2. Update Raycast parser and AI decision tests with fixtures while retaining legacy tolerance.
3. Update add-on/CLI producers to emit the new codes additively.
4. Update Raycast commands and `@zen` tools to use the classifier everywhere AI usability is decided.
5. Remove compatibility-only expectations from tests only after the bundled CLI/add-on and Raycast extension emit and consume the new taxonomy reliably.

## Acceptance Criteria For Eventual Implementation

- `content_unavailable` is no longer used for degraded-but-usable Markdown.
- Raycast AI commands can reliably distinguish usable page content from tab metadata fallback.
- Metadata, links, and selection unavailable cases are not represented as successful empty results.
- Empty arrays/objects mean successful inspection found none.
- Tests cover all major classifications.
- Existing user-visible commands keep working.
- No native messenger changes.
- No new permissions.
- No production dependencies are added without separate justification and approval.

## Progress Log

- 2026-04-30: Implemented the taxonomy cleanup in the Raycast parser/AI usability checks, Firefox-family add-on context warnings, and CLI fallback context contract. Degraded DOM Markdown now emits `markdown_derived_from_text` / `markdown_structure_unavailable`; tab metadata fallback emits `tab_metadata_fallback` / `metadata_only`; DOM failure paths emit `dom_content_unavailable` plus specific permission/injection/restricted-page compatibility codes; individual malformed metadata fields emit `field_unavailable`. No native messenger changes, browser permission changes, new Raycast commands, or production dependencies were added.

## Open Questions

- Should a future additive `contentQuality` or `contentUsability` field be added to reduce repeated consumer classification logic?
- Should CLI support an explicit `--require-content` flag so non-Raycast consumers can request non-zero failure for metadata-only fallback?
- How long should Raycast tolerate legacy `content_unavailable` warnings on otherwise usable DOM content?
