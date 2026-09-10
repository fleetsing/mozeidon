# Decision Log

Record durable project decisions here. Keep entries short and link to specs when possible.

| Date | Decision | Rationale | Status |
| --- | --- | --- | --- |
| 2026-04-27 | Prefer Raycast over existing Mozeidon CLI capabilities before changing CLI/add-on/native layers. | The fork's immediate value is Zen Browser workflows in Raycast, and the CLI already exposes many useful browser capabilities. | Accepted |
| 2026-04-27 | Do not spoof Raycast's private `{browser-tab}` internals. | Private integration points are brittle and not inspectable. Zen Context should provide explicit local context instead. | Accepted |
| 2026-04-27 | Treat native messenger changes as a last resort. | The native app is transport infrastructure; feature work should happen above it unless protocol limits are proven. | Accepted |
| 2026-04-27 | Prefer argument-array process execution for Mozeidon commands. | User-derived and page-derived input must not be interpolated into shell strings. | Accepted |
| 2026-04-28 | Add a stable `mozeidon context` CLI contract for active page, selection, metadata, and links. | Raycast commands and AI tools need one local, testable context surface instead of duplicating browser semantics. | Accepted |
| 2026-04-28 | Allow the Firefox/Zen add-on `<all_urls>` host-permission exception for Zen Context. | Raycast-triggered native-message extraction does not get `activeTab` user-gesture permission, so normal-page content extraction needs documented host access. | Accepted |
| 2026-04-29 | Rename the Raycast extension identity to `zen` / `Zen Context`. | Raycast AI mention behavior derives from the extension package name, and this fork's useful surface is now the Zen Context Raycast workflow rather than the original Mozeidon extension identity. | Accepted |
| 2026-04-29 | Keep MCP out of the first Raycast AI tool release. | Raycast AI tools validate the local context/tool model first; MCP should wrap the stable contract later. | Accepted |
| 2026-09-10 | Stabilize `zen_get_tab_content` with focus-then-read verification and default focus restore, entirely in Raycast (Spec 014 Phase 1). | The V1 switch-and-trust approach could silently read the wrong tab under activation races; AI tools must fail closed instead. No CLI/add-on/native messenger change was needed to fix this. | Accepted |
