package core

import (
	"encoding/json"
	"testing"
	"time"

	browsercore "github.com/egovelox/mozeidon/browser/core"
	"github.com/egovelox/mozeidon/browser/core/models"
	"github.com/egovelox/mozeidon/profiles"
)

func TestNewContextFromTabBuildsContractJSON(t *testing.T) {
	capturedAt := time.Date(2026, 4, 28, 9, 45, 0, 0, time.UTC)
	tab := models.Tab{
		Id:           123,
		WindowId:     456,
		GroupId:      -1,
		Pinned:       true,
		Domain:       "example.com",
		Url:          "https://example.com/page",
		Title:        "Example Page",
		Active:       true,
		LastAccessed: 1710000000000,
		Index:        3,
	}
	window := models.Window{Id: 456, IsLastFocused: true}
	profile := &profiles.Profile{
		BrowserVersion: "1.0",
		ProfileId:      "Zen",
		ProfileAlias:   "Personal",
		ProfileName:    "Default",
	}

	context := NewContextFromTab(tab, window, profile, ContextOptions{Mode: ContextModeActive}, capturedAt)

	if context.Kind != ContextKind {
		t.Fatalf("expected kind %q, got %q", ContextKind, context.Kind)
	}
	if !context.OK || context.Status != ContextStatusPartial {
		t.Fatalf("expected ok status, got ok=%v status=%s", context.OK, context.Status)
	}
	if context.Source.Output != ContextOutputJSON || context.Source.Format != ContextFormatJSON {
		t.Fatalf("expected json source, got output=%s format=%s", context.Source.Output, context.Source.Format)
	}
	if context.Source.ProfileID != "Zen" || context.Source.ProfileAlias != "Personal" {
		t.Fatalf("expected profile plumbing, got %#v", context.Source)
	}
	if context.Page.URL != "https://example.com/page" || context.Page.Title != "Example Page" {
		t.Fatalf("expected page identity, got %#v", context.Page)
	}
	if context.Window.ID != 456 || !context.Window.LastFocused {
		t.Fatalf("expected last focused window, got %#v", context.Window)
	}
	if context.Tab.GroupID != 0 {
		t.Fatalf("expected non-positive group id omitted, got %d", context.Tab.GroupID)
	}
	if context.Permissions.CanReadPageContent {
		t.Fatal("expected page-content permission to be unavailable")
	}
	if !context.Permissions.CanReadTabMetadata || context.Permissions.HasDOMAccess {
		t.Fatalf("expected tab metadata without DOM access, got %#v", context.Permissions)
	}
	if context.Capabilities.PageContent != "permission-required" {
		t.Fatalf("expected pageContent permission-required, got %s", context.Capabilities.PageContent)
	}
	if context.Extraction.ContentSource != "tab-metadata" || context.Extraction.DOMRead {
		t.Fatalf("expected JSON fallback to be marked as tab metadata without DOM read, got %#v", context.Extraction)
	}
	if !hasWarning(context.Extraction.Warnings, "tab_metadata_fallback") ||
		!hasWarning(context.Extraction.Warnings, "metadata_only") ||
		!hasWarning(context.Extraction.Warnings, "dom_content_unavailable") {
		t.Fatalf("expected JSON fallback taxonomy warnings, got %#v", context.Extraction.Warnings)
	}
	if hasWarning(context.Extraction.Warnings, "content_unavailable") {
		t.Fatalf("did not expect content_unavailable for JSON metadata fallback, got %#v", context.Extraction.Warnings)
	}

	if _, err := json.Marshal(context); err != nil {
		t.Fatalf("expected context to marshal: %v", err)
	}
}

func TestFindActiveContextTabPrefersLastFocusedWindow(t *testing.T) {
	tabs := []models.Tab{
		{Id: 1, WindowId: 100, Active: true},
		{Id: 2, WindowId: 200, Active: true},
	}
	windows := []models.Window{
		{Id: 100, IsLastFocused: false},
		{Id: 200, IsLastFocused: true},
	}

	tab, window, ok := FindActiveContextTab(tabs, windows)

	if !ok {
		t.Fatal("expected active context tab")
	}
	if tab.Id != 2 || window.Id != 200 {
		t.Fatalf("expected active tab in last focused window, got tab=%d window=%d", tab.Id, window.Id)
	}
}

