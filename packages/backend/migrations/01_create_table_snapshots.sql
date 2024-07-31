CREATE TABLE snapshots (
    id serial primary key,
    hash bytea unique,
    content text
);
