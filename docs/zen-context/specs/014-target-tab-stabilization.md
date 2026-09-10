# Spec 014: Target-Tab Stabilization For Context Extraction And AI Tools

## Summary

Define a robust strategy for extracting Zen Context from a specific tab rather than implicitly reading whichever tab is active at the moment of extraction. The design gives Raycast AI tools and future multi-tab workflows a stable way to target `tabId` plus `windowId`, verify that the requested tab is the tab actually read, and restore user focus when a focus-then-read fallback is required.

## Status

- Phase 1 implemented
- 2026-04-30: Drafted as a spec-only stabilization step after Spec 013. No code has been implemented for this spec.
- 2026-09-10: Phase 1 implemented in Raycast. `zen_get_tab_content` now switches to a non-active target, polls to verify the switch landed, extracts context, verifies the extracted content reports the same `tabId`/`windowId`, and restores original focus by default (`restoreFocus`, default `true`). Failure paths (`tab_activation_failed`, `activation_timeout`, `target_tab_mismatch`) fail closed instead of returning ambiguous content; restore failures (`focus_restore_failed`, `focus_restore_mismatch`) are reported as warnings without discarding valid content. CLI/add-on/native messenger are unchanged, per Phase 1 scope. Phase 2 (direct tab-targeted CLI extraction, e.g. `mozeidon context tab`) is not started.

## Milestone

Stabilization step before advanced AI workflows that need repeatable multi-tab context reads:

- multi-tab comparison;
- tab-group summarization;
- research workflows;
- future MCP wrappers;
- batch context extraction.

## Problem

The current Zen Context API primarily extracts context from the active Zen tab. The `zen_get_tab_content` AI tool accepts a tab target, but the current V1 strategy is effectively:

1. identify or switch/focus the target tab;
2. call active-tab context extraction;
3. trust that the active tab is now the intended target.

That is acceptable for initial V1 behavior, but it is too fragile for advanced AI flows:

- tab activation can race with context extraction;
- the active tab may not yet match the requested `tabId` and `windowId`;
- the user's focused Zen tab/window may be left changed after tool use;
- batch workflows may visibly jump across many tabs;
- failures during activation, extraction, or restore may leave Zen in an unexpected state;
- reading "the active tab" after a switch can read the wrong tab if the switch did not complete or focused a different window.

For AI tools, reading the wrong tab is worse than returning an error. The tool must fail closed when target identity is ambiguous.

## Goals

- Define a stable target-tab context extraction strategy using `tabId` and `windowId`.
- Prefer direct tab-targeted context extraction when the existing CLI/add-on architecture can support it without native messenger or permission changes.
- Specify a safe focus-then-read fallback when direct inactive-tab extraction is not available.
- Verify the actual tab/window read before returning content for a targeted request.
- Restore original focus by default for AI and batch workflows.
- Clearly report activation, extraction, and restore status in the returned data.
- Preserve existing active-tab commands and current user-visible activation behavior.
- Avoid native messenger changes unless a later implementation proves they are necessary.
- Avoid browser permission changes.

## Non-Goals

- No code implementation in this task.
- No site adapters.
- No MCP implementation or schema.
- No new browser permissions.
- No destructive browser actions.
- No native messenger transport changes unless implementation proves existing request arguments cannot carry the target identity.
- No changes to existing active-tab commands except additive metadata where explicitly accepted by the implementation spec.
- No broad redesign of the context contract from Spec 007 or the warning/error taxonomy from Spec 013.
- No persistent page-content cache or background indexing.

## Current Behavior

Relevant existing pieces:

- Active-tab context reads use the context API, such as `mozeidon context active --format markdown`.
- `zen_get_tab_content` can accept `tabId` and `windowId`.
- Spec 011 documents that, when a non-active tab is requested, the tool may use safe tab switching before context retrieval.
- Current tab switching uses the existing Mozeidon tab switch command shape, such as `mozeidon tabs switch <windowId>:<tabId>`.

This means the V1 non-active-tab read is coupled to browser focus. It does not have a stable contract for:

- recording the original active tab/window;
- confirming the target became active before extraction;
- recording the actual tab/window read;
- restoring focus after extraction;
- warning when restore fails;
- failing when active tab verification does not match the requested target.