func TestFindActiveContextTabFallsBackToAnyActiveTab(t *testing.T) {
	tabs := []models.Tab{
		{Id: 1, WindowId: 100, Active: true},
		{Id: 2, WindowId: 200, Active: false},
	}
	windows := []models.Window{
		{Id: 200, IsLastFocused: true},
	}

	tab, window, ok := FindActiveContextTab(tabs, windows)

	if !ok {
		t.Fatal("expected fallback active context tab")
	}
	if tab.Id != 1 || window.Id != 100 {
		t.Fatalf("expected fallback active tab with synthetic window, got tab=%d window=%d", tab.Id, window.Id)
	}
}

func TestBuildContextPayloadUsesRestrictedPageForSelectorOnRestrictedFallback(t *testing.T) {
	app := &App{
		browser: &browsercore.BrowserService{CommandSender: fakeCommandSender{
			"get-context": []models.CommandResult{},
			"get-tabs": {commandResult(t, models.Tabs{Items: []models.Tab{{
				Id:       123,
				WindowId: 456,
				Url:      "about:config",
				Title:    "Advanced Preferences",
				Active:   true,
			}}})},
			"get-windows": {commandResult(t, models.Windows{Items: []models.Window{{
				Id:            456,
				IsLastFocused: true,
			}}})},
		}},
	}

	exitCode, payload := app.BuildContextPayload(
		ContextOptions{Mode: ContextModeActive, Format: ContextFormatMarkdown, Selector: "main"},
		time.Date(2026, 4, 30, 9, 45, 0, 0, time.UTC),
	)

	contextError, ok := payload.(ZenContextError)
	if !ok {
		t.Fatalf("expected context error payload, got %#v", payload)
	}
	if exitCode != 3 {
		t.Fatalf("expected restricted selector exit code 3, got %d", exitCode)
	}
	if contextError.Code != "restricted_page" {
		t.Fatalf("expected restricted_page error, got %#v", contextError)
	}
	if contextError.Details["legacyCode"] != "unsupported_page" {
		t.Fatalf("expected unsupported_page legacy code, got %#v", contextError.Details)
	}
}

func TestContextFormatTextPopulatesStructuredText(t *testing.T) {
	context := NewContextFromTab(
		models.Tab{Id: 123, WindowId: 456, Url: "https://example.com", Title: "Example", Active: true},
		models.Window{Id: 456, IsLastFocused: true},
		nil,
		ContextOptions{Mode: ContextModeActive, Format: ContextFormatText},
		time.Date(2026, 4, 28, 9, 45, 0, 0, time.UTC),
	)

	if context.Content == nil || context.Content.Text == nil {
		t.Fatal("expected structured text content")
	}
	if context.Content.Text.Value != "Example\nhttps://example.com" {
		t.Fatalf("unexpected text content: %q", context.Content.Text.Value)
	}
	if context.Source.Output != ContextOutputJSON {
		t.Fatalf("expected structured JSON output, got %s", context.Source.Output)
	}
	if context.Extraction.ContentSource != "tab-metadata" || context.Extraction.DOMRead {
		t.Fatalf("expected text fallback to be marked as tab metadata without DOM read, got %#v", context.Extraction)
	}
	if !hasWarning(context.Extraction.Warnings, "tab_metadata_fallback") ||
		!hasWarning(context.Extraction.Warnings, "metadata_only") ||
		!hasWarning(context.Extraction.Warnings, "dom_content_unavailable") {
		t.Fatalf("expected text fallback taxonomy warnings, got %#v", context.Extraction.Warnings)
	}
	if hasWarning(context.Extraction.Warnings, "content_unavailable") {
		t.Fatalf("did not expect content_unavailable for metadata fallback, got %#v", context.Extraction.Warnings)
	}
}

