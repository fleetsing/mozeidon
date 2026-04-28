package windows

import "github.com/spf13/cobra"

var WindowsCmd = &cobra.Command{
	Use:   "windows",
	Short: "Manage windows",
}

func init() {
	WindowsCmd.AddCommand(GetWindowsCmd)
}
