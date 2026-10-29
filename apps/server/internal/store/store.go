// Package store owns PostgreSQL persistence for the API, worker, and operator commands.
package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// connectTimeout bounds the startup connectivity check so an unreachable
// database fails fast instead of hanging in a restart loop.
const connectTimeout = 5 * time.Second

// Store wraps the pgx connection pool. It is safe for concurrent use.
type Store struct {
	pool *pgxpool.Pool
}

// Open parses the database URL, creates the connection pool, and verifies
// connectivity once so misconfiguration surfaces at startup.
func Open(ctx context.Context, databaseURL string) (*Store, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		// Parsing errors can contain the original DSN, including malformed credentials.
		return nil, fmt.Errorf("invalid DATABASE_URL: check PostgreSQL connection settings")
	}
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("create connection pool: %w", err)
	}
	pingCtx, cancel := context.WithTimeout(ctx, connectTimeout)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("connect to database: %w", err)
	}
	return &Store{pool: pool}, nil
}

// Close releases all pooled connections. The store must not be used after.
func (s *Store) Close() {
	s.pool.Close()
}

func rollbackTransaction(tx pgx.Tx) {
	ctx, cancel := context.WithTimeout(context.Background(), connectTimeout)
	defer cancel()
	_ = tx.Rollback(ctx)
}
