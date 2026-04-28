package context

import (
	"encoding/json"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/egovelox/mozeidon/cmd/flags"
	"github.com/egovelox/mozeidon/core"
)

type contextCommandFlags struct {
	format   string
	selector string
	maxBytes int
}

var ContextCmd = &cobra.Command{
	Use:   "context",
	Short: "Get structured Zen context",
	Long:  "Get structured JSON context for the active Zen tab, selection, metadata, or links.",
}

func init() {
	ContextCmd.AddCommand(newActiveCmd())
	ContextCmd.AddCommand(newSelectionCmd())
	ContextCmd.AddCommand(newMetadataCmd())
	ContextCmd.AddCommand(newLinksCmd())
}

func newActiveCmd() *cobra.Command {
	commandFlags := contextCommandFlags{}
	cmd := &cobra.Command{
		Use:   "active",
		Short: "Get active Zen tab context",
		Args:  cobra.NoArgs,
		Run: func(_ *cobra.Command, _ []string) {
			runContext(core.ContextModeActive, commandFlags)
		},
	}
	addCommonFlags(cmd, &commandFlags)
	cmd.Flags().StringVar(&commandFlags.selector, "selector", "", "CSS selector to scope active page extraction")
	return cmd
}

func newSelectionCmd() *cobra.Command {
	commandFlags := contextCommandFlags{}
	cmd := &cobra.Command{
		Use:   "selection",
		Short: "Get active Zen tab selection context",
		Args:  cobra.NoArgs,
		Run: func(_ *cobra.Command, _ []string) {
			runContext(core.ContextModeSelection, commandFlags)
		},
	}
	addCommonFlags(cmd, &commandFlags)
	return cmd
}

func newMetadataCmd() *cobra.Command {
	commandFlags := contextCommandFlags{}
	cmd := &cobra.Command{
		Use:   "metadata",
		Short: "Get active Zen tab metadata context",
		Args:  cobra.NoArgs,
		Run: func(_ *cobra.Command, _ []string) {
			runContext(core.ContextModeMetadata, commandFlags)
		},
	}
	addCommonFlags(cmd, &commandFlags)
	return cmd
}

func newLinksCmd() *cobra.Command {
	commandFlags := contextCommandFlags{}
	cmd := &cobra.Command{
		Use:   "links",
		Short: "Get active Zen tab links context",
		Args:  cobra.NoArgs,
		Run: func(_ *cobra.Command, _ []string) {
			runContext(core.ContextModeLinks, commandFlags)
		},
	}
	addCommonFlags(cmd, &commandFlags)
	return cmd
}

func addCommonFlags(cmd *cobra.Command, commandFlags *contextCommandFlags) {
	cmd.Flags().StringVar(&commandFlags.format, "format", "json", "structured content format to populate: json, markdown, text, or html")
	cmd.Flags().IntVar(&commandFlags.maxBytes, "max-bytes", core.DefaultMaxBytes, "maximum target bytes for structured context output")
}

func runContext(mode core.ContextMode, commandFlags contextCommandFlags) {
	format, ok := core.ParseContextFormat(commandFlags.format)
	if !ok {
		writeJSON(core.NewContextError(
			core.ContextOptions{Mode: mode, Format: core.ContextFormatJSON},
			time.Now().UTC(),
			"invalid_format",
			"Unsupported context format: "+commandFlags.format,
			map[string]interface{}{"format": commandFlags.format},
		))
		os.Exit(2)
	}

	app, err := core.NewAppWithProfile(flags.ProfileID)
	if err != nil {
		writeJSON(core.NewContextError(
			core.ContextOptions{Mode: mode, Format: format},
			time.Now().UTC(),
			"profile_not_found",
			err.Error(),
			map[string]interface{}{"profileId": flags.ProfileID},
		))
		os.Exit(1)
	}

	if format == core.ContextFormatHTML {
		writeJSON(core.NewContextError(
			core.ContextOptions{Mode: mode, Format: format},
			time.Now().UTC(),
			"html_sanitizer_missing",
			"HTML context output requires sanitizer support before it can be enabled.",
			nil,
		))
		os.Exit(2)
	}

	exitCode := app.ContextJSON(core.ContextOptions{
		Mode:     mode,
		Format:   format,
		Selector: commandFlags.selector,
		MaxBytes: commandFlags.maxBytes,
	})
	if exitCode != 0 {
		os.Exit(exitCode)
	}
}

func writeJSON(payload interface{}) {
	encoder := json.NewEncoder(os.Stdout)
	_ = encoder.Encode(payload)
}
