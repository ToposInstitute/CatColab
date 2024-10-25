CREATE TYPE permission_level AS ENUM ('read', 'write', 'maintain', 'own');

CREATE TABLE permissions (
    subject TEXT NOT NULL,
    object UUID NOT NULL REFERENCES refs (id),
    level permission_level NOT NULL,
    CONSTRAINT permissions_is_relation UNIQUE (subject, object)
);
