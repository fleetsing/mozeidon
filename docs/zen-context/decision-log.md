# Decision Log

Record durable project decisions here. Keep entries short and link to specs when possible.

| Date | Decision | Rationale | Status |
| --- | --- | --- | --- |
| 2026-04-27 | Prefer Raycast over existing Mozeidon CLI capabilities before changing CLI/add-on/native layers. | The fork's immediate value is Zen Browser workflows in Raycast, and the CLI already exposes many useful browser capabilities. | Accepted |
| 2026-04-27 | Do not spoof Raycast's private `{browser-tab}` internals. | Private integration points are brittle and not inspectable. Zen Context should provide explicit local context instead. | Accepted |
| 2026-04-27 | Treat native messenger changes as a last resort. | The native app is transport infrastructure; feature work should happen above it unless protocol limits are proven. | Accepted |
| 2026-04-27 | Prefer argument-array process execution for Mozeidon commands. | User-derived and page-derived input must not be interpolated into shell strings. | Accepted |
