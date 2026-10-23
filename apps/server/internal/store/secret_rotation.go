package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"cascadehook/internal/signing"
)

type RewrapOptions struct {
	After  uuid.UUID
	Limit  int
	DryRun bool
}

type RewrapResult struct {
	Checked int       `json:"checked"`
	Changed int       `json:"changed"`
	After   uuid.UUID `json:"after"`
	Done    bool      `json:"done"`
}

func (s *Store) RewrapSigningSecrets(
	ctx context.Context,
	vault *signing.Vault,
	options RewrapOptions,
) (RewrapResult, error) {
	if options.Limit < 1 || options.Limit > 1000 {
		return RewrapResult{}, fmt.Errorf("rewrap batch size must be between 1 and 1000")
	}
	rows, err := s.pool.Query(
		ctx,
		`SELECT id FROM endpoints WHERE id > $1 AND signing_secret IS NOT NULL
		ORDER BY id LIMIT $2`,
		options.After,
		options.Limit,
	)
	if err != nil {
		return RewrapResult{}, fmt.Errorf("select signing-secret rotation batch: %w", err)
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
	if err != nil {
		return RewrapResult{}, fmt.Errorf("read signing-secret rotation batch: %w", err)
	}
	result := RewrapResult{After: options.After, Done: len(ids) < options.Limit}
	for _, id := range ids {
		changed, err := s.rewrapEndpoint(
			ctx,
			vault,
			id,
			options.DryRun,
		)
		if err != nil {
			return result, err
		}
		result.Checked++
		if changed {
			result.Changed++
		}
		result.After = id
	}
	return result, nil
}

func (s *Store) rewrapEndpoint(ctx context.Context, vault *signing.Vault, id uuid.UUID, preview bool) (bool, error) {
	var projectID, organizationID uuid.UUID
	err := s.pool.QueryRow(ctx, `SELECT p.id,p.organization_id FROM endpoints e
		JOIN projects p ON p.id = e.project_id WHERE e.id = $1`, id).Scan(&projectID, &organizationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("locate signing-secret parent: %w", err)
	}
	mode := pgx.ReadWrite
	if preview {
		mode = pgx.ReadOnly
	}
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{AccessMode: mode})
	if err != nil {
		return false, fmt.Errorf("begin signing-secret rewrap: %w", err)
	}
	defer rollbackTransaction(tx)
	if !preview {
		// Include retired data too. Retain ancestor lock ordering while the
		// janitor may concurrently remove an endpoint or its entire tenant.
		for _, parent := range []struct {
			query string
			id    uuid.UUID
		}{
			{query: `SELECT id FROM organizations WHERE id = $1 FOR SHARE`, id: organizationID},
			{query: `SELECT id FROM projects WHERE id = $1 FOR UPDATE`, id: projectID},
		} {
			var locked uuid.UUID
			if err := tx.QueryRow(ctx, parent.query, parent.id).Scan(&locked); err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					return false, nil
				}
				return false, fmt.Errorf("lock signing-secret parent: %w", err)
			}
		}
	}
	query := `SELECT signing_secret,previous_signing_secret FROM endpoints WHERE id = $1`
	if !preview {
		query += ` FOR UPDATE`
	}
	var current, previous []byte
	err = tx.QueryRow(ctx, query, id).Scan(&current, &previous)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read encrypted signing secret: %w", err)
	}
	next, changed, err := vault.Rewrap(projectID, id, current)
	if err != nil {
		return false, err
	}
	nextPrevious, changedPrevious, err := vault.Rewrap(projectID, id, previous)
	if err != nil {
		return false, err
	}
	if preview || (!changed && !changedPrevious) {
		return changed || changedPrevious, nil
	}
	_, err = tx.Exec(
		ctx,
		`UPDATE endpoints SET signing_secret = $2, previous_signing_secret = $3 WHERE id = $1`,
		id,
		next,
		nextPrevious,
	)
	if err != nil {
		return false, fmt.Errorf("rewrap signing-secret ciphertext: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("commit signing-secret rewrap; batch can safely resume: %w", err)
	}
	return true, nil
}
