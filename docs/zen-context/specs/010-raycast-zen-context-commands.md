# Spec 010: Raycast Zen Context Commands

## Summary

Add native Raycast commands that consume the Mozeidon Zen Context API for current-page clipboard and AI workflows. The commands should let users copy active page Markdown, summarize the active page, ask a question about the active page, and smart-summarize either selected text or the active page without adding new browser, add-on, MCP, or site-adapter behavior.

## Status

- Implemented
- 2026-04-28: Implemented the Raycast helper layer, four native command entries, user-facing command views, source-attributed Markdown copying, Raycast AI result views, Ask Current Page form flow, and Smart Summarize context resolution with focused tests.

## Milestone

M2: Zen Context V1 Raycast Consumer

## Problem

The Mozeidon context API can expose active Zen page context, but users still need first-class Raycast commands for the common workflows that motivated Zen Context:

- copy the current page as prompt-friendly Markdown;
- summarize the page with Raycast AI;
- ask a page-grounded question from Raycast;
- summarize selected text when available and otherwise fall back to active page context.

These should be native Raycast commands, not private Raycast `{browser-tab}` integration spoofing, and they should reuse the existing Mozeidon context CLI instead of changing the add-on unless the API is proven insufficient.

## Goals

- Add four Raycast commands:
  - `Zen Context: Copy Current Page as Markdown`
  - `Zen Context: Summarize Current Page`
  - `Zen Context: Ask Current Page`
  - `Zen Context: Smart Summarize`
- Use the existing Raycast Mozeidon wrapper and argument-array command execution.
- Use `mozeidon context active --format markdown` for active page Markdown.
- Use Raycast AI for summarization and question answering when available.
- Show a graceful, actionable error when Raycast AI is unavailable.
- For Smart Summarize, use selected text when available and fall back to active page Markdown otherwise.
- Include source attribution in copied Markdown.
- Include basic copy actions in AI result views.
- Keep behavior scoped to the Raycast extension.
- Add focused tests that mock the Mozeidon wrapper and Raycast AI availability.

## Non-Goals

- No Mozeidon CLI, add-on, native messenger, or protocol changes unless the current context API is proven insufficient.
- No MCP wrapper or MCP tools.
- No AI Extension `@zen` tool surface.
- No site adapters or site-specific extraction rules.
- No persistent page-context cache, browsing memory, embeddings, or network fetches outside Raycast AI calls initiated by the user command.
- No broad browser permission changes unless implementation proves the existing context API cannot return real page content without them and this spec records the exception.
- No mutating browser actions.
- No replacement for Raycast's private `{browser-tab}` placeholder.

## Scope

Primary scope is the Raycast extension only:

- Raycast command entries and command files.
- Raycast-side context command helpers.
- Raycast-side Mozeidon wrapper calls.
- Raycast-side tests for command construction, context fallback, and AI-unavailable behavior.

Out of scope:

- `cli/` command changes.
- Firefox add-on changes.
- Native messenger changes.
- MCP packages or schemas.
- Site adapter registry or extraction rules.

If implementation discovers that `mozeidon context active --format markdown` or `mozeidon context selection` cannot provide enough data for the specified workflows, the implementer must document the gap and update this spec before changing lower layers.

## User Workflow

### Copy Current Page As Markdown

1. User focuses a normal Zen tab.
2. User runs `Zen Context: Copy Current Page as Markdown` in Raycast.
3. Raycast calls Mozeidon for active page Markdown.
4. Raycast copies Markdown with source attribution to the clipboard.
5. Raycast shows a success toast including the page title or domain when available.

If extraction fails, Raycast shows a clear error that distinguishes missing Zen/Mozeidon connectivity from unsupported or unextractable page content when the context error code allows it.

### Summarize Current Page

