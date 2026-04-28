import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChildProcessWithoutNullStreams, ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { TAB_TYPE } from "../src/constants";
import {
  MozeidonClientError,
  buildMozeidonArgs,
  buildNewTabArgs,
  parseMozeidonJson,
  runMozeidon,
  spawnMozeidon,
  streamMozeidonLines,
} from "../src/mozeidonClient";
import {
  buildDuplicateTabArgs,
  buildMoveTabToEndArgs,
  buildMoveTabToGroupArgs,
  buildMoveTabToStartArgs,
  buildPinTabArgs,
  buildUngroupTabArgs,
  buildUnpinTabArgs,
  getAvailableTabActionIds,
  getMoveToGroupTargets,
} from "../src/tabActionCommands";
import {
  hasGroupMetadata,
  mapMozeidonBookmarksToTabs,
  mapMozeidonTabsToState,
  sortTabsByLastAccessed,
} from "../src/tabMappers";
import { buildTabKeywords, buildTabMetadata, getDistinctWindowCount } from "../src/tabMetadata";
import { Tab } from "../src/interfaces";

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

test("buildMozeidonArgs applies profile support to representative commands", () => {
  const cases: Array<{ command: string[]; expected: string[] }> = [
    {
      command: ["tabs", "get"],
      expected: ["--profile-id", "Zen", "tabs", "get"],
    },
    {
      command: ["tabs", "get", "--with-groups"],
      expected: ["--profile-id", "Zen", "tabs", "get", "--with-groups"],
    },
    {
      command: ["tabs", "get", "--closed"],
      expected: ["--profile-id", "Zen", "tabs", "get", "--closed"],
    },
    {
      command: ["bookmarks", "-c", "1000"],
      expected: ["--profile-id", "Zen", "bookmarks", "-c", "1000"],
    },
    {
      command: ["tabs", "switch", "456:123"],
      expected: ["--profile-id", "Zen", "tabs", "switch", "456:123"],
    },
    {
      command: ["tabs", "close", "456:123"],
      expected: ["--profile-id", "Zen", "tabs", "close", "456:123"],
    },
    {
      command: ["tabs", "new"],
      expected: ["--profile-id", "Zen", "tabs", "new"],
    },
    {
      command: ["tabs", "new", "--", "https://example.com/page"],
      expected: ["--profile-id", "Zen", "tabs", "new", "--", "https://example.com/page"],
    },
    {
      command: ["tabs", "new", "--", "https://google.com/search?q=hello%20zen"],
      expected: ["--profile-id", "Zen", "tabs", "new", "--", "https://google.com/search?q=hello%20zen"],
    },
    {
      command: ["tabs", "update", "--tab-id", "123", "--window-id", "456", "--pin=true"],
      expected: ["--profile-id", "Zen", "tabs", "update", "--tab-id", "123", "--window-id", "456", "--pin=true"],
    },
    {
      command: ["tabs", "duplicate", "--tab-id", "123", "--window-id", "456"],
      expected: ["--profile-id", "Zen", "tabs", "duplicate", "--tab-id", "123", "--window-id", "456"],
    },
    {
      command: ["tabs", "update", "--tab-id", "123", "--window-id", "456", "--group-id", "789"],
      expected: ["--profile-id", "Zen", "tabs", "update", "--tab-id", "123", "--window-id", "456", "--group-id", "789"],
    },
  ];

  for (const testCase of cases) {
    assert.deepEqual(buildMozeidonArgs(testCase.command, { profileId: "Zen" }), testCase.expected);
  }
});

