CREATE TABLE snapshots (
    id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    content JSONB NOT NULL
);

CREATE TABLE refs (
    id UUID PRIMARY KEY,
    taxon TEXT NOT NULL,
    autosave INT REFERENCES snapshots (id),
    last_updated TIMESTAMPTZ NOT NULL
);

CREATE TABLE witnesses (
    id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    snapshot INT NOT NULL REFERENCES snapshots (id),
    for_ref UUID NOT NULL REFERENCES refs (id),
    at_time TIMESTAMPTZ NOT NULL
);
