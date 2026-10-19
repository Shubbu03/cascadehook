// Package store owns the PostgreSQL connection pool shared by the API and
// worker, and will grow the persistence methods they need.
package store

import (
	"context"
	"fmt"
	"time"

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
		return nil, fmt.Errorf("parse database URL: %w", err)
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

// Ping reports whether the database is reachable.
func (s *Store) Ping(ctx context.Context) error {
	return s.pool.Ping(ctx)
}
