package core

import (
	"time"

	"github.com/egovelox/mozeidon/browser/core"
	"github.com/egovelox/mozeidon/profiles"
)

const (
	appConnectTimeout = 8 * time.Second
	appRetryDelay     = 100 * time.Millisecond
)

type App struct {
	browser *core.BrowserService
	Profile *profiles.Profile
}

func newApp(profile *profiles.Profile) (*App, error) {
	browser, err := core.NewBrowserService(profile.IpcName)
	if err != nil {
		return nil, err
	}

	return &App{browser: browser, Profile: profile}, nil
}

func NewAppWithProfile(profileId string) (*App, error) {
	deadline := time.Now().Add(appConnectTimeout)
	var lastErr error

	for {
		profile, err := profiles.GetProfileById(profileId)
		if err == nil {
			app, err := newApp(profile)
			if err == nil {
				return app, nil
			}
			lastErr = err
		} else {
			lastErr = err
		}

		if !time.Now().Before(deadline) {
			return nil, lastErr
		}

		time.Sleep(appRetryDelay)
	}
}