test("tab action argument builders use current CLI command shapes", () => {
  const tab = createTab({ id: "123", windowId: 456 });

  assert.deepEqual(buildPinTabArgs(tab), ["tabs", "update", "--tab-id", "123", "--window-id", "456", "--pin=true"]);
  assert.deepEqual(buildUnpinTabArgs(tab), ["tabs", "update", "--tab-id", "123", "--window-id", "456", "--pin=false"]);
  assert.deepEqual(buildDuplicateTabArgs(tab), ["tabs", "duplicate", "--tab-id", "123", "--window-id", "456"]);
  assert.deepEqual(buildMoveTabToStartArgs(tab), [
    "tabs",
    "update",
    "--tab-id",
    "123",
    "--window-id",
    "456",
    "--tab-index",
    "0",
  ]);
  assert.deepEqual(buildMoveTabToEndArgs(tab), [
    "tabs",
    "update",
    "--tab-id",
    "123",
    "--window-id",
    "456",
    "--tab-index",
    "-1",
  ]);
  assert.deepEqual(buildMoveTabToGroupArgs(tab, 789), [
    "tabs",
    "update",
    "--tab-id",
    "123",
    "--window-id",
    "456",
    "--group-id",
    "789",
  ]);
  assert.deepEqual(buildUngroupTabArgs(tab), [
    "tabs",
    "update",
    "--tab-id",
    "123",
    "--window-id",
    "456",
    "--group-id",
    "-1",
  ]);
});

test("tab action availability is limited to opened tabs and current tab state", () => {
  const unpinnedTab = createTab({ pinned: false, index: 1 });
  const pinnedTab = createTab({ pinned: true, index: 1 });
  const firstTab = createTab({ pinned: false, index: 0 });
  const lastTab = createTab({ id: "124", pinned: false, index: 2 });
  const groupedTab = createTab({ groupId: 789, group: { id: 789, windowId: 456, title: "Work" } });
  const groups = [
    { id: 789, windowId: 456, title: "Work" },
    { id: 999, windowId: 456, title: "Personal" },
    { id: 111, windowId: 999, title: "Other Window" },
  ];

  assert.deepEqual(getAvailableTabActionIds("Recently Closed" as TAB_TYPE, unpinnedTab, groups), []);
  assert.deepEqual(getAvailableTabActionIds("Bookmarks" as TAB_TYPE, unpinnedTab, groups), []);
  assert.ok(getAvailableTabActionIds("Opened Tabs" as TAB_TYPE, unpinnedTab, []).includes("pin"));
  assert.equal(getAvailableTabActionIds("Opened Tabs" as TAB_TYPE, unpinnedTab, []).includes("unpin"), false);
  assert.ok(getAvailableTabActionIds("Opened Tabs" as TAB_TYPE, pinnedTab, []).includes("unpin"));
  assert.equal(getAvailableTabActionIds("Opened Tabs" as TAB_TYPE, pinnedTab, []).includes("pin"), false);
  assert.equal(getAvailableTabActionIds("Opened Tabs" as TAB_TYPE, firstTab, []).includes("moveToStart"), false);
  assert.equal(
    getAvailableTabActionIds("Opened Tabs" as TAB_TYPE, lastTab, groups, [unpinnedTab, lastTab]).includes("moveToEnd"),
    false,
  );
  assert.equal(getAvailableTabActionIds("Opened Tabs" as TAB_TYPE, unpinnedTab, []).includes("moveToGroup"), false);
  assert.equal(getAvailableTabActionIds("Opened Tabs" as TAB_TYPE, unpinnedTab, groups).includes("moveToGroup"), true);
  assert.equal(getAvailableTabActionIds("Opened Tabs" as TAB_TYPE, unpinnedTab, groups).includes("ungroup"), false);
  assert.equal(getAvailableTabActionIds("Opened Tabs" as TAB_TYPE, groupedTab, groups).includes("ungroup"), true);
  assert.deepEqual(getMoveToGroupTargets(groupedTab, groups), [{ id: 999, windowId: 456, title: "Personal" }]);
});

test("buildNewTabArgs handles empty, URL, and search queries", () => {
  assert.deepEqual(buildNewTabArgs(undefined, "https://google.com/search?q="), ["tabs", "new"]);
  assert.deepEqual(buildNewTabArgs("", "https://google.com/search?q="), ["tabs", "new"]);
  assert.deepEqual(buildNewTabArgs("https://example.com/page", "https://google.com/search?q="), [
    "tabs",
    "new",
    "--",
    "https://example.com/page",
  ]);
  assert.deepEqual(buildNewTabArgs("hello zen", "https://google.com/search?q="), [
    "tabs",
    "new",
    "--",
    "https://google.com/search?q=hello%20zen",
  ]);
});

