// Adapted from raycast/tests/mozeidonClient.test.ts (see docs/zen-context/specs/020-mcp-read-only-server.md).
// Only covers what this package's trimmed mozeidonClient.ts still exports:
// buildMozeidonArgs, runMozeidon, and parseMozeidonJson. Dropped: everything
// exercising buildNewTabArgs and its siblings, parseAsUrl, spawnMozeidon, and
// streamMozeidonLines (all removed from this package's copy - see the header
// comment in src/mozeidonClient.ts for why).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { MozeidonClientError, buildMozeidonArgs, parseMozeidonJson, runMozeidon } from "../src/mozeidonClient.js";

test("buildMozeidonArgs preserves default profile behavior", () => {
  assert.deepEqual(buildMozeidonArgs(["tabs", "get"]), ["tabs", "get"]);
  assert.deepEqual(buildMozeidonArgs(["tabs", "get"], { profileId: "" }), ["tabs", "get"]);
  assert.deepEqual(buildMozeidonArgs(["tabs", "get"], { profileId: "   " }), ["tabs", "get"]);
});

test("buildMozeidonArgs inserts profile id as separate arguments", () => {
  assert.deepEqual(buildMozeidonArgs(["tabs", "get"], { profileId: "Zen" }), ["--profile-id", "Zen", "tabs", "get"]);
  assert.deepEqual(buildMozeidonArgs(["tabs", "get"], { profileId: "Zen Personal" }), [
    "--profile-id",
    "Zen Personal",
    "tabs",
    "get",
  ]);
});

test("buildMozeidonArgs applies profile support to the commands this package's tools actually issue", () => {
  const cases: Array<{ command: string[]; expected: string[] }> = [
    {
      command: ["context", "active", "--format", "markdown"],
      expected: ["--profile-id", "Zen", "context", "active", "--format", "markdown"],
    },
    {
      command: ["context", "selection"],
      expected: ["--profile-id", "Zen", "context", "selection"],
    },
    {
      command: ["context", "tab", "--tab-id", "1", "--window-id", "10", "--format", "markdown"],
      expected: ["--profile-id", "Zen", "context", "tab", "--tab-id", "1", "--window-id", "10", "--format", "markdown"],
    },
    {
      command: ["tabs", "get", "--with-windows"],
      expected: ["--profile-id", "Zen", "tabs", "get", "--with-windows"],
    },
    {
      command: ["tabs", "switch", "456:123"],
      expected: ["--profile-id", "Zen", "tabs", "switch", "456:123"],
    },
  ];

  for (const { command, expected } of cases) {
    assert.deepEqual(buildMozeidonArgs(command, { profileId: "Zen" }), expected);
  }
});

test("runMozeidon passes args as an array without shell interpolation", () => {
  const calls: Array<{ file: string; args: string[]; options: ExecFileSyncOptionsWithStringEncoding }> = [];
  const unsafeQuery = 'docs"; echo unsafe; $(whoami)';

  runMozeidon(["zen_search_tabs", "--query", unsafeQuery], {
    executable: "/opt/homebrew/bin/mozeidon",
    execFile: (file, args, options) => {
      calls.push({ file, args, options });
      return "";
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, "/opt/homebrew/bin/mozeidon");
  assert.deepEqual(calls[0].args, ["zen_search_tabs", "--query", unsafeQuery]);
  assert.equal("shell" in calls[0].options, false);
});

test("runMozeidon includes stderr in command failures", () => {
  assert.throws(
    () =>
      runMozeidon(["context", "active", "--format", "markdown"], {
        executable: "mozeidon",
        execFile: () => {
          throw Object.assign(new Error("exit status 1"), {
            stderr: Buffer.from('Error: unknown command "context" for "mozeidon"\n'),
          });
        },
      }),
    (error) => {
      assert.ok(error instanceof MozeidonClientError);
      assert.equal(error.code, "command_failed");
      assert.equal(error.context, "context active --format markdown");
      assert.equal(error.stderr, 'Error: unknown command "context" for "mozeidon"');
      assert.equal(error.stdout, undefined);
      assert.match(error.message, /unknown command "context"/);
      return true;
    },
  );
});

test("runMozeidon classifies a missing executable as not_found", () => {
  assert.throws(
    () =>
      runMozeidon(["context", "active", "--format", "markdown"], {
        executable: "/nonexistent/mozeidon",
        execFile: () => {
          throw Object.assign(new Error("spawn /nonexistent/mozeidon ENOENT"), { code: "ENOENT" });
        },
      }),
    (error) => {
      assert.ok(error instanceof MozeidonClientError);
      assert.equal(error.code, "not_found");
      return true;
    },
  );
});

test("parseMozeidonJson parses tab and context payloads", () => {
  const tabs = parseMozeidonJson<{ data: Array<{ id: number; title: string }> }>(
    '{"data":[{"id":1,"title":"Example"}]}',
    "tabs get",
  );

  assert.deepEqual(tabs.data, [{ id: 1, title: "Example" }]);
});

test("parseMozeidonJson uses fallback for empty output", () => {
  assert.deepEqual(parseMozeidonJson<{ data: unknown[] }>("", "tabs get", '{"data":[]}'), { data: [] });
});

test("parseMozeidonJson throws classified errors", () => {
  assert.throws(
    () => parseMozeidonJson("not json", "tabs get"),
    (error) => {
      assert.ok(error instanceof MozeidonClientError);
      assert.equal(error.code, "parse_failed");
      assert.equal(error.context, "tabs get");
      return true;
    },
  );

  assert.throws(
    () => parseMozeidonJson("", "tabs get"),
    (error) => {
      assert.ok(error instanceof MozeidonClientError);
      assert.equal(error.code, "empty_output");
      assert.equal(error.context, "tabs get");
      return true;
    },
  );
});
