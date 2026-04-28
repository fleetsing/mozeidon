package core

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/egovelox/mozeidon/browser/core/models"
	"github.com/egovelox/mozeidon/profiles"
)

const (
	ContextKind        = "zen.context"
	ContextErrorKind   = "zen.context.error"
	ContextVersion     = 1
	ContextProvider    = "mozeidon"
	ContextOutputJSON  = "json"
	DefaultMaxBytes    = 1000000
	DefaultTextBytes   = 50000
	DefaultHTMLBytes   = 250000
	DefaultMarkdownMax = 50000
	DefaultMaxLinks    = 500
	DefaultMaxImages   = 200
	DefaultJSONLDBytes = 100000
)

type ContextMode string

const (
	ContextModeActive    ContextMode = "active"
	ContextModeSelection ContextMode = "selection"
	ContextModeMetadata  ContextMode = "metadata"
	ContextModeLinks     ContextMode = "links"
)

type ContextFormat string

const (
	ContextFormatJSON     ContextFormat = "json"
	ContextFormatMarkdown ContextFormat = "markdown"
	ContextFormatText     ContextFormat = "text"
	ContextFormatHTML     ContextFormat = "html"
)

type ContextStatus string

const (
	ContextStatusOK      ContextStatus = "ok"
	ContextStatusEmpty   ContextStatus = "empty"
	ContextStatusPartial ContextStatus = "partial"
	ContextStatusError   ContextStatus = "error"
)

type ContextOptions struct {
	Mode     ContextMode
	Format   ContextFormat
	Selector string
	MaxBytes int
}

type ZenContext struct {
	Kind         string            `json:"kind"`
	Version      int               `json:"version"`
	OK           bool              `json:"ok"`
	Status       ContextStatus     `json:"status"`
	Source       ZenContextSource  `json:"source"`
	CapturedAt   string            `json:"capturedAt"`
	Browser      ZenBrowserInfo    `json:"browser"`
	Profile      *ZenProfileInfo   `json:"profile,omitempty"`
	Window       ZenWindowInfo     `json:"window"`
	Tab          ZenTabInfo        `json:"tab"`
	Container    *ZenContainerInfo `json:"container,omitempty"`
	Page         ZenPageInfo       `json:"page"`
	Content      *ZenContentInfo   `json:"content,omitempty"`
	Metadata     *ZenMetadataInfo  `json:"metadata,omitempty"`
	Extraction   ZenExtractionInfo `json:"extraction"`
	Permissions  ZenPermissionInfo `json:"permissions"`
	Capabilities ZenCapabilityInfo `json:"capabilities"`
}

type ZenContextError struct {
	Kind       string                 `json:"kind"`
	Version    int                    `json:"version"`
	OK         bool                   `json:"ok"`
	Status     ContextStatus          `json:"status"`
	Code       string                 `json:"code"`
	Message    string                 `json:"message"`
	Source     ZenContextErrorSource  `json:"source"`
	CapturedAt string                 `json:"capturedAt"`
	Details    map[string]interface{} `json:"details,omitempty"`
}

type ZenContextSource struct {
	Provider     string        `json:"provider"`
	Command      string        `json:"command"`
	Format       ContextFormat `json:"format"`
	Output       string        `json:"output"`
	ProfileID    string        `json:"profileId,omitempty"`
	ProfileAlias string        `json:"profileAlias,omitempty"`
}

type ZenContextErrorSource struct {
	Provider string        `json:"provider"`
	Command  string        `json:"command"`
	Format   ContextFormat `json:"format,omitempty"`
	Output   string        `json:"output,omitempty"`
}

type ZenBrowserInfo struct {
	Name    string `json:"name"`
	AppID   string `json:"appId,omitempty"`
	Version string `json:"version,omitempty"`
}

type ZenProfileInfo struct {
	ID    string `json:"id,omitempty"`
	Alias string `json:"alias,omitempty"`
	Name  string `json:"name,omitempty"`
	Path  string `json:"path,omitempty"`
}

