package core

import (
	"github.com/egovelox/mozeidon/browser/core/ports"
	"github.com/egovelox/mozeidon/browser/infra"
)

type BrowserService struct {
	ports.CommandSender
}

func NewBrowserService(ipcName string) (*BrowserService, error) {
	client, err := infra.NewIpcClient(ipcName)
	if err != nil {
		return nil, err
	}

	return &BrowserService{client}, nil
}
