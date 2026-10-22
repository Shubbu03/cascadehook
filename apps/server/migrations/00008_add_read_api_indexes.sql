-- +goose Up
CREATE INDEX events_project_type_created_id_idx ON events (project_id, event_type, created_at DESC, id DESC);
CREATE INDEX deliveries_project_event_created_id_idx ON deliveries (project_id, event_id, created_at DESC, id DESC);
CREATE INDEX deliveries_project_endpoint_created_id_idx ON deliveries (project_id, endpoint_id, created_at DESC, id DESC);
CREATE INDEX deliveries_project_state_created_id_idx ON deliveries (project_id, state, created_at DESC, id DESC);

-- +goose Down
DROP INDEX deliveries_project_state_created_id_idx;
DROP INDEX deliveries_project_endpoint_created_id_idx;
DROP INDEX deliveries_project_event_created_id_idx;
DROP INDEX events_project_type_created_id_idx;