type ZenWindowInfo struct {
	ID          int64 `json:"id"`
	Focused     bool  `json:"focused,omitempty"`
	LastFocused bool  `json:"lastFocused,omitempty"`
}

type ZenTabInfo struct {
	ID           int64 `json:"id"`
	WindowID     int64 `json:"windowId"`
	Active       bool  `json:"active"`
	Pinned       bool  `json:"pinned,omitempty"`
	Index        int64 `json:"index,omitempty"`
	LastAccessed int64 `json:"lastAccessed,omitempty"`
	GroupID      int64 `json:"groupId,omitempty"`
}

type ZenContainerInfo struct {
	ID    string `json:"id,omitempty"`
	Name  string `json:"name,omitempty"`
	Icon  string `json:"icon,omitempty"`
	Color string `json:"color,omitempty"`
}

type ZenPageInfo struct {
	URL      string `json:"url"`
	Title    string `json:"title"`
	Domain   string `json:"domain"`
	Favicon  string `json:"favicon,omitempty"`
	Language string `json:"language,omitempty"`
}

type ZenContentInfo struct {
	Text      *ZenTextContent      `json:"text,omitempty"`
	HTML      *ZenHTMLContent      `json:"html,omitempty"`
	Markdown  *ZenMarkdownContent  `json:"markdown,omitempty"`
	Selection *ZenSelectionContent `json:"selection,omitempty"`
}

type ZenTextContent struct {
	Value     string `json:"value"`
	Length    int    `json:"length"`
	Truncated bool   `json:"truncated"`
}

type ZenHTMLContent struct {
	Value     string `json:"value"`
	Length    int    `json:"length"`
	Truncated bool   `json:"truncated"`
	Sanitized bool   `json:"sanitized"`
}

type ZenMarkdownContent struct {
	Value     string `json:"value"`
	Length    int    `json:"length"`
	Truncated bool   `json:"truncated"`
}

type ZenSelectionContent struct {
	Text        string `json:"text,omitempty"`
	HTML        string `json:"html,omitempty"`
	Markdown    string `json:"markdown,omitempty"`
	IsCollapsed bool   `json:"isCollapsed"`
	Length      int    `json:"length"`
	Source      string `json:"source"`
	Truncated   bool   `json:"truncated"`
}

type ZenMetadataInfo struct {
	OpenGraph map[string]interface{} `json:"openGraph,omitempty"`
	JSONLD    *ZenJSONLDInfo         `json:"jsonLd,omitempty"`
	Headings  []ZenHeading           `json:"headings,omitempty"`
	Links     []ZenLink              `json:"links,omitempty"`
	Images    []ZenImage             `json:"images,omitempty"`
}

type ZenJSONLDInfo struct {
	Raw       []interface{}      `json:"raw"`
	Summary   []ZenJSONLDSummary `json:"summary"`
	Truncated bool               `json:"truncated"`
}

type ZenJSONLDSummary struct {
	Type        interface{} `json:"type,omitempty"`
	Name        string      `json:"name,omitempty"`
	Headline    string      `json:"headline,omitempty"`
	Description string      `json:"description,omitempty"`
	URL         string      `json:"url,omitempty"`
}

type ZenHeading struct {
	Level int    `json:"level"`
	Text  string `json:"text"`
	ID    string `json:"id,omitempty"`
}

type ZenLink struct {
	Text   string   `json:"text"`
	Href   string   `json:"href"`
	Title  string   `json:"title,omitempty"`
	Rel    []string `json:"rel,omitempty"`
	Target string   `json:"target,omitempty"`
	Kind   string   `json:"kind,omitempty"`
}

type ZenImage struct {
	Src    string `json:"src"`
	Alt    string `json:"alt,omitempty"`
	Title  string `json:"title,omitempty"`
	Width  int    `json:"width,omitempty"`
	Height int    `json:"height,omitempty"`
}