func TestContextGeneratedTextRespectsMaxBytes(t *testing.T) {
	context := NewContextFromTab(
		models.Tab{
			Id:       123,
			WindowId: 456,
			Url:      "https://example.com/long-page",
			Title:    "Example Long Page Title",
			Active:   true,
		},
		models.Window{Id: 456, IsLastFocused: true},
		nil,
		ContextOptions{Mode: ContextModeActive, Format: ContextFormatText, MaxBytes: 10},
		time.Date(2026, 4, 28, 9, 45, 0, 0, time.UTC),
	)

	if context.Content == nil || context.Content.Text == nil {
		t.Fatal("expected structured text content")
	}
	if len(context.Content.Text.Value) > 10 {
		t.Fatalf("expected text to be truncated to max bytes, got %q", context.Content.Text.Value)
	}
	if !context.Content.Text.Truncated {
		t.Fatal("expected text truncated flag")
	}
	if context.Status != ContextStatusPartial {
		t.Fatalf("expected partial status for truncated content, got %s", context.Status)
	}
	if !hasWarning(context.Extraction.Warnings, "content_truncated") {
		t.Fatalf("expected content_truncated warning, got %#v", context.Extraction.Warnings)
	}
	if !context.Extraction.Truncation.Truncated || !hasString(context.Extraction.Truncation.Fields, "content.text") {
		t.Fatalf("expected truncation metadata for content.text, got %#v", context.Extraction.Truncation)
	}
}

func TestContextReportsUnsupportedPage(t *testing.T) {
	context := NewContextFromTab(
		models.Tab{
			Id:       123,
			WindowId: 456,
			Url:      "about:config",
			Title:    "Advanced Preferences",
			Active:   true,
		},
		models.Window{Id: 456, IsLastFocused: true},
		nil,
		ContextOptions{Mode: ContextModeActive, Format: ContextFormatMarkdown},
		time.Date(2026, 4, 28, 9, 45, 0, 0, time.UTC),
	)

	if context.Status != ContextStatusPartial {
		t.Fatalf("expected partial status for unsupported page, got %s", context.Status)
	}
	if !hasWarning(context.Extraction.Warnings, "unsupported_page") {
		t.Fatalf("expected unsupported_page warning, got %#v", context.Extraction.Warnings)
	}
	if !hasWarning(context.Extraction.Warnings, "restricted_page") ||
		!hasWarning(context.Extraction.Warnings, "tab_metadata_fallback") ||
		!hasWarning(context.Extraction.Warnings, "metadata_only") {
		t.Fatalf("expected restricted metadata fallback warnings, got %#v", context.Extraction.Warnings)
	}
	if hasWarning(context.Extraction.Warnings, "content_unavailable") {
		t.Fatalf("did not expect content_unavailable for unsupported metadata fallback, got %#v", context.Extraction.Warnings)
	}
	if context.Capabilities.PageContent != "unavailable" {
		t.Fatalf("expected pageContent unavailable, got %s", context.Capabilities.PageContent)
	}
	if !context.Permissions.CanReadTabMetadata || context.Permissions.HasDOMAccess || context.Permissions.CanReadActiveTab {
		t.Fatalf("expected unsupported page to expose tab metadata without DOM access, got %#v", context.Permissions)
	}
	if context.Content == nil || context.Content.Markdown == nil {
		t.Fatal("expected title/URL markdown context to remain available")
	}
	assertNoDuplicateWarnings(t, context.Extraction.Warnings)
}

func TestContextDeduplicatesUnsupportedJSONFallbackWarnings(t *testing.T) {
	context := NewContextFromTab(
		models.Tab{
			Id:       123,
			WindowId: 456,
			Url:      "about:config",
			Title:    "Advanced Preferences",
			Active:   true,
		},
		models.Window{Id: 456, IsLastFocused: true},
		nil,
		ContextOptions{Mode: ContextModeActive, Format: ContextFormatJSON},
		time.Date(2026, 4, 30, 20, 45, 0, 0, time.UTC),
	)

	assertNoDuplicateWarnings(t, context.Extraction.Warnings)
	if countWarning(context.Extraction.Warnings, "dom_content_unavailable", "content") != 1 {
		t.Fatalf("expected one dom_content_unavailable warning for content, got %#v", context.Extraction.Warnings)
	}
}

func TestContextDoesNotTreatAboutBlankAsUnsupported(t *testing.T) {
	context := NewContextFromTab(
		models.Tab{
			Id:       123,
			WindowId: 456,
			Url:      "about:blank",
			Title:    "Blank Page",
			Active:   true,
		},
		models.Window{Id: 456, IsLastFocused: true},
		nil,
		ContextOptions{Mode: ContextModeActive, Format: ContextFormatText},
		time.Date(2026, 4, 28, 9, 45, 0, 0, time.UTC),
	)

	if hasWarning(context.Extraction.Warnings, "unsupported_page") {
		t.Fatalf("did not expect about:blank to be marked unsupported, got %#v", context.Extraction.Warnings)
	}
	if context.Capabilities.PageContent != "permission-required" {
		t.Fatalf("expected about:blank to remain permission-gated, got %s", context.Capabilities.PageContent)
	}
}

