import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChildProcessWithoutNullStreams, ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { TAB_TYPE } from "../src/tabTypes";
import {
  buildCreateBookmarkArgs,
  buildDeleteBookmarkArgs,
  buildUpdateBookmarkArgs,
  getAvailableBookmarkActionIds,
  validateBookmarkFolderPath,
} from "../src/bookmarkCommands";
import { buildDeleteHistoryItemArgs, buildFetchHistoryArgs } from "../src/historyCommands";
import { mapMozeidonHistoryItemsToHistoryItems } from "../src/historyMappers";
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
  buildLastTabIndexByWindow,
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
    {
      command: ["history", "--max", "500"],
      expected: ["--profile-id", "Zen", "history", "--max", "500"],
    },
    {
      command: ["history", "delete", "--url", "https://example.com/page"],
      expected: ["--profile-id", "Zen", "history", "delete", "--url", "https://example.com/page"],
    },
    {
      command: ["bookmark", "new", "--title", "Example", "--url", "https://example.com"],
      expected: ["--profile-id", "Zen", "bookmark", "new", "--title", "Example", "--url", "https://example.com"],
    },
    {
      command: ["bookmark", "update", "bookmark-1", "--title", "Updated"],
      expected: ["--profile-id", "Zen", "bookmark", "update", "bookmark-1", "--title", "Updated"],
    },
    {
      command: ["bookmark", "delete", "bookmark-1"],
      expected: ["--profile-id", "Zen", "bookmark", "delete", "bookmark-1"],
    },
  ];

  for (const testCase of cases) {
    assert.deepEqual(buildMozeidonArgs(testCase.command, { profileId: "Zen" }), testCase.expected);
  }
});

test("bookmark command builders use current CLI command shapes", () => {
  assert.deepEqual(buildCreateBookmarkArgs({ title: " Example ", url: " https://example.com " }), [
    "bookmark",
    "new",
    "--title",
    "Example",
    "--url",
    "https://example.com",
  ]);
  assert.deepEqual(
    buildCreateBookmarkArgs({ title: "Example", url: "https://example.com", folderPath: " /Development/ " }),
    ["bookmark", "new", "--title", "Example", "--url", "https://example.com", "--folder-path", "/Development/"],
  );
  assert.deepEqual(buildUpdateBookmarkArgs({ id: " bookmark-1 ", title: " Updated " }), [
    "bookmark",
    "update",
    "bookmark-1",
    "--title",
    "Updated",
  ]);
  assert.deepEqual(buildUpdateBookmarkArgs({ id: "bookmark-1", url: " https://example.org " }), [
    "bookmark",
    "update",
    "bookmark-1",
    "--url",
    "https://example.org",
  ]);
  assert.deepEqual(buildUpdateBookmarkArgs({ id: "bookmark-1", folderPath: " /Work/ " }), [
    "bookmark",
    "update",
    "bookmark-1",
    "--folder-path",
    "/Work/",
  ]);
  assert.deepEqual(buildUpdateBookmarkArgs({ id: "bookmark-1", title: "Updated", url: "https://example.org" }), [
    "bookmark",
    "update",
    "bookmark-1",
    "--title",
    "Updated",
    "--url",
    "https://example.org",
  ]);
  assert.equal(buildUpdateBookmarkArgs({ id: "bookmark-1", title: " ", url: "", folderPath: " " }), undefined);
  assert.deepEqual(buildDeleteBookmarkArgs({ id: " bookmark-1 " }), ["bookmark", "delete", "bookmark-1"]);
});

test("bookmark folder path validation accepts empty or slash-wrapped paths", () => {
  assert.equal(validateBookmarkFolderPath(undefined), undefined);
  assert.equal(validateBookmarkFolderPath(""), undefined);
  assert.equal(validateBookmarkFolderPath("   "), undefined);
  assert.equal(validateBookmarkFolderPath("/"), undefined);
  assert.equal(validateBookmarkFolderPath("/Work/"), undefined);
  assert.equal(validateBookmarkFolderPath("Work/"), "Folder path must start and end with `/`.");
  assert.equal(validateBookmarkFolderPath("/Work"), "Folder path must start and end with `/`.");
});