type ZenExtractionInfo struct {
	Mode               ContextMode            `json:"mode"`
	Selector           string                 `json:"selector,omitempty"`
	SelectorMatched    *bool                  `json:"selectorMatched,omitempty"`
	SelectorMatchCount *int                   `json:"selectorMatchCount,omitempty"`
	ContentSource      string                 `json:"contentSource,omitempty"`
	Warnings           []ZenExtractionWarning `json:"warnings"`
	Limits             ZenExtractionLimits    `json:"limits"`
	Truncation         ZenTruncationInfo      `json:"truncation"`
}

type ZenExtractionWarning struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Field   string `json:"field,omitempty"`
}

type ZenExtractionLimits struct {
	MaxBytes         int `json:"maxBytes"`
	MaxTextBytes     int `json:"maxTextBytes"`
	MaxHTMLBytes     int `json:"maxHtmlBytes"`
	MaxMarkdownBytes int `json:"maxMarkdownBytes"`
	MaxLinks         int `json:"maxLinks"`
	MaxImages        int `json:"maxImages"`
	MaxJSONLDBytes   int `json:"maxJsonLdBytes"`
}

type ZenTruncationInfo struct {
	Truncated bool     `json:"truncated"`
	Fields    []string `json:"fields"`
}

type ZenPermissionInfo struct {
	CanReadActiveTab       bool     `json:"canReadActiveTab"`
	CanReadSelection       bool     `json:"canReadSelection"`
	CanReadPageContent     bool     `json:"canReadPageContent"`
	CanReadMetadata        bool     `json:"canReadMetadata"`
	CanReadLinks           bool     `json:"canReadLinks"`
	RequiresHostPermission bool     `json:"requiresHostPermission,omitempty"`
	Missing                []string `json:"missing,omitempty"`
}

type ZenCapabilityInfo struct {
	ActiveTab   string `json:"activeTab"`
	Selection   string `json:"selection"`
	PageContent string `json:"pageContent"`
	Metadata    string `json:"metadata"`
	Links       string `json:"links"`
}

func (a *App) ContextJSON(options ContextOptions) int {
	exitCode, payload := a.BuildContextPayload(options, time.Now().UTC())
	printJSON(payload)
	return exitCode
}

func (a *App) BuildContextPayload(options ContextOptions, capturedAt time.Time) (int, interface{}) {
	options = normalizeContextOptions(options)

	if options.Format == ContextFormatHTML {
		return 2, NewContextError(options, capturedAt, "html_sanitizer_missing", "HTML context output requires sanitizer support before it can be enabled.", nil)
	}

	tabs := <-a.TabsGet(false, false)
	windows := <-a.WindowsGet()

	activeTab, activeWindow, found := FindActiveContextTab(tabs.Items, windows.Items)
	if !found {
		return 4, NewContextError(options, capturedAt, "no_active_tab", "No active Zen tab is available.", nil)
	}

	if options.Selector != "" {
		if isUnsupportedContextURL(activeTab.Url) {
			return 3, NewContextError(options, capturedAt, "unsupported_page", "Selector extraction is not available on privileged or unsupported browser pages.", map[string]interface{}{
				"selector": options.Selector,
				"url":      activeTab.Url,
			})
		}
		return 3, NewContextError(options, capturedAt, "permission_denied", "Selector extraction requires page-content permission for the active tab.", map[string]interface{}{
			"selector": options.Selector,
		})
	}

	return 0, NewContextFromTab(activeTab, activeWindow, a.Profile, options, capturedAt)
}

