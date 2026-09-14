package tabs

import (
	"strings"

	"github.com/spf13/cobra"

	"github.com/egovelox/mozeidon/cmd/flags"
	"github.com/egovelox/mozeidon/core"
)

var newTabWindowId int64
var newTabInNewWindow bool
var newTabIncognito bool

var NewTabCmd = &cobra.Command{
	Use:   "new",
	Short: "Open a new tab",
	Long: "Open a new tab" +
		"\n\n" +
		"Allowed argument(s):" +
		"\n" +
		"url or space-separated keywords" +
		"\n" +
		"e.g" +
		"\n" +
		"mozeidon tabs new https://mozilla.org" +
		"\n" +
		"e.g" +
		"\n" +
		"mozeidon tabs new what is mozeidon add-on extension" +
		"\n\n" +
		"Optionally target where the tab opens with --window-id, --new-window, or --incognito" +
		"\n" +
		"(these are mutually exclusive; with none set, the tab opens in the current window)" +
		"\n" +
		"e.g" +
		"\n" +
		"mozeidon tabs new https://mozilla.org --window-id 3" +
		"\n" +
		"e.g" +
		"\n" +
		"mozeidon tabs new https://mozilla.org --new-window" +
		"\n" +
		"e.g" +
		"\n" +
		"mozeidon tabs new https://mozilla.org --incognito" +
		"\n\n",
	Run: func(_ *cobra.Command, args []string) {
		app, err := core.NewAppWithProfile(flags.ProfileID)
		if err != nil {
			core.PrintError(err.Error())
			return
		}
		query := strings.Join(args, " ")
		switch {
		case newTabWindowId != -1:
			app.NewTabInWindow(query, newTabWindowId)
		case newTabInNewWindow:
			app.NewWindowTab(query)
		case newTabIncognito:
			app.NewIncognitoTab(query)
		default:
			app.NewTab(query)
		}
	},
}

func init() {
	NewTabCmd.Flags().
		Int64VarP(&newTabWindowId, "window-id", "w", -1, "open the tab in this existing window")
	NewTabCmd.Flags().
		BoolVar(&newTabInNewWindow, "new-window", false, "open the tab in a brand-new window")
	NewTabCmd.Flags().
		BoolVar(&newTabIncognito, "incognito", false, "open the tab in a brand-new incognito window")
	NewTabCmd.MarkFlagsMutuallyExclusive("window-id", "new-window", "incognito")
}