1. User focuses a normal Zen tab.
2. User runs `Zen Context: Summarize Current Page`.
3. Raycast fetches active page Markdown.
4. Raycast sends the page title, URL, and Markdown content to Raycast AI.
5. Raycast displays the summary in a native Raycast detail view or equivalent AI response surface.

If Raycast AI is unavailable, Raycast does not call Mozeidon repeatedly or fail cryptically. It shows an actionable error such as "Raycast AI is unavailable for this account or environment."

### Ask Current Page

1. User runs `Zen Context: Ask Current Page`.
2. Raycast prompts for a question.
3. After submit, Raycast fetches active page Markdown.
4. Raycast asks Raycast AI to answer using only the fetched page context where practical.
5. Raycast displays the answer with source title and URL metadata when available.

The question is user-derived input. It must be passed only to Raycast AI and must not be interpolated into shell command strings.

### Smart Summarize

1. User optionally selects text in Zen or another active context Raycast can access.
2. User runs `Zen Context: Smart Summarize`.
3. Raycast first attempts to use selected text.
4. If selected text is available and non-empty after trimming, Raycast summarizes that selection.
5. If no selected text is available, Raycast fetches active page Markdown and summarizes the page.

Selection fallback must be deterministic and tested. Permission-unavailable Zen selection must not be treated as a definite empty selection, and Raycast selected-text fallback must not require new host permissions.

## Proposed Design

Add separate Raycast commands rather than one overloaded command. These workflows have different inputs and result handling, so separate commands keep Raycast search clear and make tests simpler.

### Shared Context Helper

Add or extend a Raycast helper for context retrieval:

```ts
type RaycastZenContext = {
  title?: string;
  url?: string;
  markdown?: string;
  selectionText?: string;
  warnings?: string[];
};

async function getActivePageMarkdown(): Promise<RaycastZenContext>;
async function getCurrentSelectionText(): Promise<RaycastZenContext>;
```

`getActivePageMarkdown` should call:

```text
mozeidon context active --format markdown
```

`getCurrentSelectionText` should call the context selection API exposed by Specs 007 and 008:

```text
mozeidon context selection
```

Both helpers should use the existing safe Mozeidon wrapper so profile handling and binary path errors remain consistent with the rest of the extension.

### Context Parsing

Raycast should parse the structured JSON context object and derive:

- page title from `page.title` when available;
- page URL from `page.url` when available;
- active Markdown from `content.markdown`;
- selected text from `content.selection.text` or the implemented equivalent field in the Spec 007/008 contract;
- warning codes for degraded states.

If the CLI returns structured `ok: false`, Raycast should map the error code to a user-facing message and avoid passing empty context to AI.

If the CLI returns `ok: true` with `status: "empty"` or no usable Markdown/selection, Raycast should show a clear "No page content available" or use fallback behavior where specified.

### Copy Current Page As Markdown

Implementation behavior:

1. Fetch active page Markdown.
2. Require non-empty `markdown`.
3. Build clipboard Markdown with source attribution.
4. Show success or error toast.

The default copy output should include source attribution. If `content.markdown` does not already include the page title and URL, prepend a small source header:

```markdown
# <page title>

Source: <page url>

<content.markdown>
```

If the context API already includes equivalent source attribution, Raycast should avoid duplicating it. The implementation may use a conservative check, and duplicate attribution is preferable to omitting source information.

Do not silently present title and URL fallback as real page Markdown. If only tab metadata fallback is available, show a warning or require confirmation before copying metadata-only output. AI summarization commands must require real page content and must not summarize title/URL fallback as though it were page content.

### Summarize Current Page

Implementation behavior:

1. Check Raycast AI availability using the supported Raycast API for the installed SDK version.
2. If unavailable, show a graceful error and stop.
3. Fetch active page Markdown.
4. Require non-empty Markdown.
5. Prompt Raycast AI to produce a concise summary grounded in the supplied context.
6. Display the result in a Raycast view.

The AI prompt should include title and URL as metadata when available, but the Markdown body is the source of page content.