func TestNewContextExtractionRequestIncludesLimitsAndSelector(t *testing.T) {
	request := NewContextExtractionRequest(ContextOptions{
		Mode:     ContextModeActive,
		Format:   ContextFormatMarkdown,
		Selector: "main article",
		MaxBytes: 1234,
	})

	if request.Mode != ContextModeActive || request.Format != ContextFormatMarkdown {
		t.Fatalf("unexpected request mode/format: %#v", request)
	}
	if request.Selector != "main article" {
		t.Fatalf("expected selector to be preserved, got %q", request.Selector)
	}
	if request.Limits.MaxBytes != 1234 {
		t.Fatalf("expected custom maxBytes, got %#v", request.Limits)
	}
	if request.Limits.MaxTextBytes != DefaultTextBytes || request.Limits.MaxMarkdownBytes != DefaultMarkdownMax {
		t.Fatalf("expected default field limits, got %#v", request.Limits)
	}
}

func TestNewContextFromExtractionPayloadMapsContentAndMetadata(t *testing.T) {
	payload := ContextExtractionPayload{
		OK:     true,
		Status: ContextStatusPartial,
		Tab: models.Tab{
			Id:       123,
			WindowId: 456,
			Url:      "https://example.com/page",
			Title:    "Example",
			Active:   true,
		},
		Window: models.Window{Id: 456, IsLastFocused: true},
		Page: ZenPageInfo{
			URL:          "https://example.com/page",
			Title:        "Example",
			Domain:       "example.com",
			Language:     "en",
			CanonicalURL: "https://example.com/page",
		},
		Content: &ZenContentInfo{
			Text: &ZenTextContent{Value: "Readable page", Length: 13},
		},
		Metadata: &ZenMetadataInfo{
			OpenGraph: map[string]interface{}{"og:title": "Example"},
			JSONLD: &ZenJSONLDInfo{
				Raw:     []interface{}{map[string]interface{}{"@type": "Article"}},
				Summary: []ZenJSONLDSummary{{Type: "Article", Headline: "Example"}},
			},
			Links: []ZenLink{{Text: "Docs", Href: "https://example.com/docs", Kind: "anchor"}},
		},
		Extraction: ZenExtractionInfo{
			Mode:          ContextModeActive,
			ContentSource: "document",
			DOMRead:       true,
			Warnings: []ZenExtractionWarning{{
				Code:    "content_truncated",
				Message: "Content was truncated.",
				Field:   "content.text",
			}},
			Limits:     contextLimits(ContextOptions{MaxBytes: 42}),
			Truncation: ZenTruncationInfo{Truncated: true, Fields: []string{"content.text"}},
		},
		Permissions: ZenPermissionInfo{
			CanReadTabMetadata: true,
			HasDOMAccess:       true,
			HasHostPermission:  true,
			CanReadPageContent: true,
		},
		Capabilities: ZenCapabilityInfo{
			ActiveTab:   "available",
			PageContent: "available",
			Selection:   "available",
			Metadata:    "available",
			Links:       "available",
		},
	}
	profile := &profiles.Profile{ProfileId: "Zen", ProfileAlias: "Personal"}

	context := NewContextFromExtractionPayload(
		payload,
		profile,
		ContextOptions{Mode: ContextModeActive, Format: ContextFormatText},
		time.Date(2026, 4, 28, 9, 45, 0, 0, time.UTC),
	)

	if context.Status != ContextStatusPartial {
		t.Fatalf("expected payload status to be preserved, got %s", context.Status)
	}
	if context.Source.ProfileID != "Zen" || context.Source.ProfileAlias != "Personal" {
		t.Fatalf("expected source profile fields, got %#v", context.Source)
	}
	if context.Page.CanonicalURL != "https://example.com/page" || context.Page.Language != "en" {
		t.Fatalf("expected page metadata to map, got %#v", context.Page)
	}
	if context.Content == nil || context.Content.Text == nil || context.Content.Text.Value != "Readable page" {
		t.Fatalf("expected text content to map, got %#v", context.Content)
	}
	if context.Metadata == nil || context.Metadata.JSONLD == nil || len(context.Metadata.JSONLD.Raw) != 1 {
		t.Fatalf("expected metadata to map, got %#v", context.Metadata)
	}
	if !context.Extraction.Truncation.Truncated || !hasWarning(context.Extraction.Warnings, "content_truncated") {
		t.Fatalf("expected truncation metadata and warning, got %#v", context.Extraction)
	}
	if !context.Extraction.DOMRead || context.Extraction.ContentSource != "document" {
		t.Fatalf("expected DOM extraction metadata to map, got %#v", context.Extraction)
	}

	var marshaled map[string]interface{}
	contextBytes, err := json.Marshal(context)
	if err != nil {
		t.Fatalf("expected context to marshal: %v", err)
	}
	if err := json.Unmarshal(contextBytes, &marshaled); err != nil {
		t.Fatalf("expected context to unmarshal: %v", err)
	}
	metadata := marshaled["metadata"].(map[string]interface{})
	jsonLD := metadata["jsonLd"].(map[string]interface{})
	if _, ok := jsonLD["raw"].([]interface{}); !ok {
		t.Fatalf("expected metadata.jsonLd.raw array in serialized JSON, got %#v", jsonLD["raw"])
	}
	if _, ok := jsonLD["summary"].([]interface{}); !ok {
		t.Fatalf("expected metadata.jsonLd.summary array in serialized JSON, got %#v", jsonLD["summary"])
	}
}

