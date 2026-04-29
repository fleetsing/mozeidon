package profiles

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestGetProfileByIdPrefersNewestMatchingProfile(t *testing.T) {
	setupProfileTestDirectory(t)

	writeProfileFile(t, "100_zen.json", Profile{
		IpcName:      "mozeidon_native_app_100_zen",
		ProfileId:    "zen-profile",
		ProfileRank:  1,
		Pid:          os.Getpid(),
		RegisteredAt: "2026-04-28T19:00:00.000Z",
	})
	writeProfileFile(t, "200_zen.json", Profile{
		IpcName:      "mozeidon_native_app_200_zen",
		ProfileId:    "zen-profile",
		ProfileRank:  1,
		Pid:          os.Getpid(),
		RegisteredAt: "2026-04-28T20:00:00.000Z",
	})

	profile, err := GetProfileById("zen-profile")
	if err != nil {
		t.Fatalf("expected profile lookup to succeed: %v", err)
	}
	if profile.IpcName != "mozeidon_native_app_200_zen" {
		t.Fatalf("expected newest matching profile, got %s", profile.IpcName)
	}
}

func TestGetProfileByAliasPrefersHighestRankMatchingProfile(t *testing.T) {
	setupProfileTestDirectory(t)

	writeProfileFile(t, "100_zen.json", Profile{
		IpcName:      "mozeidon_native_app_100_zen",
		ProfileAlias: "work",
		ProfileRank:  1,
		Pid:          os.Getpid(),
		RegisteredAt: "2026-04-28T20:00:00.000Z",
	})
	writeProfileFile(t, "200_zen.json", Profile{
		IpcName:      "mozeidon_native_app_200_zen",
		ProfileAlias: "work",
		ProfileRank:  2,
		Pid:          os.Getpid(),
		RegisteredAt: "2026-04-28T19:00:00.000Z",
	})

	profile, err := GetProfileById("work")
	if err != nil {
		t.Fatalf("expected profile lookup to succeed: %v", err)
	}
	if profile.IpcName != "mozeidon_native_app_200_zen" {
		t.Fatalf("expected highest-rank matching profile, got %s", profile.IpcName)
	}
}

func setupProfileTestDirectory(t *testing.T) {
	t.Helper()

	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))

	profileDir, err := GetProfileDirectory()
	if err != nil {
		t.Fatalf("expected profile directory: %v", err)
	}
	if err := os.MkdirAll(profileDir, 0755); err != nil {
		t.Fatalf("expected profile directory to be created: %v", err)
	}
}

func writeProfileFile(t *testing.T, filename string, profile Profile) {
	t.Helper()

	profileDir, err := GetProfileDirectory()
	if err != nil {
		t.Fatalf("expected profile directory: %v", err)
	}
	data, err := json.Marshal(profile)
	if err != nil {
		t.Fatalf("expected profile to marshal: %v", err)
	}
	if err := os.WriteFile(filepath.Join(profileDir, filename), data, 0644); err != nil {
		t.Fatalf("expected profile file to be written: %v", err)
	}
}
