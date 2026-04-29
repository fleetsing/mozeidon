# Zen Context for Raycast and Zen Browser

This repository is a personal fork of upstream [egovelox/mozeidon](https://github.com/egovelox/mozeidon). It keeps the Mozeidon browser add-on, native app, and CLI architecture, but the focus of this fork is now broader than the original bundled Raycast extension:

- make Mozeidon work well with Zen Browser on macOS;
- expose active-page and selected-text context from Zen;
- provide first-class Raycast commands for page Markdown, summaries, and page-grounded questions;
- expose `@zen` Raycast AI Extension tools for inspecting and controlling Zen through local Mozeidon APIs.

The Raycast extension in this fork is named **Zen Context**. The underlying executable and browser bridge are still named **Mozeidon**.

## What changed from upstream Mozeidon

Compared with the original upstream project, this fork adds or changes:

- **Zen-first Raycast identity**
  - Raycast package name is `zen`.
  - Visible extension title is `Zen Context`.
  - Raycast AI mention is `@zen`.

- **Zen activation**
  - The Raycast extension activates Zen by bundle ID: `app.zen-browser.zen`.
  - The default browser open command is `open -b app.zen-browser.zen`.

- **Safer Raycast command execution**
  - Raycast-side Mozeidon calls use argument arrays instead of shell interpolation.
  - User-derived strings such as URLs, questions, and page selections are not interpolated into shell command strings.

- **Profile targeting**
  - The Raycast extension can pass a Mozeidon profile ID or profile alias to CLI commands.
  - The CLI is hardened around profile/native-app rotation during development.

- **Zen Context CLI API**
  - `mozeidon context active`
  - `mozeidon context selection`
  - `mozeidon context metadata`
  - `mozeidon context links`
  - Supported formats include `json`, `markdown`, and `text`.

- **Zen page extraction**
  - The Firefox-family add-on includes a context extraction service for active page content, selection, metadata, and links.
  - The add-on manifest uses the documented `<all_urls>` host-permission exception so Raycast-triggered native-message extraction can read normal web pages.

- **Native Raycast commands**
  - `Zen Tabs`
  - `Zen History`
  - `Zen Context: Copy Current Page as Markdown`
  - `Zen Context: Summarize Current Page`
  - `Zen Context: Ask Current Page`
  - `Zen Context: Smart Summarize`

- **Raycast AI Extension tools**
  - `zen_get_active_context`
  - `zen_get_selection_or_page`
  - `zen_list_tabs`
  - `zen_search_tabs`
  - `zen_get_tab_content`
  - `zen_open_or_focus_url`

- **Testing and specs**
  - Zen Context specs live in `docs/zen-context/specs/`.
  - Raycast unit tests cover command construction, context parsing, AI unavailable behavior, selection fallback, tool behavior, and eval prompt coverage.
  - Go tests cover context API behavior, IPC timeout/failure handling, and profile selection.

## Architecture

Zen Context still uses the Mozeidon architecture:

1. The Zen/Firefox-family browser add-on runs in Zen.
2. The Mozeidon native app bridges browser native messaging to local IPC.
3. The Mozeidon CLI talks to the native app.
4. The Raycast extension calls the local CLI.
5. Raycast commands and Raycast AI tools display or send the resulting context only when you invoke them.

The native app is not a feature surface in this fork. Feature behavior is implemented in the Raycast extension, CLI, and browser add-on.

## Requirements

These instructions assume:

- macOS;
- Zen Browser;
- Raycast;
- Homebrew;
- Git;
- Go 1.21.1 or newer;
- Node.js 22 or newer;
- npm 10 or newer.

Raycast AI features also require a Raycast account with Raycast AI access.

## Install This Customized Version

### 1. Clone the fork

```bash
git clone https://github.com/fleetsing/mozeidon.git
cd mozeidon
```

If you are using your own fork, replace the URL with your fork URL.

### 2. Build and install the customized CLI

The context API is implemented in this repository, so use this fork's CLI rather than the upstream Homebrew `mozeidon` binary.

```bash
mkdir -p "$HOME/.local/bin"
cd cli
go build -o "$HOME/.local/bin/mozeidon" .
cd ..
```

Make sure this path is available:

```bash
"$HOME/.local/bin/mozeidon" --help
```

You can also add it to your shell path:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

### 3. Install the Mozeidon native app

The native app is a separate upstream component and was not forked for these changes.

```bash
brew tap egovelox/homebrew-mozeidon
brew install egovelox/mozeidon/mozeidon-native-app
```

Confirm the path:

```bash
command -v mozeidon-native-app
```

### 4. Register native messaging for Zen/Firefox

Create the Mozilla native-messaging manifest used by Firefox-family browsers:

```bash
mkdir -p "$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"

MOZEIDON_NATIVE_APP="$(command -v mozeidon-native-app)"

cat > "$HOME/Library/Application Support/Mozilla/NativeMessagingHosts/mozeidon.json" <<JSON
{
  "name": "mozeidon",
  "description": "Native messaging add-on to interact with your browser",
  "path": "$MOZEIDON_NATIVE_APP",
  "type": "stdio",
  "allowed_extensions": ["mozeidon-addon@egovelox.com"]
}
JSON
```

If Zen does not find the host through the Mozilla location on your machine, also mirror it into Zen's native-messaging directory:

```bash
mkdir -p "$HOME/Library/Application Support/zen/NativeMessagingHosts"
ln -sf \
  "$HOME/Library/Application Support/Mozilla/NativeMessagingHosts/mozeidon.json" \
  "$HOME/Library/Application Support/zen/NativeMessagingHosts/mozeidon.json"
```

### 5. Build and load the customized Zen/Firefox add-on

The AMO Mozeidon add-on can be useful for baseline tab/bookmark behavior, but the Zen Context page extraction work in this fork requires this repository's Firefox-family add-on.

```bash
cd firefox-addon
npm install
npm run build
cd ..
```

Load it in Zen:

1. Open Zen.
2. Go to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select `firefox-addon/manifest.json` from this repository.
5. Keep Zen running while testing.

Temporary add-ons are removed when the browser restarts. Reload this add-on after restarting Zen unless you package and install it permanently yourself.

### 6. Verify the CLI and add-on connection

With Zen running and the customized add-on loaded, run:

```bash
"$HOME/.local/bin/mozeidon" profiles get
"$HOME/.local/bin/mozeidon" tabs get --with-windows
```

Open a normal web page in Zen, then verify page context:

```bash
"$HOME/.local/bin/mozeidon" context active --format markdown
```

Select text in the page and verify selection context:

```bash
"$HOME/.local/bin/mozeidon" context selection
```

If you see only title/URL metadata for normal pages, check that the customized add-on is loaded and that Zen granted the host permission.

### 7. Install and run the Raycast extension

The Raycast extension lives in `raycast/`.

```bash
cd raycast
npm install
```

If you want to use Raycast AI Extension evals or tool workflows, make sure the Raycast CLI is logged in:

```bash
npx ray login
```

Run the extension in development mode:

```bash
npm run dev
```

Raycast will build the local extension and show the `Zen Context` commands while the dev server is running.

After Raycast has imported the development extension, you can stop `npm run dev` with `Ctrl-C`. If Raycast later stops showing the local extension or you change code, run `npm run dev` again.

You can also run a production-style local build:

```bash
npm run build
```

### 8. Configure Raycast preferences

Open Raycast preferences for **Zen Context** and set:

- **Mozeidon CLI filepath**
  - Recommended for this fork: `/Users/<you>/.local/bin/mozeidon`
  - Or use the output of: `command -v mozeidon`

- **Browser command**
  - `open -b app.zen-browser.zen`

- **Mozeidon Profile ID or Alias**
  - Optional, but recommended if you have more than one browser profile.
  - Use `mozeidon profiles get` to find the profile ID or alias.

- **Search Engine**
  - Choose the search engine used when opening free-text queries from Raycast.

## Use The Raycast Commands

### Zen Tabs

Searches open tabs, recently closed tabs, and bookmarks from Zen.

Typical actions:

- switch to an open tab;
- reopen a recently closed tab;
- open a bookmark;
- open a new tab or search query;
- close supported open-tab results.

### Zen History

Searches Zen history through Mozeidon and opens selected history items.

### Zen Context: Copy Current Page as Markdown

Fetches active Zen page Markdown through:

```bash
mozeidon context active --format markdown
```

The copied output includes source attribution:

```markdown
# Page Title

Source: https://example.com/page

Page Markdown...
```

If real page content cannot be extracted and only title/URL metadata is available, the command refuses to present that metadata as real Markdown.

### Zen Context: Summarize Current Page

Fetches active page Markdown and asks Raycast AI for a summary.

The result view includes actions to copy the summary and copy the source URL when available.

If Raycast AI is unavailable for your account or environment, the command shows a graceful unavailable state instead of failing with a raw SDK error.

### Zen Context: Ask Current Page

Prompts for a question, fetches active page Markdown, and asks Raycast AI to answer using the page context.

The question is sent only to Raycast AI. It is not passed to the shell or interpolated into Mozeidon commands.

### Zen Context: Smart Summarize

Chooses context in this order:

1. Zen DOM/page selection from Mozeidon, when available and non-empty.
2. Raycast selected text, when Zen selection is permission-unavailable or empty.
3. Raycast selected text plus active Zen title/URL metadata when available.
4. Active Zen page Markdown.
5. If only title/URL fallback exists, show a setup/content-unavailable message.

This command is useful when selecting text in Zen or another app and wanting the best available source-aware summary.

## Use `@zen` In Raycast AI

The extension exposes Raycast AI tools when Raycast sees the local extension as `Zen Context`.

Example prompts:

```text
@zen summarize the active tab
@zen explain the selected text
@zen list open tabs
@zen find the GitHub pull request tab
@zen summarize the tab with "release notes" in the title
@zen open https://developer.mozilla.org/en-US/docs/Web/API in Zen
```

Initial tools:

- `zen_get_active_context`
  - Gets active Zen tab content and source metadata.

- `zen_get_selection_or_page`
  - Gets Zen selection, Raycast selected text, or active page content.

- `zen_list_tabs`
  - Lists open Zen tabs with stable tab/window metadata.

- `zen_search_tabs`
  - Searches open Zen tabs by title and URL.

- `zen_get_tab_content`
  - Gets content for the active tab or an unambiguous identified tab.

- `zen_open_or_focus_url`
  - Opens an HTTP(S) URL in Zen or focuses an already-open matching tab.

The first tool set excludes destructive actions. It does not close tabs, delete history, mutate bookmarks, or clear browsing data.

## Useful CLI Commands

Tabs:

```bash
mozeidon tabs get --with-windows
mozeidon tabs get --closed
mozeidon tabs switch <windowId>:<tabId>
mozeidon tabs new -- https://example.com
```

Profiles:

```bash
mozeidon profiles get
mozeidon --profile-id <profile-id-or-alias> tabs get
```

Context:

```bash
mozeidon context active --format json
mozeidon context active --format markdown
mozeidon context active --format text
mozeidon context selection
mozeidon context metadata
mozeidon context links
```

## Troubleshooting

### Raycast says Mozeidon cannot be found

Set **Mozeidon CLI filepath** in Raycast preferences to this fork's built CLI:

```text
/Users/<you>/.local/bin/mozeidon
```

### CLI returns `profile_not_found`

Run:

```bash
mozeidon profiles get
```

Then either:

- update the Raycast **Mozeidon Profile ID or Alias** preference; or
- leave the preference empty if only one current Zen profile is active.

During development, reloading the temporary add-on can rotate profile/native-app registration. Restarting Zen and reloading the add-on usually refreshes the profile list.

### CLI returns `native_messaging_unavailable`

Check:

1. Zen is running.
2. The customized add-on is loaded.
3. The native-messaging manifest exists.
4. The manifest path points to the real `mozeidon-native-app`.
5. `mozeidon profiles get` returns a current profile.

### Context extraction returns only title and URL

For normal web pages, page content requires the customized Firefox-family add-on from this repository and its `<all_urls>` host permission.

Reload the local add-on from `firefox-addon/manifest.json`, then rerun:

```bash
mozeidon context active --format markdown
```

### `@zen` cannot access tools

Check:

1. `raycast/package.json` has `"name": "zen"`.
2. The local extension has been rebuilt with `npm run dev` or `npm run build`.
3. You are logged in to Raycast CLI with `npx ray login`.
4. Raycast AI is available for your account.

### Raycast shows both Mozeidon and Zen Context

Older local development builds may still be installed under the old `mozeidon` extension identity. Remove or ignore the old development extension in Raycast and use **Zen Context**.

## Development And Validation

Run Go tests:

```bash
cd cli
GOCACHE=/tmp/mozeidon-go-build go test ./...
```

Build the Firefox-family add-on:

```bash
cd firefox-addon
npm install
npm run build
```

Run Raycast tests:

```bash
cd raycast
npm install
npm test
```

Run Raycast lint and build:

```bash
cd raycast
npm run lint
npm run build
```

Run Raycast AI evals:

```bash
cd raycast
env PATH="$PWD/node_modules/.bin:$PATH" ./node_modules/.bin/ray evals --skipBuild
```

## Documentation

Zen Context planning and specs live in:

- `docs/zen-context/00-project-brief.md`
- `docs/zen-context/01-current-architecture.md`
- `docs/zen-context/02-goals-and-non-goals.md`
- `docs/zen-context/03-roadmap.md`
- `docs/zen-context/05-security-and-permissions.md`
- `docs/zen-context/specs/010-raycast-zen-context-commands.md`
- `docs/zen-context/specs/011-ai-extension-tools.md`

The upstream CLI reference remains useful for baseline Mozeidon commands:

- `CLI_REFERENCE.md`

## Upstream Links

- Upstream repository: https://github.com/egovelox/mozeidon
- Native app: https://github.com/egovelox/mozeidon-native-app
- Upstream Raycast Store entry: https://www.raycast.com/egovelox/mozeidon
- Zen Browser: https://zen-browser.app/

## License

This repository follows the upstream project license unless noted otherwise.

The Zen logos and icons are licensed under CC BY-NC-SA 4.0:
https://github.com/zen-browser/branding-archive