test("user input is passed as child process args without shell interpolation", () => {
  const calls: Array<{ file: string; args: string[]; options: ExecFileSyncOptionsWithStringEncoding }> = [];
  const input = 'docs"; echo unsafe; $(whoami)';

  runMozeidon(buildNewTabArgs(input, "https://google.com/search?q="), {
    executable: "/opt/homebrew/bin/mozeidon",
    execFile: (file, args, options) => {
      calls.push({ file, args, options });
      return "";
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, "/opt/homebrew/bin/mozeidon");
  assert.deepEqual(calls[0].args, [
    "tabs",
    "new",
    "--",
    "https://google.com/search?q=docs%22%3B%20echo%20unsafe%3B%20%24(whoami)",
  ]);
  assert.equal("shell" in calls[0].options, false);
});

test("spawnMozeidon uses argument arrays and does not set shell true", () => {
  const calls: Array<{ file: string; args: string[]; options?: unknown }> = [];

  spawnMozeidon(["bookmarks", "-c", "1000"], {
    executable: "mozeidon",
    profileId: "Zen",
    spawnProcess: (file, args, options) => {
      calls.push({ file, args, options });
      return {} as ChildProcessWithoutNullStreams;
    },
  });

  assert.deepEqual(calls, [
    {
      file: "mozeidon",
      args: ["--profile-id", "Zen", "bookmarks", "-c", "1000"],
      options: undefined,
    },
  ]);
});

test("streamMozeidonLines converts async spawn errors to classified errors", async () => {
  const process = createFakeProcess();
  const lines = streamMozeidonLines(["bookmarks", "-c", "1000"], {
    executable: "missing-mozeidon",
    spawnProcess: () => process,
  });
  const nextLine = lines.next();

  process.emit("error", Object.assign(new Error("missing executable"), { code: "ENOENT" }));

  await assert.rejects(nextLine, (error) => {
    assert.ok(error instanceof MozeidonClientError);
    assert.equal(error.code, "not_found");
    assert.equal(error.context, "bookmarks -c 1000");
    return true;
  });
});

test("parseMozeidonJson parses tabs and bookmark payloads", () => {
  const tabs = parseMozeidonJson<{ data: Array<{ id: number; title: string }> }>(
    '{"data":[{"id":1,"title":"Example"}]}',
    "tabs get",
  );
  const bookmarks = parseMozeidonJson<{ data: Array<{ id: string; url: string }> }>(
    '{"data":[{"id":"bookmark-1","url":"https://example.com"}]}',
    "bookmarks -c 1000",
  );

  assert.deepEqual(tabs.data, [{ id: 1, title: "Example" }]);
  assert.deepEqual(bookmarks.data, [{ id: "bookmark-1", url: "https://example.com" }]);
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

test("mapMozeidonTabsToState preserves current tab mapping behavior", () => {
  const state = mapMozeidonTabsToState(
    {
      data: [
        {
          id: 123,
          windowId: 456,
          pinned: true,
          domain: "example.com",
          title: "Example Page",
          url: "https://example.com/page",
          active: true,
        },
      ],
    },
    "Opened Tabs" as TAB_TYPE,
  );

  assert.equal(state.type, "Opened Tabs");
  assert.equal(state.tabs.length, 1);
  assert.equal(state.tabs[0].id, "123");
  assert.equal(state.tabs[0].windowId, 456);
  assert.equal(state.tabs[0].pinned, true);
  assert.equal(state.tabs[0].title, "Example Page");
  assert.equal(state.tabs[0].url, "https://example.com/page");
  assert.equal(state.tabs[0].domain, "example.com");
  assert.equal(state.tabs[0].active, true);
});

test("mapMozeidonTabsToState attaches rich group metadata when available", () => {
  const state = mapMozeidonTabsToState(
    {
      data: [
        {
          id: 123,
          windowId: 456,
          groupId: 789,
          pinned: true,
          domain: "example.com",
          title: "Example Page",
          url: "https://example.com/page",
          active: true,
          lastAccessed: 1710000000000,
          index: 3,
        },
      ],
      groups: [
        {
          id: 789,
          windowId: 456,
          collapsed: false,
          color: "blue",
          title: "Work",
        },
      ],
    },
    "Opened Tabs" as TAB_TYPE,
  );

  assert.equal(state.tabs[0].groupId, 789);
  assert.deepEqual(state.tabs[0].group, {
    id: 789,
    windowId: 456,
    title: "Work",
    color: "blue",
  });
  assert.equal(state.tabs[0].lastAccessed, 1710000000000);
  assert.equal(state.tabs[0].index, 3);
});

test("mapMozeidonTabsToState preserves zero-based tab indexes", () => {
  const state = mapMozeidonTabsToState(
    {
      data: [
        {
          id: 123,
          windowId: 456,
          pinned: false,
          domain: "example.com",
          title: "First Tab",
          url: "https://example.com",
          active: false,
          index: 0,
        },
      ],
    },
    "Opened Tabs" as TAB_TYPE,
  );

  assert.equal(state.tabs[0].index, 0);
});

test("mapMozeidonTabsToState normalizes non-positive group ids", () => {
  const state = mapMozeidonTabsToState(
    {
      data: [
        {
          id: 123,
          windowId: 456,
          groupId: -1,
          pinned: false,
          domain: "example.com",
          title: "Ungrouped",
          url: "https://example.com",
          active: false,
        },
      ],
      groups: [
        {
          id: -1,
          windowId: 456,
          collapsed: false,
          color: "grey",
          title: "Invalid Sentinel",
        },
      ],
    },
    "Opened Tabs" as TAB_TYPE,
  );

  assert.equal(state.tabs[0].groupId, undefined);
  assert.equal(state.tabs[0].group, null);
});

test("mapMozeidonTabsToState handles missing or unknown group metadata", () => {
  const missingGroupsState = mapMozeidonTabsToState(
    {
      data: [
        {
          id: 123,
          windowId: 456,
          groupId: 789,
          pinned: false,
          domain: "example.com",
          title: "Example Page",
          url: "https://example.com/page",
          active: false,
        },
      ],
    },
    "Opened Tabs" as TAB_TYPE,
  );
  const unknownGroupState = mapMozeidonTabsToState(
    {
      data: [
        {
          id: 124,
          windowId: 456,
          groupId: 999,
          pinned: false,
          domain: "example.org",
          title: "Example Org",
          url: "https://example.org",
          active: false,
        },
      ],
      groups: [],
    },
    "Opened Tabs" as TAB_TYPE,
  );

  assert.equal(missingGroupsState.tabs[0].groupId, 789);
  assert.equal(missingGroupsState.tabs[0].group, null);
  assert.equal(unknownGroupState.tabs[0].groupId, 999);
  assert.equal(unknownGroupState.tabs[0].group, null);
});

test("mapMozeidonTabsToState ignores invalid lastAccessed values", () => {
  const state = mapMozeidonTabsToState(
    {
      data: [
        {
          id: 123,
          windowId: 456,
          pinned: false,
          domain: "example.com",
          title: "Example Page",
          url: "https://example.com/page",
          active: false,
          lastAccessed: 0,
        },
        {
          id: 124,
          windowId: 456,
          pinned: false,
          domain: "example.org",
          title: "Example Org",
          url: "https://example.org",
          active: false,
          lastAccessed: -1,
        },
      ],
    },
    "Opened Tabs" as TAB_TYPE,
  );

  assert.equal(state.tabs[0].lastAccessed, undefined);
  assert.equal(state.tabs[1].lastAccessed, undefined);
});

test("hasGroupMetadata requires a groups array", () => {
  assert.equal(hasGroupMetadata({ data: [] }), false);
  assert.equal(hasGroupMetadata({ data: [], groups: [] }), true);
});

test("sortTabsByLastAccessed uses valid recency without relying on missing values", () => {
  const state = mapMozeidonTabsToState(
    {
      data: [
        {
          id: 1,
          windowId: 456,
          pinned: false,
          domain: "older.example",
          title: "Older",
          url: "https://older.example",
          active: false,
          lastAccessed: 100,
        },
        {
          id: 2,
          windowId: 456,
          pinned: false,
          domain: "missing.example",
          title: "Missing",
          url: "https://missing.example",
          active: false,
        },
        {
          id: 3,
          windowId: 456,
          pinned: false,
          domain: "newer.example",
          title: "Newer",
          url: "https://newer.example",
          active: false,
          lastAccessed: 300,
        },
      ],
    },
    "Opened Tabs" as TAB_TYPE,
  );

  assert.deepEqual(
    sortTabsByLastAccessed(state.tabs).map((tab) => tab.id),
    ["3", "1", "2"],
  );
  assert.deepEqual(
    mapMozeidonTabsToState(
      {
        data: [
          {
            id: 1,
            windowId: 456,
            pinned: false,
            domain: "older.example",
            title: "Older",
            url: "https://older.example",
            active: false,
            lastAccessed: 100,
          },
          {
            id: 3,
            windowId: 456,
            pinned: false,
            domain: "newer.example",
            title: "Newer",
            url: "https://newer.example",
            active: false,
            lastAccessed: 300,
          },
        ],
      },
      "Opened Tabs" as TAB_TYPE,
      { sortByLastAccessed: true },
    ).tabs.map((tab) => tab.id),
    ["3", "1"],
  );
});

test("tab metadata helpers keep visible metadata compact", () => {
  const state = mapMozeidonTabsToState(
    {
      data: [
        {
          id: 1,
          windowId: 456,
          groupId: 789,
          pinned: true,
          domain: "example.com",
          title: "Example",
          url: "https://example.com",
          active: true,
        },
        {
          id: 2,
          windowId: 999,
          pinned: false,
          domain: "example.org",
          title: "Example Org",
          url: "https://example.org",
          active: false,
        },
      ],
      groups: [
        {
          id: 789,
          windowId: 456,
          collapsed: false,
          color: "blue",
          title: "Work",
        },
      ],
    },
    "Opened Tabs" as TAB_TYPE,
  );
  const windowCount = getDistinctWindowCount(state.tabs);

  assert.equal(windowCount, 2);
  assert.deepEqual(buildTabMetadata(state.tabs[0], windowCount), {
    groupTitle: "Work",
    isActive: true,
    isPinned: true,
    windowLabel: "W456",
  });
  assert.deepEqual(buildTabKeywords(state.tabs[0], windowCount), [
    "example.com",
    "example.com",
    "Work",
    "window 456",
    "pinned",
    "active",
  ]);
  assert.deepEqual(buildTabKeywords(state.tabs[0], 1), ["example.com", "example.com", "Work", "pinned", "active"]);
  assert.equal(buildTabMetadata(state.tabs[0], 1).windowLabel, undefined);
});

test("mapMozeidonBookmarksToTabs preserves current bookmark mapping behavior", () => {
  const tabs = mapMozeidonBookmarksToTabs([
    {
      id: "bookmark-1",
      parent: "Bookmarks Toolbar",
      title: "Example Bookmark",
      url: "https://example.com",
    },
  ]);

  assert.equal(tabs.length, 1);
  assert.equal(tabs[0].id, "bookmark-1");
  assert.equal(tabs[0].windowId, 0);
  assert.equal(tabs[0].pinned, false);
  assert.equal(tabs[0].title, "Example Bookmark");
  assert.equal(tabs[0].url, "https://example.com");
  assert.equal(tabs[0].domain, "Bookmarks Toolbar");
  assert.equal(tabs[0].active, false);
});

function createFakeProcess(): ChildProcessWithoutNullStreams {
  const process = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    stdin: PassThrough;
  };
  process.stdout = new PassThrough();
  process.stderr = new PassThrough();
  process.stdin = new PassThrough();
  return process as unknown as ChildProcessWithoutNullStreams;
}

function createTab(overrides: Partial<Tab> = {}): Tab {
  return new Tab(
    overrides.id ?? "123",
    overrides.pinned ?? false,
    overrides.windowId ?? 456,
    overrides.title ?? "Example",
    overrides.url ?? "https://example.com",
    overrides.domain ?? "example.com",
    overrides.active ?? false,
    overrides.groupId,
    overrides.group,
    overrides.index,
    overrides.lastAccessed,
  );
}
