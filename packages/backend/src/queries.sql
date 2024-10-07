/* @name Autosave */
UPDATE refs
SET autosave = :snapshotId, lastUpdated = NOW()
WHERE id = :refId;

/* @name GetAutosave */
SELECT snapshots.content as content
FROM refs
INNER JOIN snapshots ON refs.autosave = snapshots.id
WHERE refs.id = :refId;

/* @name GetRefMeta */
SELECT title FROM refs WHERE id = :refId;

/* @name GetRefs */
SELECT id, title
FROM refs
ORDER BY lastUpdated DESC;

/* @name GetWitnesses */
SELECT id, snapshot, note, atTime FROM witnesses WHERE forRef = :refId ORDER BY atTime;

/* @name NewRef */
INSERT INTO refs(id, title, lastUpdated)
VALUES (gen_random_uuid(), :title, NOW())
RETURNING id;

/* @name NewSnapshot */
INSERT INTO snapshots(hash, content)
    VALUES (digest(:content::text, 'sha256'::text), :content)
    ON CONFLICT (hash) DO UPDATE SET
    hash = EXCLUDED.hash
    RETURNING id;

/* @name SaveRef */
INSERT INTO witnesses(snapshot, forRef, note, atTime)
SELECT autosave, :refId, :note, NOW() FROM refs WHERE refs.id = :refId
RETURNING id;

/* @name DropExternsFrom */
DELETE FROM externs
WHERE fromRef = :refId;

/* 
  @name InsertNewExterns
  @param rows -> ((fromRef, toRef, taxon, via)...)
*/
INSERT INTO externs(fromRef, toRef, taxon, via)
VALUES :rows;

/* @name GetBacklinks */
SELECT fromRef
FROM externs
WHERE toRef = :toRef AND taxon = :taxon;
