CREATE TABLE users (
    id TEXT PRIMARY KEY,
    created TIMESTAMPTZ NOT NULL,
    signed_in TIMESTAMPTZ NOT NULL,
    username TEXT UNIQUE,
    display_name TEXT
);

CREATE TYPE permission_level AS ENUM ('read', 'write', 'maintain', 'own');

CREATE TABLE permissions (
    subject TEXT REFERENCES users (id),
    object UUID NOT NULL REFERENCES refs (id),
    level permission_level NOT NULL,
    CONSTRAINT permissions_is_relation UNIQUE (subject, object)
);
