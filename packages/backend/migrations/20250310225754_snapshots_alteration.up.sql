-- Add up migration script here
CREATE EXTENSION vector; 

ALTER TABLE snapshots
    ADD FOREIGN KEY (for_ref) REFERENCES refs (id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE snapshots 
    ADD COLUMN fts_tsvector tsvector GENERATED ALWAYS AS (
        TO_TSVECTOR('simple', COALESCE(content::text, ''))
    ) STORED,
    ADD COLUMN embedding vector(1536);
