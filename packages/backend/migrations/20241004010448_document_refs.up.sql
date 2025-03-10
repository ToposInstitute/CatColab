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



    
