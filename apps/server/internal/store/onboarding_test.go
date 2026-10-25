package store

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"cascadehook/internal/accounts"
	"cascadehook/internal/auth"
	"cascadehook/internal/pagination"
	"cascadehook/migrations"
)

func TestOnboardingLifecycle(t *testing.T) {
	address := os.Getenv("TEST_DATABASE_URL")
	if address == "" {
		t.Skip("set TEST_DATABASE_URL to run isolated-schema PostgreSQL lifecycle checks")
	}
	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
	defer cancel()
	config, err := pgx.ParseConfig(address)
	if err != nil {
		t.Fatal("invalid TEST_DATABASE_URL")
	}
	admin, err := pgx.ConnectConfig(ctx, config)
	if err != nil {
		t.Fatal("connect to test PostgreSQL")
	}
	defer admin.Close(context.Background())
	schema := "onboarding_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	identifier := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+identifier); err != nil {
		t.Fatal(err)
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if _, err := admin.Exec(cleanup, "DROP SCHEMA "+identifier+" CASCADE"); err != nil {
			t.Errorf("remove isolated test schema: %v", err)
		}
	}()
	config.RuntimeParams["search_path"] = schema
	database := stdlib.OpenDB(*config)
	defer database.Close()
	provider, err := goose.NewProvider(
		goose.DialectPostgres,
		database,
		migrations.FS,
		goose.WithSlog(slog.New(slog.NewTextHandler(io.Discard, nil))),
		goose.WithDisableGlobalRegistry(true),
	)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := provider.UpTo(ctx, 18); err != nil {
		t.Fatal(err)
	}
	legacy := auth.SessionIdentity{Issuer: "https://identity.example", Subject: "user_legacy"}
	if _, err := database.ExecContext(
		ctx,
		`INSERT INTO users (id, identity_issuer, identity_subject) VALUES ($1,$2,$3)`,
		uuid.New(),
		legacy.Issuer,
		legacy.Subject,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := provider.Up(ctx); err != nil {
		t.Fatal(err)
	}
	poolConfig, err := pgxpool.ParseConfig(address)
	if err != nil {
		t.Fatal("invalid TEST_DATABASE_URL")
	}
	poolConfig.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		t.Fatal(err)
	}
	db := &Store{pool: pool}
	defer db.Close()
	if err := db.Ready(ctx); err != nil {
		t.Fatal(err)
	}
	loadUser := func(identity auth.SessionIdentity) accounts.User {
		t.Helper()
		user, err := db.EnsureUser(ctx, identity)
		if err != nil {
			t.Fatal(err)
		}
		return user
	}
	if loadUser(legacy).OnboardingCompletedAt == nil {
		t.Fatal("existing account without projects must be backfilled as complete")
	}
	identity := auth.SessionIdentity{Issuer: legacy.Issuer, Subject: "user_new"}
	user := loadUser(identity)
	if user.OnboardingCompletedAt != nil {
		t.Fatal("new account must start with unfinished onboarding")
	}
	organization, err := db.CreateOrganization(ctx, user.ID, "First organization")
	if err != nil {
		t.Fatal(err)
	}
	if loadUser(identity).OnboardingCompletedAt != nil {
		t.Fatal("organization creation must leave the project step unfinished")
	}
	_, err = db.CreateProject(ctx, user.ID, CreateProjectParams{OrganizationID: organization.ID, Name: ""})
	if !errors.Is(err, accounts.ErrInvalidName) || loadUser(identity).OnboardingCompletedAt != nil {
		t.Fatal("failed project creation must not complete onboarding")
	}
	project, err := db.CreateProject(ctx, user.ID, CreateProjectParams{
		OrganizationID: organization.ID,
		Name:           "Only project",
	})
	if err != nil {
		t.Fatal(err)
	}
	completed := loadUser(identity).OnboardingCompletedAt
	if completed == nil {
		t.Fatal("first project must persist onboarding completion")
	}
	if _, err := db.RequestProjectDeletion(ctx, user.ID, project.ID); err != nil {
		t.Fatal(err)
	}
	projects, err := db.ListProjects(ctx, user.ID, organization.ID, pagination.Options{Limit: 20})
	if err != nil || len(projects) != 0 {
		t.Fatalf("deleted last project must disappear from All projects: %v", err)
	}
	if at := loadUser(identity).OnboardingCompletedAt; at == nil || !at.Equal(*completed) {
		t.Fatal("deleting the last project must retain onboarding completion")
	}
	if _, err := db.RequestOrganizationDeletion(ctx, user.ID, organization.ID); err != nil {
		t.Fatal(err)
	}
	if at := loadUser(identity).OnboardingCompletedAt; at == nil || !at.Equal(*completed) {
		t.Fatal("deleting the last organization must retain onboarding completion")
	}
	organization, err = db.CreateOrganization(ctx, user.ID, "Invite organization")
	if err != nil {
		t.Fatal(err)
	}
	inviteeIdentity := auth.SessionIdentity{Issuer: legacy.Issuer, Subject: "user_invited"}
	invitee := loadUser(inviteeIdentity)
	_, hash, err := accounts.NewInvitationToken()
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.CreateInvitation(ctx, user.ID, CreateInvitationParams{
		OrganizationID: organization.ID,
		Email:          "invited@example.com",
		Role:           accounts.Member,
		Hash:           hash,
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.AcceptInvitation(ctx, invitee.ID, hash, []string{"different@example.com"})
	if !errors.Is(err, accounts.ErrInvitationEmail) || loadUser(inviteeIdentity).OnboardingCompletedAt != nil {
		t.Fatal("a rejected invitation must not complete onboarding")
	}
	for range 2 {
		if _, err := db.AcceptInvitation(ctx, invitee.ID, hash, []string{"invited@example.com"}); err != nil {
			t.Fatal(err)
		}
		if loadUser(inviteeIdentity).OnboardingCompletedAt == nil {
			t.Fatal("joining an existing organization must complete onboarding even without projects")
		}
	}
	memberIdentity := auth.SessionIdentity{Issuer: legacy.Issuer, Subject: "user_member"}
	member := loadUser(memberIdentity)
	_, err = db.AddMembership(ctx, user.ID, MembershipParams{
		OrganizationID: organization.ID,
		UserID:         member.ID,
		Role:           accounts.Member,
	})
	if err != nil {
		t.Fatal(err)
	}
	if loadUser(memberIdentity).OnboardingCompletedAt == nil {
		t.Fatal("direct organization membership must complete onboarding")
	}
}
