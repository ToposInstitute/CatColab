CREATE TABLE refs (
    id UUID PRIMARY KEY,
    title TEXT,
    autosave INT REFERENCES snapshots (id),
    lastUpdated TIMESTAMPTZ NOT NULL
);

CREATE TABLE witnesses (
    id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    snapshot INT NOT NULL REFERENCES snapshots (id),
    forRef UUID NOT NULL REFERENCES refs (id),
    note TEXT,
    atTime TIMESTAMPTZ NOT NULL
);
