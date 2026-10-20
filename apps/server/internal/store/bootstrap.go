package store

import (
	"context"
	"crypto/sha256"
	"fmt"

	"github.com/google/uuid"
)

// BootstrapParams contains display names and the non-secret key metadata.
// The plaintext credential must never cross the persistence boundary.
type BootstrapParams struct {
	OrganizationName string
	ProjectName      string
	KeyName          string
	KeyPrefix        string
	KeyHash          [sha256.Size]byte
}

type BootstrapResult struct {
	OrganizationID uuid.UUID `json:"organization_id"`
	ProjectID      uuid.UUID `json:"project_id"`
	APIKeyID       uuid.UUID `json:"api_key_id"`
}

// BootstrapDevelopment creates a fresh organization, project, and API key in
// one transaction. Repeated calls create independent development accounts.
func (s *Store) BootstrapDevelopment(ctx context.Context, params BootstrapParams) (BootstrapResult, error) {
	organizationID, err := uuid.NewV7()
	if err != nil {
		return BootstrapResult{}, fmt.Errorf("generate organization ID: %w", err)
	}
	projectID, err := uuid.NewV7()
	if err != nil {
		return BootstrapResult{}, fmt.Errorf("generate project ID: %w", err)
	}
	apiKeyID, err := uuid.NewV7()
	if err != nil {
		return BootstrapResult{}, fmt.Errorf("generate API key ID: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return BootstrapResult{}, fmt.Errorf("begin development bootstrap: %w", err)
	}
	defer func() {
		rollbackCtx, cancel := context.WithTimeout(context.Background(), connectTimeout)
		defer cancel()
		_ = tx.Rollback(rollbackCtx)
	}()

	if _, err := tx.Exec(ctx,
		`INSERT INTO organizations (id, name) VALUES ($1, $2)`,
		organizationID, params.OrganizationName,
	); err != nil {
		return BootstrapResult{}, fmt.Errorf("create development organization: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO projects (id, organization_id, name) VALUES ($1, $2, $3)`,
		projectID, organizationID, params.ProjectName,
	); err != nil {
		return BootstrapResult{}, fmt.Errorf("create development project: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO api_keys (id, project_id, name, key_prefix, key_hash) VALUES ($1, $2, $3, $4, $5)`,
		apiKeyID, projectID, params.KeyName, params.KeyPrefix, params.KeyHash[:],
	); err != nil {
		return BootstrapResult{}, fmt.Errorf("create development API key: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return BootstrapResult{}, fmt.Errorf("commit development bootstrap: %w", err)
	}
	return BootstrapResult{
		OrganizationID: organizationID,
		ProjectID:      projectID,
		APIKeyID:       apiKeyID,
	}, nil
}
