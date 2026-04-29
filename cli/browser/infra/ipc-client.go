package infra

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/james-barrow/golang-ipc"

	"github.com/egovelox/mozeidon/browser/core/models"
)

type IpcClient struct {
	*ipc.Client
}

type EndMessage struct {
	End string `json:"data"`
}

const (
	ipcConnectTimeout = 5 * time.Second
	ipcRetryDelay     = 100 * time.Millisecond
)

func (ipc *IpcClient) Send(
	cmd models.Command,
) <-chan models.CommandResult {

	// TODO: handle error
	jsonCmd, _ := json.Marshal(cmd)
	ipc.Write(1, []byte(jsonCmd))

	channel := make(chan models.CommandResult)
	go func() {
		defer close(channel)
		for {
			// TODO: handle error
			message, err := ipc.Read()
			if err != nil {
				println(
					fmt.Sprintf(
						`{"error": "[Error] Cannot connect via ipc with host."}`,
					),
				)
				os.Exit(1)
			}
			if message.MsgType > 0 {
				if string(message.Data) == `{"data":"end"}` {
					break
				}
				channel <- models.CommandResult{Data: message.Data}
			}
		}
	}()
	return channel
}

func NewIpcClient(host string) (*IpcClient, error) {
	config := ipc.ClientConfig{
		Encryption: true,
		Timeout:    2,
		RetryTimer: 0,
	}

	deadline := time.Now().Add(ipcConnectTimeout)

	for {
		client, err := connectIpcClient(host, &config)
		if err != nil {
			if time.Now().Before(deadline) {
				time.Sleep(ipcRetryDelay)
				continue
			}

			return nil, fmt.Errorf("[Error] Cannot read via ipc with host: %s", host)
		}

		return &IpcClient{client}, nil
	}
}

func connectIpcClient(host string, config *ipc.ClientConfig) (*ipc.Client, error) {
	ipc, err := ipc.StartClient(host, config)
	if err != nil {
		return nil, err
	}

	for {
		message, err := ipc.Read()
		if err != nil {
			ipc.Close()
			return nil, err
		}

		if message.MsgType == -1 && message.Status == "Connected" {
			return ipc, nil
		}
	}
}
