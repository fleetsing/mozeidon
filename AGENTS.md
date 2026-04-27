# Agent Instructions

This fork is focused on making the Raycast extension work deeply with Zen Browser.

Start with the Zen Context documentation in `docs/zen-context/`, especially:

- `00-project-brief.md`
- `01-current-architecture.md`
- `02-goals-and-non-goals.md`
- `03-roadmap.md`
- `04-test-strategy.md`
- `05-security-and-permissions.md`

Working agreements:

- Prefer planning before implementation for complex tasks.
- This project is spec-first: write or update a spec before changing behavior.
- Prefer Raycast changes over Mozeidon CLI/add-on changes when existing CLI capabilities are enough.
- Do not change the native messenger unless the current transport or protocol is proven insufficient.
- Prefer argument-array `execFile`/`spawn` helpers over shell-string `execSync` for Mozeidon commands.
- Require confirmation for destructive actions.
- Do not add production dependencies without justification.
- Run relevant tests, linting, and builds before calling implementation work complete.
- Summarize changed files, validation results, and unresolved risks.
