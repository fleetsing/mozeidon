# Goals And Non-Goals

## Goals

- Replicate the practical benefits of Raycast's `{browser-tab}` placeholder for Zen Browser.
- Surpass that workflow with explicit profile selection, formatting options, AI tool integration, and later site-aware adapters.
- Keep the system local, inspectable, and customizable.
- Prefer Raycast extension changes when existing Mozeidon CLI features are enough.
- Use Mozeidon CLI/add-on changes only when a required capability is unavailable at the Raycast layer.
- Keep native messenger changes out of scope unless the current protocol is proven insufficient.
- Provide stable context contracts that future Raycast, AI Extension, and MCP layers can share.
- Make destructive operations explicit and confirmation-gated.
- Keep content extraction optional and least-privilege.

## Non-Goals

- Do not spoof Raycast's private browser-extension internals.
- Do not depend on private Raycast placeholder implementation details.
- Do not silently change existing CLI JSON output shapes.
- Do not add broad browser permissions without a spec.
- Do not add production dependencies without documented justification.
- Do not build cloud sync or remote browsing memory in the early milestones.
- Do not make the native app a feature surface unless transport becomes the blocker.
- Do not make the Raycast extension a general replacement for every browser UI feature.

## Constraints

- Zen Browser is Firefox-derived, so the Firefox-family add-on is the primary browser extension path.
- Multiple browser profiles can be active; the default CLI profile may not be Zen.
- Raycast commands may receive user-derived or page-derived input; command execution must avoid shell injection.
- Browser content extraction can expose sensitive data; it must be opt-in, scoped, and visible.
- CLI JSON output is a public integration surface for scripts and other tools.

## Decision Priority

When choosing an implementation path, prefer:

1. Existing Mozeidon CLI output consumed by Raycast.
2. New Raycast-side composition over existing CLI commands.
3. New CLI command preserving existing JSON shapes.
4. Add-on capability exposed through a stable CLI command.
5. Native messenger protocol change only with documented proof.