The current approach is insufficient for multi-tab workflows because the workflow may produce a result that looks precise while one or more reads came from the wrong tab.

## Proposed Design

Introduce a target-tab stabilization layer in Raycast around any non-active-tab context request. The first implementation phase should stay Raycast-first and wrap existing Mozeidon CLI capabilities. CLI or add-on changes are future phases unless the Raycast fallback cannot satisfy the acceptance criteria.

The layer has two supported strategies:

1. **Phase 1 strategy: focus-then-read with activation verification and optional focus restore.**
2. **Future preferred strategy: direct tab-targeted context extraction.**

The caller should not need to know which strategy was used. It should receive structured metadata showing the requested target, the actual target read, whether focus changed, whether restore was attempted, and whether restore succeeded.

### Implementation Phases

Phase 1 should be limited to Raycast:

- add stabilization around existing `tabs switch` plus `context active` commands;
- add `restoreFocus` handling and target metadata to `zen_get_tab_content`;
- preserve all active-tab command behavior;
- add Raycast tests and fixtures for activation, mismatch, restore, and ambiguous-read failures.

Phase 2 may add direct CLI context targeting, such as `mozeidon context tab`, only after Phase 1 proves the contract and tests. Phase 2 must not change the native messenger or browser permissions unless this spec is updated with explicit justification.

Phase 3 may move direct target support into the add-on only if the existing CLI/context request path cannot prove the actual tab identity or cannot avoid the focus race. That phase also requires a spec update before implementation.

### Strategy Selection

Use direct tab-targeted extraction when it becomes available. This is the preferred future shape, not a Phase 1 requirement:

```text
mozeidon context tab --tab-id <tabId> --window-id <windowId> --format markdown
```

Equivalent command shapes are acceptable if they preserve the same semantics, for example:

```text
mozeidon context active --tab-id <tabId> --window-id <windowId> --format markdown
```

or an internal helper that sends an additive target object through the existing context request:

```json
{
  "mode": "active",
  "format": "markdown",
  "target": {
    "tabId": 123,
    "windowId": 456
  }
}
```

Direct extraction is preferred only if it can be implemented without:

- native messenger transport changes;
- new browser permissions;
- silently broadening page access;
- losing target verification.

Until direct tab-targeted extraction exists and passes the same verification rules, use focus-then-read fallback and document the fallback in returned metadata.

### Direct Tab-Targeted Context Extraction

Direct extraction should:

1. validate `tabId` and `windowId`;
2. confirm the tab exists in the expected window;
3. request context from exactly that tab;
4. include the requested and actual tab identity in the result;
5. return an error if the producer cannot prove the actual tab read.

Direct extraction must not require visible tab activation unless the browser API or permission model requires it. If direct extraction internally needs temporary activation, it must still expose the same activation/restore metadata as the fallback strategy.

### Focus-Then-Read Fallback

Focus-then-read remains acceptable for V1 and as a compatibility fallback, but it must be stabilized:

1. Capture original active tab/window.
2. Resolve and validate the target tab/window.
3. Switch/focus the target tab.
4. Poll the browser tab/window list until the active tab in the focused or target window matches the requested `tabId` and `windowId`.
5. Extract active context only after target verification succeeds.
6. Verify the extracted context reports the same actual `tabId` and `windowId`.
7. Restore original focus when `restoreFocus` is true.
8. Return explicit activation, extraction, and restore metadata.

If any identity check fails, targeted AI tools must fail rather than returning ambiguous content.

## API Or Contract

### Raycast AI Tool Input

Extend `zen_get_tab_content` with `restoreFocus` and make target semantics explicit:

```ts
type ZenGetTabContentInput = {
  tabId?: number;
  windowId?: number;
  url?: string;
  format?: "markdown" | "text" | "json";
  requireContent?: boolean;
  restoreFocus?: boolean;
};
```

Defaults:

- no `tabId`, `windowId`, or `url`: read the current active tab directly;
- `format: "markdown"`;
- `requireContent: true`;
- `restoreFocus: true` for AI tool calls and batch/multi-tab workflows;
- `restoreFocus: false` for explicit user commands where visible switching is expected.

