import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAskCurrentPagePrompt, buildSummarizeCurrentPagePrompt } from "../src/zenContextAi";
import { createRaycastAiClient, RaycastAiUnavailableError } from "../src/raycastAiCore";
import {
  ACTIVE_PAGE_MARKDOWN_ARGS,
  buildSourceAttributedMarkdown,
  classifyZenContextContent,
  fetchActivePageMarkdown,
  parseRaycastZenContext,
  requireRealMarkdownContext,
  ZEN_SELECTION_ARGS,
  ZenContextError,
} from "../src/zenContext";
import { MozeidonClientError } from "../src/mozeidonClient";

test("Zen context helpers expose approved Mozeidon context argument arrays", () => {
  assert.deepEqual(ACTIVE_PAGE_MARKDOWN_ARGS, ["context", "active", "--format", "markdown"]);
  assert.deepEqual(ZEN_SELECTION_ARGS, ["context", "selection"]);
});

test("parseRaycastZenContext extracts page metadata, Markdown, DOM selection, and warning codes", () => {
  const context = parseRaycastZenContext({
    ok: true,
    status: "partial",
    page: {
      title: "Article",
      url: "https://example.com/article",
    },
    content: {
      markdown: "## Body",
      selection: {
        text: " Selected text ",
        source: "dom",
      },
    },
    warnings: ["content_truncated", { code: "metadata_only" }],
  });

  assert.equal(context.title, "Article");
  assert.equal(context.url, "https://example.com/article");
  assert.equal(context.markdown, "## Body");
  assert.equal(context.selectionText, "Selected text");
  assert.equal(context.isDomSelection, true);
  assert.equal(context.isMetadataOnly, true);
  assert.deepEqual(context.warnings, ["content_truncated", "metadata_only"]);
});

test("parseRaycastZenContext accepts structured CLI content values and extraction warnings", () => {
  const context = parseRaycastZenContext({
    ok: true,
    status: "partial",
    page: {
      title: "Raycast",
      url: "https://example.com/raycast",
    },
    content: {
      markdown: {
        value: " [Raycast](https://example.com/raycast) ",
        length: 40,
        truncated: false,
      },
    },
    extraction: {
      contentSource: "tab-metadata",
      warnings: [
        {
          code: "permission_unavailable",
          message: "Missing host permission for the tab",
        },
        {
          code: "content_unavailable",
          message: "Markdown output is derived from basic page text.",
        },
      ],
    },
  });

  assert.equal(context.markdown, "[Raycast](https://example.com/raycast)");
  assert.equal(context.isMetadataOnly, true);
  assert.deepEqual(context.warnings, ["permission_unavailable", "content_unavailable"]);
  assert.throws(() => requireRealMarkdownContext(context), {
    name: "ZenContextError",
    code: "content_unavailable",
  });
});

test("classifyZenContextContent accepts degraded text-derived Markdown as usable", () => {
  const context = parseRaycastZenContext({
    ok: true,
    status: "partial",
    page: {
      title: "Article",
      url: "https://example.com/article",
    },
    content: {
      markdown: {
        value: "# Article\n\nReadable text",
      },
    },
    extraction: {
      contentSource: "document",
      domRead: true,
      warnings: [{ code: "markdown_derived_from_text" }, { code: "markdown_structure_unavailable" }],
    },
  });

  assert.equal(classifyZenContextContent(context.raw), "usable-degraded-content");
  assert.equal(requireRealMarkdownContext(context), "# Article\n\nReadable text");
});

test("classifyZenContextContent rejects title and URL metadata fallback as page content", () => {
  const context = parseRaycastZenContext({
    ok: true,
    status: "partial",
    page: {
      title: "Article",
      url: "https://example.com/article",
    },
    content: {
      markdown: {
        value: "# Article\n\nhttps://example.com/article",
      },
    },
    extraction: {
      contentSource: "tab-metadata",
      domRead: false,
      warnings: [{ code: "tab_metadata_fallback" }, { code: "metadata_only" }, { code: "dom_content_unavailable" }],
    },
  });

  assert.equal(context.isMetadataOnly, true);
  assert.equal(classifyZenContextContent(context.raw), "metadata-only");
  assert.throws(() => requireRealMarkdownContext(context), {
    name: "ZenContextError",
    code: "content_unavailable",
  });
});

test("classifyZenContextContent distinguishes empty and error payloads", () => {
  assert.equal(
    classifyZenContextContent({
      ok: true,
      status: "empty",
      extraction: {
        contentSource: "selector",
        domRead: true,
        warnings: [{ code: "selector_no_match" }],
      },
    }),
    "empty",
  );

  assert.equal(
    classifyZenContextContent({
      ok: false,
      status: "error",
      error: {
        code: "restricted_page",
        message: "Restricted page.",
      },
    }),
    "error",
  );
});

test("parseRaycastZenContext ignores non-string content values", () => {
  const context = parseRaycastZenContext({
    ok: true,
    status: "partial",
    page: {
      title: 42 as unknown as string,
      url: "https://example.com",
    },
    content: {
      markdown: {
        value: 42 as unknown as string,
      },
      selection: {
        text: 42 as unknown as string,
        source: "user-selection",
      },
    },
  });

  assert.equal(context.title, undefined);
  assert.equal(context.url, "https://example.com");
  assert.equal(context.markdown, undefined);
  assert.equal(context.selectionText, undefined);
});

