# Spec 023: Sign the Zen/Firefox Add-on Through AMO's Unlisted Channel

## Summary

Give the fork's Firefox-family add-on its own extension ID and sign it with Mozilla through AMO's unlisted (self-distributed) channel, so it can be permanently installed in Zen with `xpinstall.signatures.required` left at `true`. This replaces the README's previous "disable signature checks" install path.

## Status

- Implemented and verified in Zen

## Problem

The README's permanent-install path (2026-10-02 decision-log entry) relied on Zen being built with `MOZ_REQUIRE_SIGNING: false` and setting `xpinstall.signatures.required = false`. That works, but it disables signature verification for every add-on, not just this one. The user verified that re-enabling signature checks makes Zen block the unsigned add-on.

Mozilla only signs through AMO, and AMO only signs an add-on for the account that owns its ID. The manifest used upstream's ID, `mozeidon-addon@egovelox.com`, which belongs to the upstream author's AMO account, so the fork couldn't be signed as-is.

## Goals

- A permanently installed, Mozilla-signed add-on in Zen with signature checks enabled.
- Repeatable signing from this repo with the user's own AMO API credentials, with no secrets committed or passed in argv.
- Nothing published on AMO's public listing.

## Non-Goals

- Publishing a listed AMO add-on.
- Automating signing in CI. Credentials stay on the user's machine; revisit only if releases become frequent.
- Changing add-on permissions or behavior.

## Proposed Design

- **New ID:** `mozeidon-zen@fleetsing.github.io`. The ID only needs to be email-shaped and unique on AMO; it is never mailed. `fleetsing.github.io` makes ownership obvious and is unlikely to collide. The ID is permanent once signed.
- **Data collection declaration:** AMO has required `browser_specific_settings.gecko.data_collection_permissions` on all new add-ons, listed or unlisted, since 2025-11-03. That requires `strict_min_version` 140 (desktop), which Zen satisfies (Zen 1.22.3b is Gecko 156).
- **`sign.sh` / `npm run sign`:** builds, stages only `manifest.json`, `dist/`, and `icons/` (the same contents as `npm run package`), zips human-readable source for upload because `dist/background.js` is webpack-minified, runs `web-ext lint`, then `web-ext sign --channel unlisted`. The signed `.xpi` lands in `firefox-addon/web-ext-artifacts/`.
- **`web-ext` via pinned `npx` rather than a dev dependency:** adding it as a devDependency pulled ~4,000 lockfile lines and 7 audit findings (Android device tooling `web-ext` bundles but signing never uses) into a package whose CI only builds and tests. `npx --yes web-ext@10.7.0` keeps the version pinned without touching the add-on's dependency tree.
- **Native messaging:** `mozeidon-native-app`'s manifest must list the new ID in `allowed_extensions`. The README now lists both IDs so the AMO upstream add-on keeps working if someone prefers it.

## API Or Contract

No CLI, native-messaging protocol, or add-on behavior change. Only the extension identity and install path change.

## Security And Permissions

- Signature verification can stay enabled browser-wide; this is the main security gain over the previous install path.
- `data_collection_permissions.required` declares `browsingActivity`, `websiteContent`, and `bookmarksInfo`. Mozilla defines collection as data "handled outside the add-on or the local browser". This add-on hands tabs, history, bookmarks, and page content to a native app, and from there to Raycast and the MCP server, which can forward page content to a cloud LLM at the user's request. Declaring `none` would likely pass automated validation but would be misleading, so the honest categories are declared; Zen shows them in the install prompt.
- AMO API credentials are read from `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET` only. `web-ext` picks these up directly, so they never appear in shell history or process listings.
- The source upload contains only this repo's already-public MIT add-on source.

## Alternatives Considered

- **Keep `xpinstall.signatures.required = false`.** Works in Zen, but disables verification for all add-ons. Rejected; this is what the user wants to move away from.
- **Keep loading as a temporary add-on.** Lost on every restart, and Zen silently falls back to the AMO add-on, which lacks `<all_urls>`. Rejected for daily use.
- **Enterprise policy (`policies.json`) to whitelist one unsigned add-on.** Firefox policies can force-install add-ons but don't exempt them from signing on builds that require it. Rejected.
- **Declare `data_collection_permissions: none`.** See Security above.

## Test Plan

- `cd firefox-addon && npm test`: 17/17 pass.
- `web-ext lint` on the staged `sign-src/`: 0 errors, 1 warning (`KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`; Android-only, not applicable to this desktop add-on).

## Manual Verification With Zen

1. With credentials exported, run `npm run sign` and confirm a signed `.xpi` appears in `web-ext-artifacts/`.
2. Uninstall the previous unsigned `mozeidon` entry (and the AMO Mozeidon add-on, if present) from `about:addons`.
3. Set `xpinstall.signatures.required` back to `true` (and `extensions.experiments.enabled` back to `false`), then restart Zen.
4. Install the signed `.xpi`, accept the permission and data-collection prompts, restart Zen, and confirm the add-on is still enabled.
5. Run `mozeidon tabs get` and `mozeidon context active --format markdown` to confirm the native host accepts the new ID and page extraction works.

Result (2026-10-03): AMO's automated review signed version 4.1 about six minutes after upload, with no manual review. The `.xpi` carries COSE and PKCS#7 signatures chaining to Mozilla's AMO production root. The user installed it in Zen with signature checks re-enabled and confirmed it survives restarts and that tab and page-context commands work.

## Open Questions

None. Version 4.1 is now used up for this ID; bump `version` before the next `npm run sign`.