Validation:

- `tabId` and `windowId` must be provided together.
- `url` target resolution must produce exactly one open tab, or return `ambiguous_tab` / `tab_not_found`.
- `url` target resolution must only search existing tabs. It must not open, navigate, or activate URLs before a specific tab target is resolved and verified.
- If both `tabId`/`windowId` and `url` are provided, `tabId`/`windowId` are authoritative and `url` may be used only as a consistency check.

### CLI Shape

Preferred future CLI shape:

```text
mozeidon context tab --tab-id <tabId> --window-id <windowId> --format markdown
```

Allowed options should mirror active context where applicable:

```text
mozeidon context tab \
  --tab-id <tabId> \
  --window-id <windowId> \
  --format <markdown|text|json|html> \
  --selector <selector> \
  --max-bytes <bytes>
```

Compatibility fallback:

```text
mozeidon tabs switch <windowId>:<tabId>
mozeidon context active --format <format>
```

The fallback must be wrapped by Raycast stabilization logic. It must not be treated as equivalent to direct targeted context unless activation and extraction identity are verified.

### Context Result Fields

Additive metadata should be returned by Raycast tool results and, where feasible, by future CLI context payloads:

```ts
type TargetTabIdentity = {
  tabId?: number;
  windowId?: number;
  url?: string;
  title?: string;
};

type TargetTabActivation = {
  strategy: "direct" | "focus-then-read";
  attempted: boolean;
  succeeded: boolean;
  attempts: number;
  elapsedMs: number;
  errorCode?: string;
  message?: string;
};

type TargetTabReadMetadata = {
  requestedTab?: TargetTabIdentity;
  actualTab?: TargetTabIdentity;
  originalTab?: TargetTabIdentity;
  focusChanged: boolean;
  restoreFocus: boolean;
  focusRestored?: boolean;
  activation: TargetTabActivation;
  warnings: Array<{
    code: string;
    message: string;
    field?: string;
  }>;
};
```

For `zen_get_tab_content`, these fields should appear in the tool response data:

```ts
type ZenGetTabContentData = {
  source: ZenSource;
  format: "markdown" | "text" | "json";
  markdown?: string;
  text?: string;
  context?: unknown;
  requestedTab?: TargetTabIdentity;
  actualTab?: TargetTabIdentity;
  originalTab?: TargetTabIdentity;
  focusChanged: boolean;
  restoreFocus: boolean;
  focusRestored?: boolean;
  activation: TargetTabActivation;
  warnings: string[] | TargetTabReadMetadata["warnings"];
};
```

If the lower-level context contract later adopts these fields, prefer nesting them under `extraction.target` to avoid confusing them with the page's own metadata:

```json
{
  "extraction": {
    "target": {
      "requestedTab": { "tabId": 123, "windowId": 456 },
      "actualTab": { "tabId": 123, "windowId": 456 },
      "focusChanged": true,
      "restoreFocus": true,
      "focusRestored": true,
      "activation": {
        "strategy": "focus-then-read",
        "attempted": true,
        "succeeded": true,
        "attempts": 3,
        "elapsedMs": 214
      }
    }
  }
}
```

### Output Semantics

- `requestedTab` is the target requested by the tool caller after URL resolution.
- `actualTab` is the tab identity proven by the context payload or active-tab verification.
- `originalTab` is the active tab/window before a focus-then-read attempt.
- `focusChanged` is true if the stabilization layer invoked a tab/window activation command or direct extraction visibly changed focus.
- `restoreFocus` records the caller option used.
- `focusRestored` is present only when restore was attempted. It is `true` when restore was requested and verified, and `false` when restore was requested but failed or verified the wrong tab.
- `activation.succeeded` means the active tab/window matched the requested target before extraction.
- `warnings` must include mismatch, restore, and fallback warnings that did not make the primary operation fail.

For targeted AI reads:

- requested/actual mismatch is an error;
- activation timeout is an error;
- tab/window not found is an error;
- restore failure after successful extraction is a warning unless the caller requested strict restore semantics;
- DOM content unavailable after successful activation follows Spec 013 content-usability rules.

