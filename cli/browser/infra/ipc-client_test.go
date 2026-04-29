package infra

import (
	"errors"
	"strings"
	"testing"
)

func TestIpcClientErrorPreservesOperationHostAndCause(t *testing.T) {
	cause := errors.New("handshake timeout")
	err := newIpcClientError("mozeidon_native_app_123", "read", cause)

	if !errors.Is(err, cause) {
		t.Fatal("expected ipc client error to wrap the underlying cause")
	}

	message := err.Error()
	for _, expected := range []string{
		"Cannot read via ipc",
		"mozeidon_native_app_123",
		"handshake timeout",
	} {
		if !strings.Contains(message, expected) {
			t.Fatalf("expected %q to contain %q", message, expected)
		}
	}
}
