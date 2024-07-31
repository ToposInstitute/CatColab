CREATE TABLE history (
    id serial primary key,
    snapshot int references snapshots(id),
    prev int references history(id)
);

CREATE TABLE refs (
    id uuid primary key,
    title text,
    history int references history(id)
);
