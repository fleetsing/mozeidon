const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  DEFAULT_LIMITS,
  parseContextRequest,
} = require("../.test-dist/src/services/context/request.js")
const {
  domainFromUrl,
  isUnsupportedContextUrl,
} = require("../.test-dist/src/services/context/urls.js")
const {
  mergeTruncation,
  truncate,
  truncationFromWarnings,
} = require("../.test-dist/src/services/context/truncation.js")
const {
  createInjectedExtractorCode,
} = require("../.test-dist/src/services/context/injected-extractor.js")
const {
  contextError,
} = require("../.test-dist/src/services/context/errors.js")
const {
  permissionFallback,
  unsupportedFallback,
} = require("../.test-dist/src/services/context/fallbacks.js")
const {
  buildPayload,
} = require("../.test-dist/src/services/context/payload.js")

const htmlSanitizerMissing = require("./fixtures/context/html-sanitizer-missing.json")
const permissionSelection = require("./fixtures/context/permission-selection.json")
const unsupportedPageMarkdown = require("./fixtures/context/unsupported-page-markdown.json")

function asJsonValue(value) {
  return JSON.parse(JSON.stringify(value))
}

const window = { id: 3, isLastFocused: true }

function tab(overrides = {}) {
  return {
    id: 7,
    windowId: 3,
    title: "Example Article",
    pinned: false,
    url: "https://www.example.com/article",
    active: true,
    lastAccessed: 1234.56,
    index: 2,
    ...overrides,
  }
}

test("parseContextRequest preserves current defaults and limit merging", () => {
  assert.deepEqual(parseContextRequest(), {
    request: {
      mode: "active",
      format: "json",
      selector: undefined,
      limits: DEFAULT_LIMITS,
    },
  })

  assert.deepEqual(
    parseContextRequest(
      JSON.stringify({
        mode: "selection",
        format: "markdown",
        selector: "main",
        limits: { maxTextBytes: 12 },
      })
    ),
    {
      request: {
        mode: "selection",
        format: "markdown",
        selector: "main",
        limits: { ...DEFAULT_LIMITS, maxTextBytes: 12 },
      },
    }
  )
})

test("parseContextRequest preserves invalid request errors and fallback parsing", () => {
  assert.deepEqual(parseContextRequest("{"), {
    error: {
      code: "invalid_context_request",
      message: "Context request args must be valid JSON.",
      details: { args: "{" },
    },
  })

  assert.deepEqual(parseContextRequest("[]"), {
    error: {
      code: "invalid_context_request",
      message: "Context request args must be a JSON object.",
      details: { receivedType: "array" },
    },
  })

  assert.deepEqual(
    parseContextRequest(JSON.stringify({ mode: "bogus", format: "bogus" })),
    {
      request: {
        mode: "active",
        format: "json",
        selector: undefined,
        limits: DEFAULT_LIMITS,
      },
    }
  )
})

test("URL helpers preserve unsupported-page and domain behavior", () => {
  assert.equal(isUnsupportedContextUrl("https://www.example.com/path"), false)
  assert.equal(isUnsupportedContextUrl("http://example.com/path"), false)
  assert.equal(isUnsupportedContextUrl("about:blank"), false)
  assert.equal(isUnsupportedContextUrl("about:config"), true)
  assert.equal(isUnsupportedContextUrl("moz-extension://abc/page.html"), true)
  assert.equal(isUnsupportedContextUrl("file:///tmp/page.html"), true)
  assert.equal(isUnsupportedContextUrl("not a url"), true)
  assert.equal(isUnsupportedContextUrl(undefined), true)

  assert.equal(domainFromUrl("https://www.example.com/path"), "example.com")
  assert.equal(domainFromUrl("not a url"), "")
  assert.equal(domainFromUrl(undefined), "")
})

test("truncation helpers preserve byte limits and warning fields", () => {
  const warnings = []
  assert.deepEqual(truncate("abc", 4, "content.text", warnings), {
    value: "abc",
    length: 3,
    truncated: false,
  })
  assert.deepEqual(warnings, [])

  const truncated = truncate("ååå", 3, "content.text", warnings)
  assert.deepEqual(truncated, {
    value: "å",
    length: 1,
    truncated: true,
  })
  assert.deepEqual(warnings, [
    {
      code: "content_truncated",
      message: "Context content was truncated to fit the configured size limit.",
      field: "content.text",
    },
  ])
  assert.deepEqual(truncationFromWarnings(warnings), {
    truncated: true,
    fields: ["content.text"],
  })
  assert.deepEqual(
    mergeTruncation({ truncated: true, fields: ["content.text"] }, warnings),
    { truncated: true, fields: ["content.text"] }
  )
})

test("createInjectedExtractorCode serializes request data safely", () => {
  const selector = 'main");globalThis.__contextInjection = true;//'
  const request = {
    mode: "active",
    format: "markdown",
    selector,
    limits: DEFAULT_LIMITS,
  }
  const code = createInjectedExtractorCode(request)

  assert.equal(code.includes(JSON.stringify(request)), true)
  assert.equal(code.includes(`${selector})`), false)
  assert.doesNotThrow(() => new Function(code))
})

test("golden fixture preserves html_sanitizer_missing error shape", () => {
  assert.deepEqual(
    asJsonValue(
      contextError(
        "html_sanitizer_missing",
        "HTML context output requires sanitizer support before it can be enabled."
      )
    ),
    htmlSanitizerMissing
  )
})

test("golden fixture preserves permission fallback selection payload", () => {
  const request = parseContextRequest(
    JSON.stringify({ mode: "selection" })
  ).request
  const payload = buildPayload(
    request,
    tab(),
    window,
    permissionFallback(request, "Browser denied page-content extraction.")
  )

  assert.deepEqual(asJsonValue(payload), permissionSelection)
})

test("golden fixture preserves unsupported page Markdown fallback payload", () => {
  const request = parseContextRequest(
    JSON.stringify({ mode: "active", format: "markdown" })
  ).request
  const currentTab = tab({ url: "about:config" })
  const payload = buildPayload(
    request,
    currentTab,
    window,
    unsupportedFallback(request, currentTab)
  )

  assert.deepEqual(asJsonValue(payload), unsupportedPageMarkdown)
})