func NewContextFromTab(tab models.Tab, window models.Window, profile *profiles.Profile, options ContextOptions, capturedAt time.Time) ZenContext {
	options = normalizeContextOptions(options)
	warnings := contextWarningsForMode(options.Mode)
	if isUnsupportedContextURL(tab.Url) {
		warnings = append(warnings, ZenExtractionWarning{
			Code:    "unsupported_page",
			Message: "DOM extraction is not available on privileged or unsupported browser pages.",
			Field:   "page.url",
		})
	}

	var content *ZenContentInfo
	var truncationFields []string
	if options.Mode == ContextModeActive {
		var contentWarnings []ZenExtractionWarning
		content, contentWarnings, truncationFields = contextContentForFormat(tab, options.Format, options.MaxBytes)
		warnings = append(warnings, contentWarnings...)
	}

	status := ContextStatusOK
	if len(warnings) > 0 {
		status = ContextStatusPartial
	}

	if options.Mode == ContextModeSelection {
		content = &ZenContentInfo{
			Selection: &ZenSelectionContent{
				IsCollapsed: true,
				Source:      "none",
			},
		}
	}

	metadata := contextMetadataForMode(options.Mode)

	return ZenContext{
		Kind:       ContextKind,
		Version:    ContextVersion,
		OK:         true,
		Status:     status,
		Source:     contextSource(options, profile),
		CapturedAt: capturedAt.Format(time.RFC3339Nano),
		Browser: ZenBrowserInfo{
			Name:    "Zen Browser",
			AppID:   "app.zen-browser.zen",
			Version: browserVersion(profile),
		},
		Profile: profileInfo(profile),
		Window: ZenWindowInfo{
			ID:          window.Id,
			Focused:     window.IsLastFocused,
			LastFocused: window.IsLastFocused,
		},
		Tab: ZenTabInfo{
			ID:           tab.Id,
			WindowID:     tab.WindowId,
			Active:       tab.Active,
			Pinned:       tab.Pinned,
			Index:        tab.Index,
			LastAccessed: tab.LastAccessed,
			GroupID:      validPositiveID(tab.GroupId),
		},
		Page: ZenPageInfo{
			URL:    tab.Url,
			Title:  tab.Title,
			Domain: pageDomain(tab),
		},
		Content:      content,
		Metadata:     metadata,
		Extraction:   contextExtraction(options, warnings, truncationFields),
		Permissions:  contextPermissions(tab),
		Capabilities: contextCapabilities(tab),
	}
}

func NewContextError(options ContextOptions, capturedAt time.Time, code string, message string, details map[string]interface{}) ZenContextError {
	options = normalizeContextOptions(options)
	return ZenContextError{
		Kind:    ContextErrorKind,
		Version: ContextVersion,
		OK:      false,
		Status:  ContextStatusError,
		Code:    code,
		Message: message,
		Source: ZenContextErrorSource{
			Provider: ContextProvider,
			Command:  contextCommand(options.Mode),
			Format:   options.Format,
			Output:   ContextOutputJSON,
		},
		CapturedAt: capturedAt.Format(time.RFC3339Nano),
		Details:    details,
	}
}

func FindActiveContextTab(tabs []models.Tab, windows []models.Window) (models.Tab, models.Window, bool) {
	lastFocusedWindow, hasLastFocusedWindow := findLastFocusedWindow(windows)
	if hasLastFocusedWindow {
		if tab, ok := findActiveTabInWindow(tabs, lastFocusedWindow.Id); ok {
			return tab, lastFocusedWindow, true
		}
	}

	for _, tab := range tabs {
		if tab.Active {
			window := windowForTab(tab, windows)
			return tab, window, true
		}
	}

	return models.Tab{}, models.Window{}, false
}

func normalizeContextOptions(options ContextOptions) ContextOptions {
	if options.Mode == "" {
		options.Mode = ContextModeActive
	}
	if options.Format == "" {
		options.Format = ContextFormatJSON
	}
	if options.MaxBytes <= 0 {
		options.MaxBytes = DefaultMaxBytes
	}
	return options
}

func ParseContextFormat(format string) (ContextFormat, bool) {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "", string(ContextFormatJSON):
		return ContextFormatJSON, true
	case string(ContextFormatMarkdown):
		return ContextFormatMarkdown, true
	case string(ContextFormatText):
		return ContextFormatText, true
	case string(ContextFormatHTML):
		return ContextFormatHTML, true
	default:
		return "", false
	}
}

func ContextUsageError(mode ContextMode, format string, capturedAt time.Time) ZenContextError {
	return NewContextError(
		ContextOptions{Mode: mode, Format: ContextFormatJSON},
		capturedAt,
		"invalid_format",
		fmt.Sprintf("Unsupported context format: %s", format),
		map[string]interface{}{"format": format},
	)
}

