package context

import (
	"errors"
	"testing"

	"github.com/spf13/cobra"
)

func TestContextCommandsExposeRequiredFlags(t *testing.T) {
	activeCmd := newActiveCmd()
	if activeCmd.Use != "active" {
		t.Fatalf("expected active command, got %q", activeCmd.Use)
	}
	if activeCmd.Flags().Lookup("format") == nil {
		t.Fatal("expected active command to expose --format")
	}
	if activeCmd.Flags().Lookup("max-bytes") == nil {
		t.Fatal("expected active command to expose --max-bytes")
	}
	if activeCmd.Flags().Lookup("selector") == nil {
		t.Fatal("expected active command to expose --selector")
	}

	for _, command := range []struct {
		name string
		cmd  commandFactory
	}{
		{name: "selection", cmd: newSelectionCmd},
		{name: "metadata", cmd: newMetadataCmd},
		{name: "links", cmd: newLinksCmd},
	} {
		cmd := command.cmd()
		if cmd.Use != command.name {
			t.Fatalf("expected %s command, got %q", command.name, cmd.Use)
		}
		if cmd.Flags().Lookup("format") == nil {
			t.Fatalf("expected %s command to expose --format", command.name)
		}
		if cmd.Flags().Lookup("max-bytes") == nil {
			t.Fatalf("expected %s command to expose --max-bytes", command.name)
		}
		if cmd.Flags().Lookup("selector") != nil {
			t.Fatalf("did not expect %s command to expose --selector", command.name)
		}
	}
}

func TestIsNativeMessagingError(t *testing.T) {
	for _, message := range []string{
		"[Error] Cannot read via ipc with host: mozeidon_native_app_123",
		"[Error] Cannot connect via ipc with host: mozeidon_native_app_123",
	} {
		if !isNativeMessagingError(errors.New(message)) {
			t.Fatalf("expected native messaging error for %q", message)
		}
	}

	if isNativeMessagingError(errors.New("No profileId or profileAlias matching Zen")) {
		t.Fatal("did not expect profile lookup error to be classified as native messaging")
	}
}

type commandFactory func() *cobra.Command
