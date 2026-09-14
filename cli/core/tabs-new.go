package core

import (
	"fmt"
	"os"

	"github.com/egovelox/mozeidon/browser/core/models"
)

func (a *App) NewTab(query string) {
	a.sendNewTabCommand(models.Command{Command: "new-tab", Args: query})
}

func (a *App) NewTabInWindow(query string, windowId int64) {
	a.sendNewTabCommand(models.Command{
		Command: "new-tab-in-window",
		Args:    fmt.Sprintf("%d:%s", windowId, query),
	})
}

func (a *App) NewWindowTab(query string) {
	a.sendNewTabCommand(models.Command{Command: "new-window-tab", Args: query})
}

func (a *App) NewIncognitoTab(query string) {
	a.sendNewTabCommand(models.Command{Command: "new-incognito-tab", Args: query})
}

func (a *App) sendNewTabCommand(command models.Command) {
	// Args uses `json:"args,omitempty"`, so an empty string here is already
	// dropped from the wire payload the same as never setting it at all.
	returnCode := 0
	done := make(chan bool)

	go func() {
		for result := range a.browser.Send(command) {
			if result.Data != nil {
				if checkForError(result.Data) {
					returnCode = 1
				}
			}
		}
		done <- true
	}()

	<-done
	if returnCode != 0 {
		os.Exit(1)
	}
}
