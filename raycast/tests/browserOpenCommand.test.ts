import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBrowserOpenArgs, tokenizeCommand } from "../src/browserOpenCommand";

test("tokenizeCommand splits the default browser command", () => {
  assert.deepEqual(tokenizeCommand("open -b app.zen-browser.zen"), ["open", "-b", "app.zen-browser.zen"]);
});

test("tokenizeCommand collapses extra whitespace", () => {
  assert.deepEqual(tokenizeCommand("  open   -b   app.zen-browser.zen  "), ["open", "-b", "app.zen-browser.zen"]);
});

test("tokenizeCommand preserves single-quoted arguments", () => {
  assert.deepEqual(tokenizeCommand("open -a 'My Browser.app'"), ["open", "-a", "My Browser.app"]);
});

test("tokenizeCommand preserves double-quoted arguments", () => {
  assert.deepEqual(tokenizeCommand('open -a "My Browser.app"'), ["open", "-a", "My Browser.app"]);
});

test("tokenizeCommand honors backslash escapes outside quotes", () => {
  assert.deepEqual(tokenizeCommand(String.raw`open /Applications/My\ Browser.app`), [
    "open",
    "/Applications/My Browser.app",
  ]);
});

test("tokenizeCommand keeps empty quoted tokens", () => {
  assert.deepEqual(tokenizeCommand('open ""'), ["open", ""]);
});

test("tokenizeCommand throws on unterminated quotes", () => {
  assert.throws(() => tokenizeCommand('open -a "My Browser.app'), /Unterminated quote/);
});

test("tokenizeCommand returns nothing for empty input", () => {
  assert.deepEqual(tokenizeCommand("   "), []);
});

test("buildBrowserOpenArgs appends extra arguments as argv entries", () => {
  assert.deepEqual(buildBrowserOpenArgs("open -b app.zen-browser.zen", ["https://github.com/egovelox/mozeidon"]), [
    "open",
    "-b",
    "app.zen-browser.zen",
    "https://github.com/egovelox/mozeidon",
  ]);
});

test("buildBrowserOpenArgs does not reinterpret shell metacharacters", () => {
  assert.deepEqual(buildBrowserOpenArgs("open -b app.zen-browser.zen", ["x; rm -rf /tmp"]), [
    "open",
    "-b",
    "app.zen-browser.zen",
    "x; rm -rf /tmp",
  ]);
});

test("buildBrowserOpenArgs throws on an empty command preference", () => {
  assert.throws(() => buildBrowserOpenArgs("   "), /browser command preference is empty/);
});