The result view should include a focused `ActionPanel` with at least:

- `Copy Summary`
- `Copy Source URL` when a source URL is available

Optional actions may be added only if they are simple and do not overbuild the first implementation:

- `Copy Summary as Markdown`
- `Open/Focus Source Tab`
- `Regenerate`

### Ask Current Page

Implementation behavior:

1. Render a Raycast form with a required question field.
2. On submit, check Raycast AI availability.
3. Fetch active page Markdown.
4. Require non-empty Markdown.
5. Ask Raycast AI to answer the question using the supplied page context.
6. Display the answer and source metadata.

The question must not affect the Mozeidon CLI arguments. The Mozeidon call remains fixed to active page Markdown retrieval.

The answer view should include at least:

- `Copy Summary` or equivalent copy-answer action label appropriate to the view content
- `Copy Source URL` when a source URL is available

### Smart Summarize

Implementation behavior:

1. Check Raycast AI availability.
2. Attempt to retrieve Mozeidon/Zen selection.
3. Use Zen selection only if it is real DOM selection data and contains non-empty text.
4. If Zen selection is unavailable, permission-blocked, or empty, try Raycast `getSelectedText()`.
5. If Raycast selected text exists, combine it with active Zen tab metadata when available so the summary still has source title and URL.
6. If no selected text exists, fetch active page Markdown and summarize that.
7. If active page content is unavailable and only title/URL fallback exists, show a permission/setup message instead of summarizing fallback metadata.
8. In the result view or subtitle, indicate whether the summary used Zen selection, Raycast selected text, or active page context.

Selection retrieval errors should be classified:

- real empty Zen selection: try Raycast selected text, then fall back to page Markdown;
- permission-unavailable or unsupported Zen selection: do not treat it as a definite empty selection; try Raycast selected text, then fall back to page Markdown when safe;
- Mozeidon connectivity, invalid profile, or malformed JSON: show the error instead of hiding a real integration failure.

Raycast selected-text fallback must use Raycast's SDK capability and must not add host permissions or lower-layer browser permission requirements.

## API Or Contract

### Raycast Commands

Add four command entries to the Raycast extension manifest:

```text
Zen Context: Copy Current Page as Markdown
Zen Context: Summarize Current Page
Zen Context: Ask Current Page
Zen Context: Smart Summarize
```

The exact internal command names may follow existing Raycast naming conventions, but visible names should stay close to the labels above.

### Mozeidon CLI Calls

Active page Markdown:

```text
mozeidon context active --format markdown
```

Selection:

```text
mozeidon context selection
```

All calls must go through the existing argument-array wrapper with optional `--profile-id` support, producing effective commands equivalent to:

```text
mozeidon --profile-id <profile> context active --format markdown
mozeidon --profile-id <profile> context selection
```

when a profile is configured.

### AI Availability

Raycast AI calls must use the public Raycast SDK API available to the project version. Before implementation, inspect the installed `@raycast/api` version and TypeScript definitions.

Preferred API:

```ts
import { AI, environment } from "@raycast/api";

environment.canAccess(AI);
await AI.ask(prompt, options);
```

If `environment.canAccess(AI)` is unavailable in the installed `@raycast/api` version, fall back to calling `AI.ask` inside `try`/`catch` and showing a graceful failure state when AI is unavailable.

The implementation should centralize availability detection behind a small helper so tests can mock:

```ts
async function assertRaycastAiAvailable(): Promise<void>;
```

If AI is unavailable, the commands should show a user-facing error and avoid making partial AI calls.

Do not add external AI dependencies, user API keys, MCP, or a separate AI provider. Do not implement streaming for V1 unless it is already straightforward in the installed Raycast SDK. A simple `await AI.ask(prompt, options)` flow is enough.

### Prompt Contract

Summarization prompts should include:

- instruction to summarize only the supplied context;
- title and URL when available;
- selected text or page Markdown;
- a request for concise output suitable for Raycast display.