test("bookmark action availability is scoped to opened tabs and bookmarks", () => {
  const openedTab = createTab({ url: "https://example.com" });
  const invalidOpenedTab = createTab({ url: "" });
  const bookmark = createTab({ id: "bookmark-1", windowId: 0, active: false });

  assert.deepEqual(getAvailableBookmarkActionIds(TAB_TYPE.OPENED_TABS, openedTab), ["addBookmark"]);
  assert.deepEqual(getAvailableBookmarkActionIds(TAB_TYPE.OPENED_TABS, invalidOpenedTab), []);
  assert.deepEqual(getAvailableBookmarkActionIds(TAB_TYPE.BOOKMARKS, bookmark), ["editBookmark", "deleteBookmark"]);
  assert.deepEqual(getAvailableBookmarkActionIds(TAB_TYPE.RECENTLY_CLOSED, openedTab), []);
});

test("bookmark inputs remain child process args", () => {
  const calls: Array<{ file: string; args: string[]; options: ExecFileSyncOptionsWithStringEncoding }> = [];
  const unsafeTitle = 'Example"; echo unsafe; $(whoami)';
  const unsafeUrl = 'https://example.com/a"; rm -rf /; $(whoami)';
  const unsafeFolderPath = '/Work"; echo unsafe/';
  const unsafeId = 'bookmark-1"; echo unsafe';
  const execFile = (file: string, args: readonly string[], options: ExecFileSyncOptionsWithStringEncoding): string => {
    calls.push({ file, args: [...args], options });
    return "";
  };

  runMozeidon(buildCreateBookmarkArgs({ title: unsafeTitle, url: unsafeUrl, folderPath: unsafeFolderPath }), {
    executable: "mozeidon",
    execFile,
  });
  runMozeidon(
    buildUpdateBookmarkArgs({
      id: unsafeId,
      title: unsafeTitle,
      url: unsafeUrl,
      folderPath: unsafeFolderPath,
    })!,
    {
      executable: "mozeidon",
      execFile,
    },
  );
  runMozeidon(buildDeleteBookmarkArgs({ id: unsafeId }), {
    executable: "mozeidon",
    execFile,
  });

  assert.deepEqual(calls[0].args, [
    "bookmark",
    "new",
    "--title",
    unsafeTitle,
    "--url",
    unsafeUrl,
    "--folder-path",
    unsafeFolderPath,
  ]);
  assert.deepEqual(calls[1].args, [
    "bookmark",
    "update",
    unsafeId,
    "--title",
    unsafeTitle,
    "--url",
    unsafeUrl,
    "--folder-path",
    unsafeFolderPath,
  ]);
  assert.deepEqual(calls[2].args, ["bookmark", "delete", unsafeId]);
  assert.equal("shell" in calls[0].options, false);
  assert.equal("shell" in calls[1].options, false);
  assert.equal("shell" in calls[2].options, false);
});

test("history command builders use safe CLI argument shapes", () => {
  assert.deepEqual(buildFetchHistoryArgs(), ["history", "--max", "500"]);
  assert.deepEqual(buildFetchHistoryArgs(50), ["history", "--max", "50"]);
  assert.deepEqual(buildFetchHistoryArgs(0), ["history"]);
  assert.deepEqual(buildDeleteHistoryItemArgs({ url: "https://example.com/page" }), [
    "history",
    "delete",
    "--url",
    "https://example.com/page",
  ]);
  assert.equal(buildDeleteHistoryItemArgs({ url: "https://example.com/page" }).includes("--all"), false);
});

