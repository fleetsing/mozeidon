package windows

import "testing"

func TestWindowsCommandExposesGetSubcommand(t *testing.T) {
	if WindowsCmd.Use != "windows" {
		t.Fatalf("expected windows command, got %q", WindowsCmd.Use)
	}

	for _, command := range WindowsCmd.Commands() {
		if command.Use == "get" {
			return
		}
	}

	t.Fatal("expected windows command to expose get subcommand")
}

func TestGetWindowsCommandHasExpectedShape(t *testing.T) {
	if GetWindowsCmd.Use != "get" {
		t.Fatalf("expected get command, got %q", GetWindowsCmd.Use)
	}
	if err := GetWindowsCmd.Args(GetWindowsCmd, []string{"unexpected"}); err == nil {
		t.Fatal("expected windows get to reject positional args")
	}
}