Question-answering prompts should include:

- instruction to answer using the supplied page context;
- instruction to say when the answer is not present in the context;
- user question;
- title, URL, and page Markdown.

Do not include hidden browsing state, tab lists, history, bookmarks, or local files in AI prompts for this spec.

AI prompts must require real page or selection content. If only source title and URL are available, commands should show a permission/setup message instead of asking Raycast AI to summarize metadata-only fallback.

## Security And Permissions

- User-derived inputs:
  - Ask Current Page question.
  - Raycast command invocation and preferences.
- Page-derived inputs:
  - title, URL, Markdown, selected text, and warnings returned by Mozeidon context API.
- Command execution:
  - Use existing `execFile`/`spawn` argument-array helpers.
  - Do not use shell-string command construction.
  - Do not pass the user's question or page Markdown as CLI arguments.
- Browser permissions:
  - No new browser permissions except the documented `<all_urls>` Firefox/Zen host-permission exception needed for native-message initiated context extraction.
  - Respect context API permission and unsupported-page errors.
- Destructive actions:
  - None. All commands are read-only except clipboard writes initiated by the copy command.
- Storage:
  - Do not persist page content, selected text, questions, prompts, or AI responses outside normal Raycast transient command state.
- Network behavior:
  - Mozeidon context retrieval remains local.
  - Raycast AI commands may transmit supplied page context and user questions through Raycast AI. This is user-initiated by running an AI command.
  - Copy Current Page as Markdown must not invoke Raycast AI.

## Alternatives Considered

- Use Raycast `{browser-tab}` placeholders: rejected because the project explicitly avoids private Raycast browser integration spoofing.
- Add AI Extension `@zen` tools first: rejected for this spec because native Raycast commands are the next user-facing step and can validate the context API before broader tool surfaces.
- Add MCP tools now: rejected because MCP is explicitly out of scope and should wrap stable behavior later.
- Implement site adapters first: rejected because the baseline active page Markdown workflow should work before site-specific extraction.
- Add a single "Zen Context" command with actions: rejected for the first version because copy, summarize, ask, and smart summarize have different input and output flows.

## Test Plan

Automated Raycast tests:

- Mock the Mozeidon wrapper for `context active --format markdown`.
- Verify Copy Current Page calls the wrapper with the expected argument array and copies returned Markdown.
- Verify Summarize Current Page uses active page Markdown and handles missing/empty content.
- Verify Ask Current Page keeps the user question out of Mozeidon arguments and passes it only to the AI helper.
- Mock selection retrieval for Smart Summarize and verify selected text is used when present.
- Mock no-selection, empty-selection, or selection-unavailable responses and verify fallback to active page Markdown.
- Mock permission-unavailable Zen selection and verify it is not treated as an empty selection before trying Raycast selected text.
- Mock Raycast `getSelectedText()` and verify Smart Summarize combines selected text with active Zen tab metadata when available.
- Mock metadata-only active page fallback and verify AI commands do not summarize it as real page content.
- Mock Raycast AI unavailable behavior and verify AI commands show a graceful error without attempting an AI request.
- Verify AI availability helper uses `environment.canAccess(AI)` when available and gracefully handles the `AI.ask` try/catch fallback path when not.
- Verify AI result views expose `Copy Summary` and `Copy Source URL` when source URL is available.
- Mock malformed CLI JSON and structured context errors where existing error helpers support it.

Validation commands:

```text
cd raycast
npm run lint
npm run build
```

If the Raycast package has a focused test script at implementation time, run that as well.

## Manual Verification

Run each command against a normal Zen tab:

```text
Zen Context: Copy Current Page as Markdown
Zen Context: Summarize Current Page
Zen Context: Ask Current Page
Zen Context: Smart Summarize
```

Verify:

- Copy command places Markdown on the clipboard.
- Summarize command returns a useful summary.
- Ask command prompts for a question and answers from page context.
- Smart Summarize uses active page context when there is no selection.

