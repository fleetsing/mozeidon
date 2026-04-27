# Zen Context Project Brief

Zen Context is the project direction for this Mozeidon fork. The near-term goal is to make the bundled Raycast extension work deeply with Zen Browser while staying local, inspectable, and independent from Raycast private browser-extension internals.

The motivating workflow is Raycast's `{browser-tab}` placeholder: users want fast access to the current browser tab as structured context for commands, AI prompts, automations, and future tool calls. This project should replicate and surpass the practical benefits of that workflow for Zen without spoofing Raycast's browser integration.

## Product Direction

Build a local context layer for Zen Browser that can answer questions like:

- What is the current active Zen tab?
- What URL, title, domain, window, profile, and group is it associated with?
- How should that context be formatted for clipboard actions, Raycast commands, AI extension tools, and later MCP tools?
- Which richer context can be extracted safely, optionally, and with least privilege?

## Preferred Architecture

Work in this order:

1. Expand the Raycast extension using existing Mozeidon CLI features.
2. Change the Mozeidon CLI or add-on only when the Raycast layer cannot get the required capability.
3. Add AI Extension tools for `@zen` workflows.
4. Add an optional MCP wrapper after the context API is stable.
5. Add site adapters and local browsing memory later.

The native messenger should not change unless the current transport or protocol is proven insufficient.

## Core Principles

- Local first: no browsing data leaves the machine unless the user explicitly sends it through another tool.
- Inspectable: data flow and commands should be visible in the repo and docs.
- Customizable: users should be able to choose profile, output format, and optional extraction depth.
- Least privilege: content extraction permissions are optional and justified by specs.
- Stable contracts: do not silently change CLI JSON output shapes.
- Spec-driven: each behavior change should have a small spec and a validation plan.

## Current Scope

This repository currently contains:

- Mozeidon CLI in `cli/`.
- Firefox-family add-on used by Zen in `firefox-addon/`.
- Chromium add-on in `chrome-addon/`.
- Raycast extension in `raycast/`.
- Zen compatibility documentation in `README.md`.

The initial Zen patch is Raycast-focused: it activates and checks Zen Browser by bundle ID instead of assuming Firefox.
