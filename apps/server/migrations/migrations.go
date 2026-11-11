// Package migrations embeds the SQL migration files so commands can apply
// them without shipping loose files next to the executable.
package migrations

import (
	"embed"
	"fmt"
	"strconv"
	"strings"
)

// FS holds the embedded migration files, applied by store.Migrate.
//
//go:embed *.sql
var FS embed.FS

// LatestVersion returns the highest migration version embedded in this binary.
func LatestVersion() (int64, error) {
	entries, err := FS.ReadDir(".")
	if err != nil {
		return 0, fmt.Errorf("read embedded migrations: %w", err)
	}
	var latest int64
	for _, entry := range entries {
		prefix, _, found := strings.Cut(entry.Name(), "_")
		version, err := strconv.ParseInt(prefix, 10, 64)
		if !found || err != nil || version < 1 {
			return 0, fmt.Errorf("migration %q has no numeric version prefix", entry.Name())
		}
		latest = max(latest, version)
	}
	if latest == 0 {
		return 0, fmt.Errorf("no embedded migrations")
	}
	return latest, nil
}