## Timing And Retry Behavior

The implementation should use bounded polling with small delays. Proposed defaults:

| Setting | Default | Notes |
| --- | --- | --- |
| Activation max attempts | 10 | Enough for normal browser focus latency without long hangs. |
| Activation delay | 100 ms | Delay between tab-list verification attempts. |
| Activation timeout | 1500 ms | Hard wall-clock cap including command latency where feasible. |
| Restore max attempts | 10 | Same as activation. |
| Restore delay | 100 ms | Same as activation. |
| Restore timeout | 1500 ms | Restore failure should be reported clearly. |

Success criteria:

- target `tabId` exists;
- target `windowId` exists;
- target tab is active in the target window;
- when window focus is observable, target window is focused or last-focused;
- extracted context `tab.id` and `tab.windowId` match the requested target.

Timeout behavior:

- return `ok: false` for targeted AI reads;
- use `activation_timeout` when the target did not become active in time;
- include `requestedTab`, `actualTab` if known, `focusChanged`, `restoreFocus`, `focusRestored` if restore was attempted, and activation attempt metadata;
- if restore was attempted after a failed activation, include restore status too.

## Failure Behavior

| Case | Code | Severity | Result |
| --- | --- | --- | --- |
| Target tab ID/window ID does not exist | `tab_not_found` | error | `ok: false`; do not read active context. |
| Window ID does not exist | `window_not_found` | error | `ok: false`; do not read active context. |
| Partial tab target supplied | `invalid_input` | error | `ok: false`; require both `tabId` and `windowId`. |
| URL target matches multiple tabs | `ambiguous_tab` | error | `ok: false`; require explicit tab target. |
| Tab switch command fails | `tab_activation_failed` | error | `ok: false`; include command-safe error message. |
| Target does not become active before timeout | `activation_timeout` | error | `ok: false`; do not extract or do not return extracted content. |
| Active tab after switch differs from requested tab | `target_tab_mismatch` | error | `ok: false` for AI; no ambiguous content. |
| Context payload actual tab differs from requested tab | `target_tab_mismatch` | error | `ok: false`; discard content. |
| Target activated, but DOM content unavailable | Spec 013 code such as `restricted_page`, `dom_content_unavailable`, `content_unavailable` | error or warning | Follow Spec 013 usability classification. |
| Context extraction command fails | `context_extraction_failed` or underlying Spec 013 code | error | `ok: false`; include activation metadata. |
| Restore focus command fails | `focus_restore_failed` | warning by default | Return content if extraction was valid; include warning and `focusRestored: false`. |
| Restore focus verifies wrong tab | `focus_restore_mismatch` | warning by default | Return content if extraction was valid; include actual restored tab when known. |

Compatibility:

- Existing Spec 013 codes remain valid.
- New target-tab stabilization codes should be additive.
- Raycast consumers should map unknown target stabilization errors to a clear user-facing failure, not to fallback content.

### Proposed New Codes

These codes are target-tab-specific unless Spec 013 is later updated to fold them into the shared taxonomy:

| Code | Type | When emitted |
| --- | --- | --- |
| `window_not_found` | error | Requested `windowId` does not identify an open Zen window. |
| `ambiguous_tab` | error | URL or other target lookup matches more than one open tab. |
| `tab_activation_failed` | error | Tab/window activation command failed before verification. |
| `activation_timeout` | error | Target tab did not become active before the bounded retry timeout. |
| `target_tab_mismatch` | error | Verified active tab or extracted context does not match the requested tab/window. |
| `context_extraction_failed` | error | Context command failed after successful target activation and no more specific Spec 013 code is available. |
| `focus_restore_failed` | warning | Restore command failed after a valid read. |
| `focus_restore_mismatch` | warning | Restore was attempted, but verification found a different active tab/window. |

## Stabilization Flow Pseudocode

