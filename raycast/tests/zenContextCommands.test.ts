import assert from "node:assert/strict";
import { test } from "node:test";
import {
  askCurrentPage,
  copyCurrentPageMarkdown,
  summarizeCurrentPage,
  type ZenContextCommandAiClient,
} from "../src/zenContextCommands";
import type { RaycastZenContext } from "../src/zenContext";
import { MozeidonClientError } from "../src/mozeidonClient";

test("copy current page Markdown includes source attribution", async () => {
  const result = await copyCurrentPageMarkdown({
    getActivePageMarkdown: async () =>
      context({
        title: "Example",
        url: "https://example.com/page",
        markdown: "Page markdown",
      }),
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.markdown, "# Example\n\nSource: https://example.com/page\n\nPage markdown");
    assert.deepEqual(result.source, {
      title: "Example",
      url: "https://example.com/page",
    });
  }
});

test("copy current page Markdown refuses metadata-only fallback", async () => {
  const result = await copyCurrentPageMarkdown({
    getActivePageMarkdown: async () =>
      context({
        title: "Metadata",
        url: "https://example.com",
        markdown: "# Metadata\n\nSource: https://example.com",
        isMetadataOnly: true,
      }),
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "content_unavailable");
});

test("copy current page Markdown reports unsupported context CLI clearly", async () => {
  const result = await copyCurrentPageMarkdown({
    getActivePageMarkdown: async () => {
      throw oldCliContextError();
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "context_command_unavailable");
    assert.match(result.error.message, /does not support Zen Context commands/);
  }
});

test("copy current page Markdown reports native app IPC failures clearly", async () => {
  const result = await copyCurrentPageMarkdown({
    getActivePageMarkdown: async () => {
      throw nativeAppIpcError("context active --format markdown");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "mozeidon_unavailable");
    assert.match(result.error.message, /could not reach Zen through the native app/);
    assert.match(result.error.message, /Cannot read via ipc/);
  }
});

test("summarize current page asks Raycast AI with real page context", async () => {
  const prompts: string[] = [];
  const result = await summarizeCurrentPage({
    getActivePageMarkdown: async () =>
      context({
        title: "Article",
        url: "https://example.com/article",
        markdown: "Article markdown",
      }),
    ai: aiClient({
      ask: async (prompt) => {
        prompts.push(prompt);
        return "Summary";
      },
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /Title: Article/);
  assert.match(prompts[0], /Article markdown/);
  if (result.ok) {
    assert.equal(result.summary, "Summary");
    assert.deepEqual(result.source, {
      title: "Article",
      url: "https://example.com/article",
    });
  }
});

test("summarize current page handles Raycast AI unavailable gracefully", async () => {
  const result = await summarizeCurrentPage({
    getActivePageMarkdown: async () => context({ markdown: "Article markdown" }),
    ai: aiClient({
      canAccessAi: () => false,
      ask: async () => {
        throw new Error("AI should not be called");
      },
    }),
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "ai_unavailable");
});

test("ask current page requires a question", async () => {
  const result = await askCurrentPage("  ", {
    getActivePageMarkdown: async () => context({ markdown: "Article markdown" }),
    ai: aiClient({ ask: async () => "Answer" }),
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "question_required");
});

test("ask current page passes the question only to the AI prompt", async () => {
  const prompts: string[] = [];
  const result = await askCurrentPage("What changed?", {
    getActivePageMarkdown: async () =>
      context({
        title: "Release Notes",
        url: "https://example.com/release",
        markdown: "Release markdown",
      }),
    ai: aiClient({
      ask: async (prompt) => {
        prompts.push(prompt);
        return "Answer";
      },
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /Question: What changed\?/);
  assert.match(prompts[0], /Release markdown/);
  if (result.ok) {
    assert.equal(result.summary, "Answer");
    assert.deepEqual(result.source, {
      title: "Release Notes",
      url: "https://example.com/release",
    });
  }
});

function aiClient(options: {
  canAccessAi?: () => boolean;
  ask: (prompt: string) => Promise<string>;
}): ZenContextCommandAiClient {
  return {
    canAccessAi: options.canAccessAi ?? (() => true),
    ask: options.ask,
  };
}

function context(options: {
  title?: string;
  url?: string;
  markdown?: string;
  isMetadataOnly?: boolean;
}): RaycastZenContext {
  return {
    title: options.title,
    url: options.url,
    markdown: options.markdown,
    isMetadataOnly: options.isMetadataOnly,
    warnings: [],
    raw: {
      page: {
        title: options.title,
        url: options.url,
      },
      content: {
        markdown: options.markdown,
        isMetadataOnly: options.isMetadataOnly,
      },
    },
  };
}

function oldCliContextError(): MozeidonClientError {
  return new MozeidonClientError(
    "command_failed",
    'Failed to run mozeidon command: context active --format markdown\nError: unknown command "context" for "mozeidon"',
    "context active --format markdown",
    undefined,
    'Error: unknown command "context" for "mozeidon"',
  );
}

function nativeAppIpcError(context: string): MozeidonClientError {
  return new MozeidonClientError(
    "command_failed",
    `Failed to run mozeidon command: ${context}\n{"error": "[Error] Cannot read via ipc with host: mozeidon_native_app_51575_396a84a9"}`,
    context,
    undefined,
    '{"error": "[Error] Cannot read via ipc with host: mozeidon_native_app_51575_396a84a9"}',
  );
}