Run against selected text:

- Select a paragraph in Zen.
- Run `Zen Context: Smart Summarize`.
- Verify the summary is based on the selection rather than the full page.

Run against a page that cannot be extracted:

- Use a privileged, internal, unsupported, or otherwise unextractable page.
- Verify copy and AI commands show clear errors.
- Verify AI commands do not submit empty or known-invalid context to Raycast AI.

## Rollout Plan

1. Add shared Raycast context retrieval and AI availability helpers.
2. Add `Copy Current Page as Markdown`.
3. Add `Summarize Current Page`.
4. Add `Ask Current Page`.
5. Add `Smart Summarize` with selection fallback.
6. Add tests for wrapper calls, fallback behavior, and AI-unavailable behavior.
7. Run Raycast lint/build and manual Zen verification.

Ship behind normal Raycast command discovery. No migration is required because this spec adds new commands only.

## Progress Log

- 2026-04-28: Added test-covered Raycast-only helper modules for:
  - `mozeidon context active --format markdown` and `mozeidon context selection` argument construction/parsing;
  - source-attributed copy Markdown formatting;
  - real-content enforcement so metadata-only title/URL fallback is not summarized as page content;
  - summary and ask prompt construction;
  - Raycast AI availability and `AI.ask` graceful failure handling;
  - Smart Summarize selection resolution across Zen DOM selection, Raycast selected text, and active page Markdown.
- 2026-04-28: Did not add `package.json` command entries or command view files in this pass because the implementation request said not to add new Raycast commands.
- 2026-04-28: Tightened Smart Summarize context resolution so Raycast selected text falls back to active Zen page metadata when Zen selection metadata is missing, and recoverable Zen selection exceptions still allow Raycast selected-text fallback.
- 2026-04-28: Validation after fixes: `cd raycast && npm test` passed with 68 tests. `npm run lint` and `npm run build` passed outside the sandbox; sandboxed lint could not resolve Raycast schema/user endpoints and sandboxed build hit a Raycast CLI nil-pointer runtime error.
- 2026-04-28: Added the four native Raycast command entries and command files:
  - `Zen Context: Copy Current Page as Markdown`;
  - `Zen Context: Summarize Current Page`;
  - `Zen Context: Ask Current Page`;
  - `Zen Context: Smart Summarize`.
