# Spec 021: Kill Orphaned `mozeidon` Child Processes on Early Stream Abandonment

## Summary

`streamMozeidonLines` (used by "Zen History" and "Zen Bookmarks") never terminated its spawned `mozeidon` child process when the consuming stream was abandoned before the process finished on its own. Fix: kill the process in the generator's `finally` block if it hasn't already exited.

## Status

- Implemented

## Problem

The user hit a Raycast crash on "Zen History": `Command terminated after reaching the extension memory limit (100 MB JS heap)`, reproducing intermittently (worked, then failed, then worked, then failed) across repeated launches within one long `npm run dev` session.

Investigation ruled out the obvious "too much data" explanation: the user's actual history was ~6,000 items / 1.4MB of raw JSON — nowhere near enough to explain a 100MB heap crash on its own, and no individual field or entry was anomalously large. `history.tsx`'s fetch-once-on-mount logic (unchanged since spec 016) was also confirmed correct in isolation.

The crash pattern — intermittent across *repeated launches*, not scaling with a single run's data volume — pointed instead at something accumulating across invocations within the same long-lived extension worker process, rather than a single run doing too much work.

`streamMozeidonLines` (`raycast/src/mozeidonClient.ts`), used by both `getHistoryChunks` and `getBookmarksChunks`, spawns a `mozeidon` child process and reads its stdout line-by-line via an async generator. Its `finally` block only closed the `readline` interface (`lines.close()`) — it never terminated the underlying child process. If the generator is abandoned before the process exits on its own (the consuming `for await` loop returning early because a component unmounted mid-stream, Vite/Raycast's dev-mode hot reload replacing the module, or any other early exit), the process is left orphaned: still running, with nothing draining its stdio, and still reachable via its own event listeners' closures (including the `stderr` accumulator registered a few lines above). That keeps it, and everything it references, alive in the JS heap for as long as it keeps running — accumulating further with each repeated launch that gets abandoned the same way, which matches the observed "works, then fails, then works, then fails" pattern far better than a single run's data volume would.

## Goals

- Ensure a `streamMozeidonLines`-spawned process is always terminated once its generator is done with it, whether that's normal completion or early abandonment.
- No behavior change on the normal-completion path, where the process has already exited by the time the generator returns.

## Proposed Design

In `streamMozeidonLines`'s `finally` block, after `lines.close()`, check whether the process has already exited (`command.exitCode === null && command.signalCode === null`, both null meaning still running) and call `command.kill()` only if so. Calling `.kill()` on an already-exited process is a safe no-op in Node, so this check is purely to avoid a pointless call on the (common) normal-completion path, not for correctness.

## Non-Goals

- No change to `spawnMozeidon`'s or `streamMozeidonLines`'s public signature or behavior on the happy path.
- No investigation into *why* dev-mode hot reload or component unmounts abandon the generator in the first place — that's normal, expected behavior; the bug was that abandonment leaked a process, not that abandonment happens.

## API Or Contract

No change. Purely an internal resource-cleanup fix.

## Security And Permissions

None. No new capability; this only ensures an already-spawned process is reliably terminated rather than left running.

## Alternatives Considered

- **Always call `command.kill()` unconditionally in `finally`, without checking exit status first.** Works identically in practice (killing an exited process is a safe no-op), but the explicit check makes the intent (only kill if abandonment left it running) clear to a future reader, and avoids a redundant syscall on the common normal-completion path.

## Test Plan

- `cd raycast && npm test` — 141/141 pass. Added `createFakeProcess`'s `exitCode`/`signalCode`/`kill` fields (previously absent, since no test needed them) and two new tests: `streamMozeidonLines` kills the process when abandoned before it exits (via `.return()`, mirroring a `for await` loop's early exit), and does not try to kill a process that has already exited.
- `cd raycast && npm run lint && npm run build`.

## Manual Verification With Zen

1. Rebuild and reload the Raycast extension (`npm run dev`).
2. Repeatedly launch "Zen History" (and back out before/after it finishes loading, several times) to reproduce the conditions that previously triggered the crash.
3. Confirm no "extension memory limit" crash occurs across repeated launches in one long-running dev session.

## Open Questions

None.
