// Package migrations embeds the SQL migration files so commands can apply
// them without shipping loose files next to the executable.
package migrations

import "embed"

// FS holds the embedded migration files, applied by store.Migrate.
//
//go:embed *.sql
var FS embed.FS
