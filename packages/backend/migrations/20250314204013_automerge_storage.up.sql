CREATE TABLE storage (
    key text[] PRIMARY KEY,
    data bytea NOT NULL
);

ALTER TABLE refs ADD COLUMN doc_id TEXT;
