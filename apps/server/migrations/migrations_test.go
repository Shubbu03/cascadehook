package migrations

import "testing"

func TestLatestVersionMatchesNewestFile(t *testing.T) {
	entries, err := FS.ReadDir(".")
	if err != nil {
		t.Fatal(err)
	}
	latest, err := LatestVersion()
	if err != nil {
		t.Fatal(err)
	}
	if latest != int64(len(entries)) {
		t.Fatalf("latest version %d does not match %d contiguous migration files", latest, len(entries))
	}
}
