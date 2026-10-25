-- +goose Up
CREATE TABLE user_onboarding (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    completed_at timestamptz NOT NULL DEFAULT now()
);

-- Existing accounts must not repeat onboarding, even if their projects or
-- memberships have already been deleted. New accounts complete setup once.
INSERT INTO user_onboarding (user_id) SELECT id FROM users;

-- +goose Down
DROP TABLE user_onboarding;