- 2026-04-28: Added command-core tests for source-attributed Markdown copying, metadata-only refusal, Raycast AI unavailable behavior, and Ask Current Page question handling.
- 2026-04-28: Validation after command implementation: `cd raycast && npm test` passed with 74 tests. `npm run lint` and `npm run build` passed outside the sandbox; sandboxed lint could not resolve Raycast schema/user endpoints and sandboxed build hit a Raycast CLI nil-pointer runtime error.
- 2026-04-28: Addressed review gaps by handling `AI.ask` unavailable failures gracefully in Smart Summarize, distinguishing Zen selection, Raycast selection, and active page summaries in the result title, and updating stale status text.
- 2026-04-28: Manual testing found that the configured `/opt/homebrew/bin/mozeidon` can be older than this fork and may not expose the `context` command. Raycast now preserves CLI stderr and maps `unknown command "context"` failures to an actionable setup error instead of showing a child-process stack trace.
- 2026-04-28: Manual testing found that a current CLI can still fail when the native app IPC/profile connection is unavailable (`Cannot read via ipc with host: ...`). Command flows now map that failure to a graceful Mozeidon/Zen setup error instead of surfacing a Raycast stack trace.
- 2026-04-28: Validation after IPC error handling: `cd raycast && npm test` passed with 85 tests. `npm run lint` and `npm run build` passed outside the sandbox. Sandboxed lint could not resolve Raycast network schema/user endpoints, and sandboxed build hit the Raycast CLI nil-pointer runtime error.
- 2026-04-28: Manual testing exposed two context API insufficiencies outside Raycast scope: profile-id lookup could choose an older matching native-app IPC record, and `context active` could deadlock while waiting for a missing `get-context` IPC response. The CLI now prefers the best matching profile record and bounds `get-context` waiting before falling back to tab metadata.
- 2026-04-28: Validation after CLI hardening: `cd cli && go test ./...`, `cd raycast && npm test`, `cd raycast && npm run lint`, and `cd raycast && npm run build` passed outside the sandbox. Rebuilt `/Users/jarnolouhelainen/.local/bin/mozeidon`; `context selection` and `context active --format markdown` now return structured partial context instead of IPC/deadlock failures.
- 2026-04-28: Manual testing found the Raycast parser still assumed `content.markdown` and `content.text` were strings, while the context API returns structured `{ value, length, truncated }` objects. Raycast now extracts `.value`, includes `extraction.warnings`, and treats `extraction.contentSource: "tab-metadata"` as metadata-only so AI commands do not summarize title/URL fallback.
- 2026-04-28: Validation after structured content parsing fix: `cd raycast && npm test` passed with 87 tests. `cd raycast && npm run lint` and `cd raycast && npm run build` passed outside the sandbox.
- 2026-04-28: Manual testing reproduced an additional native-app lifecycle race: `context selection` could succeed, then `context active` could immediately fail because the native app profile disappeared or re-registered under a new IPC host. The CLI now retries profile lookup and IPC connection together so Smart Summarize's selection-to-page fallback sequence can survive native profile rotation.
- 2026-04-28: Validation after native profile retry hardening: `cd cli && go test ./...`, `cd raycast && npm test`, `cd raycast && npm run lint`, and `cd raycast && npm run build` passed outside the sandbox. Rebuilt `/Users/jarnolouhelainen/.local/bin/mozeidon`; five sequential `context selection` plus `context active --format markdown` pairs completed successfully with the explicit Zen profile id.
- 2026-04-28: Manual testing confirmed the active tab is the Wikipedia Raycast page, but context extraction remains metadata-only because the Firefox/Zen add-on lacks host permission for normal web pages. The add-on manifest now includes `<all_urls>` for the Firefox/Zen build so native-message initiated context extraction can execute on pages; `activeTab` alone would not cover Raycast-triggered native-message calls because there is no browser extension user gesture.
- 2026-04-28: Reloading the unpacked add-on can rotate the Mozeidon profile id, making a previously configured Raycast profile preference stale. Raycast context reads now retry once without the configured profile id when the CLI returns `profile_not_found`, so a single current default Zen profile can recover automatically during development.
- 2026-04-29: Manual testing showed Smart Summarize ignored valid Zen selection payloads from the add-on because the add-on marks `window.getSelection()` content as `source: "user-selection"` and focused input selections as `source: "focused-input"`, while Raycast only accepted `source: "dom"`. Smart Summarize and AI tools now treat both add-on sources as real Zen DOM selection data when text is present.
- 2026-04-29: Independent review tightened error semantics and security docs: context CLI connection failures are now classified as `native_messaging_unavailable` instead of `profile_not_found`, Raycast context parsing ignores malformed non-string content values, and the documented `<all_urls>` permission exception is reflected in the security guidance.

## Resolved Decisions

- Inspect the installed `@raycast/api` version and TypeScript definitions before implementation. Prefer `environment.canAccess(AI)` plus `AI.ask`; fall back to `AI.ask` in `try`/`catch` if availability checks are not supported.
- AI result views should include `Copy Summary` and `Copy Source URL` when source URL is available.
- Copy Current Page as Markdown should include source attribution by default and must not silently treat title/URL metadata fallback as real page Markdown.
- Smart Summarize should try real Zen DOM selection first, then Raycast `getSelectedText()`, then active page Markdown. Metadata-only fallback should produce a permission/setup message rather than an AI summary.
