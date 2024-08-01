CREATE TABLE witnesses (
    id INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    snapshot INT REFERENCES snapshots (id),
    forRef UUID NOT NULL,
    note TEXT,
    atTime TIMESTAMPTZ NOT NULL
);

CREATE TABLE refs (
    id UUID PRIMARY KEY,
    title TEXT,
    autosave INT REFERENCES snapshots (id),
    latest INT REFERENCES witnesses (id)
);

ALTER TABLE witnesses ADD CONSTRAINT forRefForeignKey
    FOREIGN KEY (forRef)
    REFERENCES refs (id);
