-- +goose Up
-- Validation scans deliveries under SHARE UPDATE EXCLUSIVE, which does not
-- block publishing or delivery. It runs apart from 00026 because that
-- migration's exclusive lock is held until its transaction commits.
ALTER TABLE deliveries VALIDATE CONSTRAINT deliveries_max_attempts_check;
ALTER TABLE deliveries VALIDATE CONSTRAINT deliveries_timeout_seconds_check;
ALTER TABLE deliveries VALIDATE CONSTRAINT deliveries_retry_policy_check;

-- +goose Down
-- Constraints cannot be marked unvalidated again; 00026 drops them.
SELECT 1;