func contextWarningsForMode(mode ContextMode) []ZenExtractionWarning {
	switch mode {
	case ContextModeSelection:
		return []ZenExtractionWarning{{
			Code:    "permission_unavailable",
			Message: "Selection extraction requires page-content permission for the active tab.",
			Field:   "content.selection",
		}}
	case ContextModeMetadata:
		return []ZenExtractionWarning{{
			Code:    "permission_unavailable",
			Message: "DOM metadata extraction requires page-content permission for the active tab.",
			Field:   "metadata",
		}}
	case ContextModeLinks:
		return []ZenExtractionWarning{{
			Code:    "permission_unavailable",
			Message: "Link extraction requires page-content permission for the active tab.",
			Field:   "metadata.links",
		}}
	default:
		return nil
	}
}

func contextContentForFormat(tab models.Tab, format ContextFormat, maxBytes int) (*ZenContentInfo, []ZenExtractionWarning, []string) {
	switch format {
	case ContextFormatMarkdown:
		value := fmt.Sprintf("[%s](%s)", tab.Title, tab.Url)
		value, truncated := truncateStringByBytes(value, contentLimit(maxBytes, DefaultMarkdownMax))
		content := &ZenContentInfo{Markdown: &ZenMarkdownContent{Value: value, Length: len(value), Truncated: truncated}}
		if truncated {
			return content, contentTruncatedWarning("content.markdown"), []string{"content.markdown"}
		}
		return content, nil, nil
	case ContextFormatText:
		value := strings.TrimSpace(fmt.Sprintf("%s\n%s", tab.Title, tab.Url))
		value, truncated := truncateStringByBytes(value, contentLimit(maxBytes, DefaultTextBytes))
		content := &ZenContentInfo{Text: &ZenTextContent{Value: value, Length: len(value), Truncated: truncated}}
		if truncated {
			return content, contentTruncatedWarning("content.text"), []string{"content.text"}
		}
		return content, nil, nil
	default:
		return nil, nil, nil
	}
}

func contextMetadataForMode(mode ContextMode) *ZenMetadataInfo {
	switch mode {
	case ContextModeMetadata:
		return &ZenMetadataInfo{
			OpenGraph: map[string]interface{}{},
			JSONLD: &ZenJSONLDInfo{
				Raw:     []interface{}{},
				Summary: []ZenJSONLDSummary{},
			},
			Headings: []ZenHeading{},
			Links:    []ZenLink{},
			Images:   []ZenImage{},
		}
	case ContextModeLinks:
		return &ZenMetadataInfo{
			Links: []ZenLink{},
		}
	default:
		return nil
	}
}

func contextExtraction(options ContextOptions, warnings []ZenExtractionWarning, truncationFields []string) ZenExtractionInfo {
	return ZenExtractionInfo{
		Mode:     options.Mode,
		Selector: options.Selector,
		Warnings: warnings,
		Limits: ZenExtractionLimits{
			MaxBytes:         options.MaxBytes,
			MaxTextBytes:     DefaultTextBytes,
			MaxHTMLBytes:     DefaultHTMLBytes,
			MaxMarkdownBytes: DefaultMarkdownMax,
			MaxLinks:         DefaultMaxLinks,
			MaxImages:        DefaultMaxImages,
			MaxJSONLDBytes:   DefaultJSONLDBytes,
		},
		Truncation: ZenTruncationInfo{
			Truncated: len(truncationFields) > 0,
			Fields:    truncationFields,
		},
	}
}

func contextPermissions(tab models.Tab) ZenPermissionInfo {
	if isUnsupportedContextURL(tab.Url) {
		return ZenPermissionInfo{
			CanReadActiveTab:   true,
			CanReadSelection:   false,
			CanReadPageContent: false,
			CanReadMetadata:    false,
			CanReadLinks:       false,
		}
	}
	return ZenPermissionInfo{
		CanReadActiveTab:       true,
		CanReadSelection:       false,
		CanReadPageContent:     false,
		CanReadMetadata:        false,
		CanReadLinks:           false,
		RequiresHostPermission: true,
		Missing:                []string{"host_permission"},
	}
}