```ts
async function getTabContent(input) {
  const format = input.format ?? "markdown";
  const restoreFocus = input.restoreFocus ?? defaultRestoreFocusForCaller();

  if (!hasTarget(input)) {
    return readActiveContext({ format });
  }

  const originalTab = await getCurrentActiveTab();
  const requestedTab = await resolveTarget(input);
  if (!requestedTab) {
    return error("tab_not_found", { requestedTab: input, originalTab });
  }

  if (supportsDirectTargetedContext()) {
    const context = await readTargetedContext(requestedTab, { format });
    const actualTab = tabFromContext(context);

    if (!sameTab(requestedTab, actualTab)) {
      return error("target_tab_mismatch", {
        requestedTab,
        actualTab,
        activation: directActivationMetadata(),
      });
    }

    return success(context, {
      requestedTab,
      actualTab,
      originalTab,
      focusChanged: false,
      restoreFocus,
      activation: directActivationMetadata(),
    });
  }

  let activation = await activateAndVerify(requestedTab, {
    maxAttempts: 10,
    delayMs: 100,
    timeoutMs: 1500,
  });

  if (!activation.succeeded) {
    const restore = restoreFocus ? await restoreOriginalFocus(originalTab) : undefined;
    return error(activation.errorCode ?? "activation_timeout", {
      requestedTab,
      actualTab: activation.actualTab,
      originalTab,
      focusChanged: activation.focusChanged,
      restoreFocus,
      focusRestored: restore?.succeeded,
      activation,
      warnings: restoreWarnings(restore),
    });
  }

  const context = await readActiveContext({ format });
  const actualTab = tabFromContext(context);

  if (!sameTab(requestedTab, actualTab)) {
    const restore = restoreFocus ? await restoreOriginalFocus(originalTab) : undefined;
    return error("target_tab_mismatch", {
      requestedTab,
      actualTab,
      originalTab,
      focusChanged: true,
      restoreFocus,
      focusRestored: restore?.succeeded,
      activation,
      warnings: restoreWarnings(restore),
    });
  }

  const restore = restoreFocus ? await restoreOriginalFocus(originalTab) : undefined;
  return success(context, {
    requestedTab,
    actualTab,
    originalTab,
    focusChanged: true,
    restoreFocus,
    focusRestored: restore?.succeeded,
    activation,
    warnings: restoreWarnings(restore),
  });
}
```

## Safety Rules

- Do not silently read the wrong tab.
- Do not fall back to the current active tab for a targeted request if target activation or verification fails.
- For AI tools, prefer failing over returning ambiguous content.
- Discard content if `actualTab` does not match `requestedTab`.
- Preserve existing active-tab reads when no target is provided.
- Restore focus by default for AI tools and batch workflows.
- Restore failure must not be hidden. It must be reported in warnings and metadata.
- Destructive actions are out of scope.
- Use argument-array command execution for Mozeidon commands. Do not build shell strings from `tabId`, `windowId`, `url`, `format`, or selector inputs.

## Security And Permissions

User-derived inputs:

- `tabId`, `windowId`, `url`, `format`, `selector`, and `restoreFocus` come from Raycast tool input or user commands.
- Validate IDs as finite positive integers where the existing tab model allows.
- Validate formats against explicit allowlists.
- URL targeting must use existing URL validation and exact-match tab resolution before any navigation-like behavior.

Page-derived inputs:

- Page title, URL, and content remain untrusted.
- Do not interpolate page-derived values into shell commands.
- Do not use page title or URL as proof that a tab was read; use `tabId` and `windowId`.

Command execution:

- Use existing argument-array helpers for Mozeidon calls.
- Never execute `mozeidon tabs switch` or context commands through shell interpolation.
- Include command failures in structured errors without leaking sensitive environment details.

Browser permissions:

- No new browser permissions.
- Direct targeted extraction may use only capabilities already available to the add-on and context API.
- If direct extraction would require broader permissions, it must be deferred or separately specified.

Native messenger:

- No native messenger transport changes are expected.
- CLI or add-on request payload additions are acceptable only if they fit through the existing native-message request mechanism.

Focus and user experience:

- Temporary focus changes are allowed only for read-only context extraction.
- AI and batch workflows should restore focus by default.
- User commands that explicitly ask to switch or inspect a visible tab may opt out with `restoreFocus: false`.

## Alternatives Considered

### Keep Focus-Then-Read Without Verification

Rejected. It is simple, but it can silently read the wrong tab and is not safe enough for AI workflows.