func TestReadContextExtractionPayloadTimesOutWhenNoResponseArrives(t *testing.T) {
	results := make(chan models.CommandResult)
	timeout := make(chan time.Time)
	close(timeout)

	if _, ok := readContextExtractionPayload(results, timeout); ok {
		t.Fatal("expected missing context extraction response to fall back")
	}
}

func TestReadContextExtractionPayloadParsesPayloadEnvelope(t *testing.T) {
	results := make(chan models.CommandResult, 1)
	timeout := make(chan time.Time)
	payload := ContextExtractionPayload{
		OK:     true,
		Status: ContextStatusOK,
		Page: ZenPageInfo{
			URL:   "https://example.com",
			Title: "Example",
		},
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("expected payload to marshal: %v", err)
	}
	envelopeBytes, err := json.Marshal(map[string]json.RawMessage{"data": payloadBytes})
	if err != nil {
		t.Fatalf("expected envelope to marshal: %v", err)
	}
	results <- models.CommandResult{Data: envelopeBytes}

	actual, ok := readContextExtractionPayload(results, timeout)
	if !ok {
		t.Fatal("expected context extraction payload")
	}
	if !actual.OK || actual.Page.URL != "https://example.com" {
		t.Fatalf("unexpected context extraction payload: %#v", actual)
	}
}

func TestContextMetadataFallbackOmitsEmptyMetadataWhenPermissionUnavailable(t *testing.T) {
	for _, mode := range []ContextMode{ContextModeMetadata, ContextModeLinks} {
		context := NewContextFromTab(
			models.Tab{Id: 123, WindowId: 456, Url: "https://example.com", Title: "Example", Active: true},
			models.Window{Id: 456, IsLastFocused: true},
			nil,
			ContextOptions{Mode: mode},
			time.Date(2026, 4, 28, 9, 45, 0, 0, time.UTC),
		)

		if context.Status != ContextStatusPartial {
			t.Fatalf("expected partial %s status, got %s", mode, context.Status)
		}
		if context.Metadata != nil {
			t.Fatalf("did not expect empty metadata for %s when permission is unavailable, got %#v", mode, context.Metadata)
		}
		if !hasWarning(context.Extraction.Warnings, "permission_unavailable") ||
			!hasWarning(context.Extraction.Warnings, "host_permission_missing") ||
			!hasWarning(context.Extraction.Warnings, "dom_content_unavailable") {
			t.Fatalf("expected permission warning for %s, got %#v", mode, context.Extraction.Warnings)
		}
	}
}

