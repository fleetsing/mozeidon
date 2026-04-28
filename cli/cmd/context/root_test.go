package context

import (
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

type commandFactory func() *cobra.Command