### Always Require User To Manually Focus Target Tab

Rejected for advanced workflows. It avoids automated focus changes but makes multi-tab comparison and tab-group summarization impractical.

### Always Use Direct Inactive-Tab Extraction

Preferred long-term, but not assumed available. Some browser APIs or permission grants may still require activation for reliable DOM reads. The spec therefore defines direct extraction as preferred and focus-then-read as a stabilized fallback.

### Background Cache Of All Tab Content

Rejected for this spec. It would introduce storage, freshness, privacy, and permission questions beyond target-tab stabilization.

### Native Messenger Protocol Redesign

Rejected unless proven necessary. The current transport can likely carry additive context request fields; the problem is target identity and stabilization semantics, not transport framing.

## Test Plan

### Unit Tests

Raycast stabilization helper tests should mock Mozeidon dependencies and browser/tab snapshots:

- active-tab read with no target bypasses switching and preserves existing behavior;
- `tabId` without `windowId` returns `invalid_input`;
- `windowId` without `tabId` returns `invalid_input`;
- target tab not found returns `tab_not_found`;
- target window not found returns `window_not_found`;
- URL target with multiple matches returns `ambiguous_tab`;
- switch command succeeds and polling observes requested active tab;
- switch command fails returns `tab_activation_failed`;
- polling times out returns `activation_timeout`;
- polling observes a different active tab returns `target_tab_mismatch`;
- context extraction after successful switch returns matching `actualTab`;
- context extraction after successful switch returns wrong `actualTab` and AI tool refuses the read;
- `restoreFocus: true` restores original active tab and reports `focusRestored: true`;
- `restoreFocus: true` restore command failure returns valid content plus `focus_restore_failed` warning;
- `restoreFocus: true` restore mismatch returns valid content plus `focus_restore_mismatch` warning;
- extraction failure after successful switch preserves activation metadata;
- AI tool rejects metadata-only or unavailable content according to Spec 013;
- all Mozeidon commands are invoked through argument arrays, not shell strings.

### Fixture Tests

Add fixture-based tests for tool outputs:

- successful direct targeted context read;
- successful focus-then-read with restore;
- successful focus-then-read without restore;
- activation timeout;
- target mismatch after extraction;
- restore failure warning;
- DOM content unavailable after target activation.

### CLI Tests

If `mozeidon context tab` is implemented:

- parses `--tab-id`, `--window-id`, `--format`;
- rejects missing or invalid IDs;
- returns `tab_not_found` for closed tabs;
- returns `target_tab_mismatch` if add-on or fallback reports a different actual tab;
- preserves existing `context active` behavior.

### Add-On Tests

Only if direct target support touches add-on context extraction:

- request parsing accepts additive target fields;
- extraction uses the requested tab identity;
- errors include requested and actual tab identity where known;
- restricted pages and permission failures still use Spec 013 taxonomy.

### Validation Commands

Eventual implementation should run the relevant subset:

```text
cd raycast && npm test
cd raycast && npm run lint
cd raycast && npm run build
cd cli && GOCACHE=/tmp/mozeidon-go-build-cache go test ./...
cd firefox-addon && npm test
cd firefox-addon && npm run build
```

Run add-on and CLI commands only if those packages are changed.

## Manual Verification With Zen

1. **Read current active tab**
   - Open a normal webpage in Zen.
   - Run the active-tab AI/context path without `tabId` or `windowId`.
   - Confirm output identifies the active tab and does not report focus changes.

2. **Read non-active tab and restore focus**
   - Open two tabs in the same Zen window.
   - Focus tab A.
   - Request content for tab B with `restoreFocus: true`.
   - Confirm returned `requestedTab` and `actualTab` are tab B.
   - Confirm Zen focus returns to tab A.
   - Confirm `focusChanged: true`, `restoreFocus: true`, and `focusRestored: true`.

3. **Read non-active tab without restoring focus**
   - Focus tab A.
   - Request content for tab B with `restoreFocus: false`.
   - Confirm Zen remains focused on tab B.
   - Confirm `focusChanged: true`, `restoreFocus: false`, and `focusRestored` is absent.