test("parseRaycastZenContext treats add-on user-selection as DOM selection", () => {
  const context = parseRaycastZenContext({
    ok: true,
    status: "ok",
    page: {
      title: "Mean",
      url: "https://en.wikipedia.org/wiki/Mean",
    },
    content: {
      selection: {
        text: "Triangular sets selected text",
        source: "user-selection",
      },
    },
    extraction: {
      contentSource: "selection",
      warnings: [],
    },
  });

  assert.equal(context.selectionText, "Triangular sets selected text");
  assert.equal(context.isDomSelection, true);
});

test("fetchActivePageMarkdown retries with default profile when configured profile id is stale", () => {
  const calls: string[][] = [];
  const context = fetchActivePageMarkdown({
    executable: "mozeidon",
    profileId: "stale-profile",
    execFile: (_file, args) => {
      calls.push(args);
      if (calls.length === 1) {
        throw new MozeidonClientError(
          "command_failed",
          "Failed to run mozeidon command",
          args.join(" "),
          undefined,
          undefined,
          JSON.stringify({
            kind: "zen.context.error",
            ok: false,
            code: "profile_not_found",
            message: "No profileId or profileAlias matching stale-profile",
          }),
        );
      }

      return JSON.stringify({
        ok: true,
        status: "ok",
        page: {
          title: "Current Page",
          url: "https://example.com/current",
        },
        content: {
          markdown: {
            value: "Current page content",
            length: 20,
            truncated: false,
          },
        },
        extraction: {
          contentSource: "document",
          warnings: [],
        },
      });
    },
  });

  assert.deepEqual(calls, [
    ["--profile-id", "stale-profile", "context", "active", "--format", "markdown"],
    ["context", "active", "--format", "markdown"],
  ]);
  assert.equal(context.markdown, "Current page content");
});

test("buildSourceAttributedMarkdown prepends title and URL when context Markdown lacks attribution", () => {
  assert.equal(
    buildSourceAttributedMarkdown({
      title: "Example Page",
      url: "https://example.com/page",
      markdown: "Page body",
    }),
    "# Example Page\n\nSource: https://example.com/page\n\nPage body",
  );
});

test("buildSourceAttributedMarkdown avoids duplicating existing source attribution", () => {
  const markdown = "# Example Page\n\nSource: https://example.com/page\n\nPage body";

  assert.equal(
    buildSourceAttributedMarkdown({
      title: "Example Page",
      url: "https://example.com/page",
      markdown,
    }),
    markdown,
  );
});

test("requireRealMarkdownContext refuses metadata-only fallback content", () => {
  assert.throws(
    () =>
      requireRealMarkdownContext({
        markdown: "# Example\n\nSource: https://example.com",
        isMetadataOnly: true,
      }),
    {
      name: "ZenContextError",
      code: "content_unavailable",
    },
  );
});

test("current page summary prompt requires real page content and includes source metadata", () => {
  const prompt = buildSummarizeCurrentPagePrompt({
    title: "Example Page",
    url: "https://example.com/page",
    markdown: "Page body",
    isMetadataOnly: false,
    warnings: [],
    raw: {},
  });

  assert.match(prompt, /Summarize only the supplied Zen page context/);
  assert.match(prompt, /Title: Example Page/);
  assert.match(prompt, /URL: https:\/\/example\.com\/page/);
  assert.match(prompt, /Page body/);
});

test("ask current page prompt keeps the question in AI prompt only", () => {
  const unsafeQuestion = 'What about this?"; rm -rf /';
  const prompt = buildAskCurrentPagePrompt(unsafeQuestion, {
    title: "Example Page",
    url: "https://example.com/page",
    markdown: "Page body",
    isMetadataOnly: false,
    warnings: [],
    raw: {},
  });

  assert.match(prompt, /Question: What about this\?"; rm -rf \//);
  assert.match(prompt, /If the answer is not present/);
});

test("Raycast AI client uses environment.canAccess when available", async () => {
  const client = createRaycastAiClient({
    AI: {
      ask: async () => "summary",
    },
    environment: {
      canAccess: () => false,
    },
  });

  assert.equal(client.canAccessAi(), false);
  await assert.rejects(() => client.ask("prompt"), RaycastAiUnavailableError);
});

test("Raycast AI client falls back to AI.ask when canAccess is unavailable", async () => {
  const client = createRaycastAiClient({
    AI: {
      ask: async (prompt) => `answered: ${prompt}`,
    },
  });

  assert.equal(client.canAccessAi(), true);
  assert.equal(await client.ask("prompt"), "answered: prompt");
});

test("Raycast AI client maps AI.ask failures to graceful unavailable errors", async () => {
  const client = createRaycastAiClient({
    AI: {
      ask: async () => {
        throw new Error("AI account unavailable");
      },
    },
  });

  await assert.rejects(() => client.ask("prompt"), {
    name: "RaycastAiUnavailableError",
    message: "AI account unavailable",
  });
});

test("parseRaycastZenContext throws non-recoverable structured context errors", () => {
  assert.throws(
    () =>
      parseRaycastZenContext({
        ok: false,
        status: "error",
        error: {
          code: "native_app_unreachable",
          message: "Native app is not reachable.",
        },
      }),
    {
      name: "ZenContextError",
      code: "native_app_unreachable",
    },
  );
});

test("ZenContextError exposes code and context", () => {
  const error = new ZenContextError("content_unavailable", "No content", { ok: true });

  assert.equal(error.code, "content_unavailable");
  assert.equal(error.context?.ok, true);
});
