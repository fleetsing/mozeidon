package windows

import (
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/egovelox/mozeidon/cmd/flags"
	"github.com/egovelox/mozeidon/core"
)

var GetWindowsCmd = &cobra.Command{
	Use:   "get",
	Short: "Get all windows",
	Long:  "Get all browser windows and mark the last-focused window.",
	Args:  cobra.NoArgs,
	Run: func(_ *cobra.Command, _ []string) {
		app, err := core.NewAppWithProfile(flags.ProfileID)
		if err != nil {
			core.PrintError(err.Error())
			return
		}
		channelWindows := app.WindowsGet()
		windows := <-channelWindows
		windowsAsString, _ := json.Marshal(windows)
		fmt.Println(string(windowsAsString))
	},
}
