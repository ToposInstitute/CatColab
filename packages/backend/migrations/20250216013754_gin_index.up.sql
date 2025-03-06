-- Add up migration script here
CREATE INDEX gin_index_docs ON snapshots USING GIN(content);