func TestContextSelectionFallbackOmitsCollapsedStateWhenPermissionUnavailable(t *testing.T) {
	context := NewContextFromTab(
		models.Tab{Id: 123, WindowId: 456, Url: "https://example.com", Title: "Example", Active: true},
		models.Window{Id: 456, IsLastFocused: true},
		nil,
		ContextOptions{Mode: ContextModeSelection},
		time.Date(2026, 4, 28, 9, 45, 0, 0, time.UTC),
	)

	if context.Status != ContextStatusPartial {
		t.Fatalf("expected partial selection status, got %s", context.Status)
	}
	if context.Content != nil {
		t.Fatalf("did not expect collapsed selection fallback when permission is unavailable, got %#v", context.Content)
	}
	if !hasWarning(context.Extraction.Warnings, "permission_unavailable") ||
		!hasWarning(context.Extraction.Warnings, "host_permission_missing") ||
		!hasWarning(context.Extraction.Warnings, "dom_content_unavailable") {
		t.Fatalf("expected permission warning, got %#v", context.Extraction.Warnings)
	}
}

func TestNewContextErrorUsesStructuredJSONContract(t *testing.T) {
	capturedAt := time.Date(2026, 4, 28, 9, 45, 0, 0, time.UTC)
	contextError := NewContextError(
		ContextOptions{Mode: ContextModeActive, Format: ContextFormatHTML},
		capturedAt,
		"html_sanitizer_missing",
		"HTML context output requires sanitizer support before it can be enabled.",
		nil,
	)

	if contextError.Kind != ContextErrorKind || contextError.OK {
		t.Fatalf("expected context error, got %#v", contextError)
	}
	if contextError.Status != ContextStatusError || contextError.Code != "html_sanitizer_missing" {
		t.Fatalf("unexpected error status/code: %#v", contextError)
	}
	if contextError.Source.Output != ContextOutputJSON || contextError.Source.Format != ContextFormatHTML {
		t.Fatalf("expected structured JSON html error source, got %#v", contextError.Source)
	}
}

func TestContextExitCodeClassifiesRequestErrors(t *testing.T) {
	if got := contextExitCode("invalid_context_request"); got != 2 {
		t.Fatalf("expected invalid_context_request to use usage exit code 2, got %d", got)
	}
	if got := contextExitCode("selector_unsupported"); got != 2 {
		t.Fatalf("expected selector_unsupported to use usage exit code 2, got %d", got)
	}
}

func TestParseContextFormat(t *testing.T) {
	tests := map[string]ContextFormat{
		"":         ContextFormatJSON,
		"json":     ContextFormatJSON,
		"markdown": ContextFormatMarkdown,
		"text":     ContextFormatText,
		"html":     ContextFormatHTML,
		"HTML":     ContextFormatHTML,
	}

	for input, expected := range tests {
		actual, ok := ParseContextFormat(input)
		if !ok {
			t.Fatalf("expected %q to parse", input)
		}
		if actual != expected {
			t.Fatalf("expected %q to parse as %q, got %q", input, expected, actual)
		}
	}

	if _, ok := ParseContextFormat("raw"); ok {
		t.Fatal("did not expect raw format to be accepted")
	}
}

func hasWarning(warnings []ZenExtractionWarning, code string) bool {
	for _, warning := range warnings {
		if warning.Code == code {
			return true
		}
	}
	return false
}

func countWarning(warnings []ZenExtractionWarning, code string, field string) int {
	count := 0
	for _, warning := range warnings {
		if warning.Code == code && warning.Field == field {
			count++
		}
	}
	return count
}

func assertNoDuplicateWarnings(t *testing.T, warnings []ZenExtractionWarning) {
	t.Helper()
	seen := map[string]struct{}{}
	for _, warning := range warnings {
		key := warning.Code + "\x00" + warning.Field
		if _, ok := seen[key]; ok {
			t.Fatalf("duplicate warning code/field %q/%q in %#v", warning.Code, warning.Field, warnings)
		}
		seen[key] = struct{}{}
	}
}

type fakeCommandSender map[string][]models.CommandResult

func (sender fakeCommandSender) Send(command models.Command) <-chan models.CommandResult {
	results := make(chan models.CommandResult, len(sender[command.Command]))
	for _, result := range sender[command.Command] {
		results <- result
	}
	close(results)
	return results
}

func commandResult(t *testing.T, value interface{}) models.CommandResult {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("expected command result to marshal: %v", err)
	}
	return models.CommandResult{Data: data}
}

func hasString(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}
