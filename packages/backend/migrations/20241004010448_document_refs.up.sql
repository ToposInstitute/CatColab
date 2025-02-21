CREATE TABLE snapshots (
    id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    for_ref UUID NOT NULL,
    content JSONB NOT NULL,
    last_updated TIMESTAMPTZ NOT NULL
);

CREATE TABLE refs (
    id UUID PRIMARY KEY,
    head INT NOT NULL REFERENCES snapshots (id),
    created TIMESTAMPTZ NOT NULL
);

ALTER TABLE snapshots
    ADD FOREIGN KEY (for_ref) REFERENCES refs (id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE snapshots 
    ADD COLUMN fts_tsvector GENERATED ALWAYS AS (
        TO_TSVECTOR('simple', COALESCE(content::text, ''))
        ) STORED; 

    