func contextCapabilities(tab models.Tab) ZenCapabilityInfo {
	if isUnsupportedContextURL(tab.Url) {
		return ZenCapabilityInfo{
			ActiveTab:   "available",
			Selection:   "unavailable",
			PageContent: "unavailable",
			Metadata:    "unavailable",
			Links:       "unavailable",
		}
	}
	return ZenCapabilityInfo{
		ActiveTab:   "available",
		Selection:   "permission-required",
		PageContent: "permission-required",
		Metadata:    "permission-required",
		Links:       "permission-required",
	}
}

func contentTruncatedWarning(field string) []ZenExtractionWarning {
	return []ZenExtractionWarning{{
		Code:    "content_truncated",
		Message: "Context content was truncated to fit the configured size limit.",
		Field:   field,
	}}
}

func contentLimit(maxBytes int, fieldDefault int) int {
	if maxBytes <= 0 {
		return fieldDefault
	}
	if maxBytes < fieldDefault {
		return maxBytes
	}
	return fieldDefault
}

func truncateStringByBytes(value string, maxBytes int) (string, bool) {
	if maxBytes <= 0 || len(value) <= maxBytes {
		return value, false
	}

	cut := 0
	for _, r := range value {
		next := cut + len(string(r))
		if next > maxBytes {
			break
		}
		cut = next
	}

	return value[:cut], true
}

func contextSource(options ContextOptions, profile *profiles.Profile) ZenContextSource {
	source := ZenContextSource{
		Provider: ContextProvider,
		Command:  contextCommand(options.Mode),
		Format:   options.Format,
		Output:   ContextOutputJSON,
	}
	if profile != nil {
		source.ProfileID = profile.ProfileId
		source.ProfileAlias = profile.ProfileAlias
	}
	return source
}

func contextCommand(mode ContextMode) string {
	switch mode {
	case ContextModeSelection:
		return "context selection"
	case ContextModeMetadata:
		return "context metadata"
	case ContextModeLinks:
		return "context links"
	default:
		return "context active"
	}
}

func profileInfo(profile *profiles.Profile) *ZenProfileInfo {
	if profile == nil {
		return nil
	}
	return &ZenProfileInfo{
		ID:    profile.ProfileId,
		Alias: profile.ProfileAlias,
		Name:  profile.ProfileName,
	}
}

func browserVersion(profile *profiles.Profile) string {
	if profile == nil {
		return ""
	}
	return profile.BrowserVersion
}

func pageDomain(tab models.Tab) string {
	if tab.Domain != "" {
		return tab.Domain
	}
	parsedURL, err := url.Parse(tab.Url)
	if err != nil {
		return ""
	}
	return strings.TrimPrefix(parsedURL.Hostname(), "www.")
}

func isUnsupportedContextURL(rawURL string) bool {
	parsedURL, err := url.Parse(rawURL)
	if err != nil || parsedURL.Scheme == "" {
		return true
	}

	switch strings.ToLower(parsedURL.Scheme) {
	case "http", "https":
		return false
	default:
		return true
	}
}

func validPositiveID(value int64) int64 {
	if value > 0 {
		return value
	}
	return 0
}

func findLastFocusedWindow(windows []models.Window) (models.Window, bool) {
	for _, window := range windows {
		if window.IsLastFocused {
			return window, true
		}
	}
	return models.Window{}, false
}

func findActiveTabInWindow(tabs []models.Tab, windowID int64) (models.Tab, bool) {
	for _, tab := range tabs {
		if tab.WindowId == windowID && tab.Active {
			return tab, true
		}
	}
	return models.Tab{}, false
}

func windowForTab(tab models.Tab, windows []models.Window) models.Window {
	for _, window := range windows {
		if window.Id == tab.WindowId {
			return window
		}
	}
	return models.Window{Id: tab.WindowId}
}

func printJSON(payload interface{}) {
	encoder := json.NewEncoder(os.Stdout)
	_ = encoder.Encode(payload)
}
