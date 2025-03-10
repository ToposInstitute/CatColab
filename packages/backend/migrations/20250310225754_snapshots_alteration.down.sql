-- Add down migration script here
ALTER TABLE snapshots
DROP COLUMN fts_tsvector,
DROP COLUMN embedding;

ALTER TABLE snapshots
DROP CONSTRAINT snapshots_for_ref_fkey;