4. **Attempt to read closed or missing tab**
   - Capture a tab ID, close the tab, then request content for the closed tab.
   - Confirm the result is `ok: false` with `tab_not_found`.
   - Confirm no fallback active-tab content is returned.

5. **Test multiple windows**
   - Open two Zen windows with active tabs.
   - Request a tab in the non-focused window with `restoreFocus: true`.
   - Confirm the requested window/tab is read.
   - Confirm original window/tab focus is restored when observable.

6. **Restricted page**
   - Request content from a browser-restricted page such as `about:config`.
   - Confirm activation succeeds or fails explicitly.
   - Confirm content usability follows Spec 013 and does not summarize title+URL fallback as page content.

7. **Batch workflow smoke test**
   - Request content for three tabs in sequence with `restoreFocus: true`.
   - Confirm each output reports matching requested/actual tab identity.
   - Confirm final Zen focus is the original tab.

## Rollout Plan

1. Add Raycast-side stabilization helper and tests around existing focus-then-read behavior.
2. Add target metadata to `zen_get_tab_content` outputs.
3. Keep existing active-tab commands unchanged.
4. Update docs and fixtures for new output metadata, including Spec 011 and `docs/zen-context/07-context-api.md` if implementation changes the public tool/context output.
5. Keep CLI/add-on/native behavior unchanged for Phase 1.
6. If direct tab-targeted CLI extraction is later feasible without transport or permission changes, add `mozeidon context tab` behind tests in a separate implementation phase.
7. Prefer direct targeted extraction once it is proven stable; keep focus-then-read fallback for compatibility.
8. Before MCP or batch tools, require target mismatch and restore-failure tests to pass.

## Migration And Rollback

Migration should be additive:

- existing active-tab commands and active `zen_get_tab_content` calls keep their current behavior;
- `restoreFocus` is optional and defaults by caller type;
- target metadata fields are added to targeted tool outputs without removing existing `source`, `markdown`, `text`, or `context` fields;
- unknown target metadata should be ignored by older consumers;
- stricter validation for partial tab targets is allowed because it prevents ambiguous reads.

Rollback should be safe:

- if stabilization causes regressions, disable the non-active targeted read path in Raycast and return a clear existing error such as `tab_not_found`, `target_tab_mismatch`, or `content_unavailable` for targeted requests;
- keep active-tab context reads enabled;
- keep input validation that rejects partial `tabId`/`windowId` targets so rollback does not reintroduce silent active-tab fallback;
- do not roll back by removing Spec 013 content-usability checks;
- direct CLI/add-on target extraction, if added in a later phase, should be guarded so Raycast can fall back to the stabilized focus-then-read path.

## Acceptance Criteria

- `zen_get_tab_content` does not silently read the wrong tab.
- AI tools can request context for a specific `tabId` and `windowId` reliably.
- The result includes `requestedTab`, `actualTab`, `focusChanged`, `restoreFocus`, `activation`, warnings where applicable, and `focusRestored` when restore was attempted.
- Batch and multi-tab workflows restore the original active tab by default.
- Target activation failure returns a clear error and does not return active-tab fallback content.
- Requested/actual tab mismatch returns a clear error for AI tools.
- Restore failure is reported clearly without discarding otherwise valid content.
- DOM content failures after successful target activation follow Spec 013 taxonomy and content-usability rules.
- Existing active-tab commands continue working.
- Mozeidon command arguments are passed safely without shell interpolation.
- No native messenger changes unless explicitly justified in an implementation update to this spec.
- No new browser permissions.

## Open Questions

- Can the Firefox-family add-on reliably execute context extraction against inactive tabs using the current permissions and APIs, or is temporary activation required for some pages?
- Should restore failure ever be a hard error for AI tools, or should it remain a warning unless a strict option is added?
- Should `window_not_found`, `tab_activation_failed`, `activation_timeout`, `target_tab_mismatch`, `focus_restore_failed`, and `focus_restore_mismatch` be added to Spec 013's final taxonomy table, or remain target-tab-specific codes in this spec?
- Should direct targeted CLI extraction be exposed as `context tab` or as target flags on `context active`?
- Should batch workflows optimize tab ordering to reduce visible focus changes when focus-then-read fallback is used?
