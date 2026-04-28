package core

import (
	"encoding/json"
	"testing"
	"time"

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
	if !context.OK || context.Status != ContextStatusOK {
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
	if context.Capabilities.PageContent != "permission-required" {
		t.Fatalf("expected pageContent permission-required, got %s", context.Capabilities.PageContent)
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
	if context.Capabilities.PageContent != "unavailable" {
		t.Fatalf("expected pageContent unavailable, got %s", context.Capabilities.PageContent)
	}
	if context.Permissions.RequiresHostPermission {
		t.Fatalf("did not expect host permission to make unsupported page readable, got %#v", context.Permissions)
	}
	if context.Content == nil || context.Content.Markdown == nil {
		t.Fatal("expected title/URL markdown context to remain available")
	}
}

func TestContextMetadataIncludesJSONLDRawAndSummaryFields(t *testing.T) {
	context := NewContextFromTab(
		models.Tab{Id: 123, WindowId: 456, Url: "https://example.com", Title: "Example", Active: true},
		models.Window{Id: 456, IsLastFocused: true},
		nil,
		ContextOptions{Mode: ContextModeMetadata},
		time.Date(2026, 4, 28, 9, 45, 0, 0, time.UTC),
	)

	if context.Status != ContextStatusPartial {
		t.Fatalf("expected partial metadata status, got %s", context.Status)
	}
	if context.Metadata == nil || context.Metadata.JSONLD == nil {
		t.Fatal("expected JSON-LD metadata object")
	}
	if context.Metadata.JSONLD.Raw == nil || context.Metadata.JSONLD.Summary == nil {
		t.Fatalf("expected raw and summary JSON-LD slices, got %#v", context.Metadata.JSONLD)
	}
	if len(context.Extraction.Warnings) != 1 || context.Extraction.Warnings[0].Code != "permission_unavailable" {
		t.Fatalf("expected permission warning, got %#v", context.Extraction.Warnings)
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

func hasString(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}
