CREATE TABLE externs (
    fromRef UUID NOT NULL REFERENCES refs (id),
    toRef UUID NOT NULL REFERENCES refs (id),
    taxon TEXT NOT NULL,
    via TEXT,
    CONSTRAINT externs_is_relation UNIQUE (fromRef, toRef, taxon, via)
);
