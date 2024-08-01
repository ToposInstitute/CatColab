WITH ref_id AS (
    INSERT INTO refs(id, title)
    VALUES(gen_random_uuid(), $2)
    RETURNING id
), witness_id AS (
    INSERT INTO witnesses(snapshot, forRef, note, atTime)
    VALUES($1, ref_id, $3, NOW())
    RETURNING id
), _1 AS (
    UPDATE refs SET latest = witness_id WHERE id = ref_id
)
SELECT * FROM ref_id;
