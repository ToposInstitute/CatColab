CREATE TABLE storage (
    key text[] PRIMARY KEY,
    data bytea NOT NULL
);

ALTER TABLE snapshots ADD COLUMN doc_id TEXT NOT NULL;
