# Zen Context for Raycast and Zen Browser

**Zen Context** turns [Zen Browser](https://zen-browser.app/) into a local, scriptable context source for [Raycast](https://www.raycast.com/) and for AI tools. With it you can, all from Raycast:

- search and switch Zen tabs, reopen recently closed tabs, and search bookmarks and history;
- copy the active page as Markdown, summarize it, or ask a question about it with Raycast AI;
- let an AI agent — Raycast's own `@zen` AI Extension, or any [MCP](https://modelcontextprotocol.io) client such as Claude Code or Claude Desktop — read what's open in Zen (active tab, selection, open tabs) when you ask it to.

Everything runs locally and only on request: a Zen/Firefox-family browser add-on talks to a small native app, a Go CLI (`mozeidon`) talks to that native app, and the Raycast extension (plus an optional [MCP server](#mcp-server-optional)) builds on top of the CLI. No browsing data leaves your machine unless you explicitly trigger a Raycast AI command or ask an MCP client you've configured to use it.

This repository is a personal fork of upstream [egovelox/mozeidon](https://github.com/egovelox/mozeidon). It keeps the Mozeidon browser add-on, native app, and CLI architecture, but the focus of this fork is now broader than the original bundled Raycast extension:

- make Mozeidon work well with Zen Browser on macOS;
- expose active-page and selected-text context from Zen;
- provide first-class Raycast commands for page Markdown, summaries, and page-grounded questions;
- expose `@zen` Raycast AI Extension tools for inspecting and controlling Zen through local Mozeidon APIs;
- expose the same read-only context to any MCP client through a standalone `mcp-server/` package.

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

- **MCP server**
  - A standalone `mcp-server/` package (`zen-mcp-server`) exposes the same context API, minus the one mutating tool, to any MCP client — see [MCP Server (optional)](#mcp-server-optional).

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

Any MCP client (Claude Code, Claude Desktop, etc.) can reach the same context through `mcp-server/` instead of steps 4–5, by calling the CLI directly rather than going through Raycast — see [MCP Server (optional)](#mcp-server-optional).

The native app is not a feature surface in this fork. Feature behavior is implemented in the Raycast extension, CLI, and browser add-on.

Note: `chrome-addon/` is inherited from upstream and is not maintained in this fork. It has no Zen Context extraction service, so the `mozeidon context` commands and page-content Raycast/AI features do not work against Chromium browsers.

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
  "allowed_extensions": ["mozeidon-zen@fleetsing.github.io", "mozeidon-addon@egovelox.com"]
}
JSON
```

`mozeidon-zen@fleetsing.github.io` is this fork's add-on; `mozeidon-addon@egovelox.com` is the upstream AMO add-on, kept so either one can connect.

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

Temporary add-ons are removed when the browser restarts. Reload this add-on after restarting Zen unless you package and install it permanently yourself (see below).

#### Installing it permanently (recommended once you're done actively changing the add-on)

Temporary loading is convenient for development, but it's a real annoyance for daily use: every Zen restart drops the add-on, and Zen silently falls back to the plain AMO Mozeidon add-on (if installed), which lacks the `<all_urls>` permission this fork needs for page content/selection extraction. Tab/bookmark/history commands keep working, but page context silently stops.

Zen and Firefox only permanently install add-ons signed by Mozilla. This fork's add-on has its own ID (`mozeidon-zen@fleetsing.github.io`) so it can be signed through AMO's **unlisted** channel: Mozilla signs it, but nothing is published on addons.mozilla.org. See [Spec 023](docs/zen-context/specs/023-signed-firefox-addon.md).

1. Create AMO API credentials at <https://addons.mozilla.org/developers/addon/api/key/>. Signing under the fork's ID requires the AMO account that first signed it; anyone else forking this repo should change `browser_specific_settings.gecko.id` in `firefox-addon/manifest.json` to their own ID first (and add it to the native-messaging manifest above).
2. Bump `version` in `firefox-addon/manifest.json` if this version has already been signed. AMO never signs the same version twice.
3. Sign:

   ```bash
   cd firefox-addon
   export WEB_EXT_API_KEY="user:..."   # JWT issuer
   export WEB_EXT_API_SECRET="..."     # JWT secret
   npm run sign
   cd ..
   ```

   This builds the add-on, lints it, uploads it together with its readable source (the bundle is minified), and waits for AMO to sign it. The signed `.xpi` is written to `firefox-addon/web-ext-artifacts/`. If it times out waiting for approval, download the signed file from the AMO developer hub later.
4. In Zen's `about:addons`, remove any older `mozeidon` entries: the unsigned build from earlier instructions and the AMO Mozeidon add-on. They have a different ID, so the new one won't replace them, and only one add-on should talk to the native app.
5. If you previously disabled signature checks, restore them in `about:config`: `xpinstall.signatures.required` → `true` and `extensions.experiments.enabled` → `false`. Then restart Zen.
6. In `about:addons`, click the gear icon (⚙️) → **Install Add-on From File…** and select the signed `.xpi`. Approve the permission and data-collection prompts.

Confirm afterward in `about:addons` that there's a single Mozeidon entry with the full permission set, including "Access your data for all websites", and that it survives a Zen restart.

To update later, bump the version, run `npm run sign` again, and install the new `.xpi` over the old one.

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

Raycast will build the local extension and show the `Zen Context` commands while the dev server is running, with hot-reload on save. While active, the commands show a "Development" badge and are pinned to the top of root search.

**Stopping development mode.** Raycast's local-extension registration is tied to `ray develop` actively running and signaling Raycast after each build — simply killing the `npm run dev` process (`Ctrl-C`, closing the terminal, or letting it exit on its own) does *not* reliably keep the extension registered. Raycast can later drop it entirely (emptying its local extension storage), and the commands disappear until you run `npm run dev` again.

To keep using the commands without needing `npm run dev` running at all, use Raycast's own **Stop Development** action instead: find "Zen Context" in Raycast's root search or **Manage Extensions**, open its actions (`⌘K`), and choose **Stop Development**. This cleanly detaches the extension from the live dev server — the commands stay registered and keep working from the last build, now shown with a small "local extension" icon instead of the "Development" badge, and no longer pinned to the top of root search.

If you make code changes later, run `npm run dev` again to resume hot-reload, then **Stop Development** again once you're done.

You can also run a production-style local build first, so `npm run dev` picks up the latest compiled output:

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

## MCP Server (Optional)

If you want an MCP client other than Raycast — Claude Code, Claude Desktop, or anything else that speaks [MCP](https://modelcontextprotocol.io) — to read Zen context, use the standalone server in `mcp-server/` instead of (or alongside) the Raycast extension. It wraps the same CLI and exposes the same five read-only tools as the `@zen` AI Extension (everything except `zen_open_or_focus_url`, which is deliberately left out of this read-only server).

```bash
cd mcp-server
npm install
npm run build
```

Then register it with your MCP client, for example with Claude Code:

```bash
claude mcp add zen -- node /absolute/path/to/mcp-server/dist/index.js
```

See [`mcp-server/README.md`](mcp-server/README.md) for configuration (CLI path, profile selection) and [Spec 020](docs/zen-context/specs/020-mcp-read-only-server.md) for the full design, including why it's read-only and why it duplicates rather than shares code with the Raycast extension.

Registering this server broadly (for example, in an MCP client's user-wide config rather than per-project) means any agent session using that client could read whatever's open in Zen. Scope it to projects where that's actually wanted, the same way you would for any other tool with access to your local machine.

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

If this keeps happening after every Zen restart, you're likely hitting the temporary-add-on limitation — see [Installing it permanently](#installing-it-permanently-optional-recommended-once-youre-done-actively-changing-the-add-on) above.

### Zen Context commands disappeared from Raycast

If you previously ran `npm run dev` and later stopped it (`Ctrl-C`, closed the terminal, or it just exited) without using Raycast's **Stop Development** action, Raycast can drop the local extension's registration entirely. Run `npm run dev` again to bring the commands back, then use **Stop Development** (see [step 7](#7-install-and-run-the-raycast-extension)) this time so it doesn't happen again.

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
- `docs/zen-context/specs/020-mcp-read-only-server.md`
- [`mcp-server/README.md`](mcp-server/README.md)

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