test("mapMozeidonHistoryItemsToHistoryItems normalizes history payloads", () => {
  const items = mapMozeidonHistoryItemsToHistoryItems([
    {
      id: "history-1",
      url: "https://www.example.com/page",
      title: " Example Page ",
      tc: 2,
      vc: 5,
      t: 1710000000000,
    },
    {
      id: "",
      url: "not a url",
      title: "",
      tc: 0,
      vc: -1,
      t: Number.NaN,
    },
  ]);

  assert.deepEqual(items[0], {
    id: "history-1",
    title: "Example Page",
    url: "https://www.example.com/page",
    domain: "example.com",
    typedCount: 2,
    visitCount: 5,
    lastVisitTime: 1710000000000,
  });
  assert.deepEqual(items[1], {
    id: "not a url",
    title: "not a url",
    url: "not a url",
    domain: "not a url",
    typedCount: undefined,
    visitCount: undefined,
    lastVisitTime: undefined,
  });
});

test("history open and delete inputs remain child process args", () => {
  const calls: Array<{ file: string; args: string[]; options: ExecFileSyncOptionsWithStringEncoding }> = [];
  const unsafeUrl = 'https://example.com/a"; rm -rf /; $(whoami)';

  runMozeidon(buildNewTabArgs(unsafeUrl, "https://google.com/search?q="), {
    executable: "mozeidon",
    execFile: (file, args, options) => {
      calls.push({ file, args, options });
      return "";
    },
  });
  runMozeidon(buildDeleteHistoryItemArgs({ url: unsafeUrl }), {
    executable: "mozeidon",
    execFile: (file, args, options) => {
      calls.push({ file, args, options });
      return "";
    },
  });

  assert.deepEqual(calls[0].args, ["tabs", "new", "--", new URL(unsafeUrl).toString()]);
  assert.deepEqual(calls[1].args, ["history", "delete", "--url", unsafeUrl]);
  assert.equal("shell" in calls[0].options, false);
  assert.equal("shell" in calls[1].options, false);
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

  const lastTabIndexByWindow = buildLastTabIndexByWindow([unpinnedTab, lastTab]);

  assert.deepEqual(getAvailableTabActionIds(TAB_TYPE.RECENTLY_CLOSED, unpinnedTab, groups), []);
  assert.deepEqual(getAvailableTabActionIds(TAB_TYPE.BOOKMARKS, unpinnedTab, groups), []);
  assert.ok(getAvailableTabActionIds(TAB_TYPE.OPENED_TABS, unpinnedTab, []).includes("pin"));
  assert.equal(getAvailableTabActionIds(TAB_TYPE.OPENED_TABS, unpinnedTab, []).includes("unpin"), false);
  assert.ok(getAvailableTabActionIds(TAB_TYPE.OPENED_TABS, pinnedTab, []).includes("unpin"));
  assert.equal(getAvailableTabActionIds(TAB_TYPE.OPENED_TABS, pinnedTab, []).includes("pin"), false);
  assert.equal(getAvailableTabActionIds(TAB_TYPE.OPENED_TABS, firstTab, []).includes("moveToStart"), false);
  assert.equal(
    getAvailableTabActionIds(TAB_TYPE.OPENED_TABS, lastTab, groups, lastTabIndexByWindow).includes("moveToEnd"),
    false,
  );
  assert.equal(getAvailableTabActionIds(TAB_TYPE.OPENED_TABS, unpinnedTab, []).includes("moveToGroup"), false);
  assert.equal(getAvailableTabActionIds(TAB_TYPE.OPENED_TABS, unpinnedTab, groups).includes("moveToGroup"), true);
  assert.equal(getAvailableTabActionIds(TAB_TYPE.OPENED_TABS, unpinnedTab, groups).includes("ungroup"), false);
  assert.equal(getAvailableTabActionIds(TAB_TYPE.OPENED_TABS, groupedTab, groups).includes("ungroup"), true);
  assert.deepEqual(getMoveToGroupTargets(groupedTab, groups), [{ id: 999, windowId: 456, title: "Personal" }]);
});

test("buildLastTabIndexByWindow precomputes reliable last indexes by window", () => {
  const tabs = [
    createTab({ id: "1", windowId: 456, index: 0 }),
    createTab({ id: "2", windowId: 456, index: 3 }),
    createTab({ id: "3", windowId: 999, index: 2 }),
    createTab({ id: "4", windowId: 999 }),
  ];

  assert.deepEqual([...buildLastTabIndexByWindow(tabs).entries()], [[456, 3]]);
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
