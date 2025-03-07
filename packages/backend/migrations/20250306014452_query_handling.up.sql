-- query handling
SELECT * FROM snapshots
WHERE fts_tsvector @@ plainto_tsquery('simple', :searchTerm)
  AND last_updated >= :createdAfter
LIMIT :limit OFFSET :offset;

-- Sort by most recent first
SELECT * FROM snapshot_permissions 
WHERE user_id = :user_id 
ORDER BY date_sort DESC;

-- Sort by oldest first
SELECT * FROM snapshot_permissions 
WHERE user_id = :user_id 
ORDER BY date_sort ASC;

-- Create a view for search results with permissions and sorting options
CREATE VIEW snapshot_permissions AS
SELECT 
    snapshots.id,
    snapshots.content,
    snapshots.last_updated,
    snapshots.for_ref,
    permissions.subject as user_id,
    permissions.level,
    CASE 
        WHEN permissions.level = 'own' THEN true
        WHEN permissions.level = 'maintain' THEN true
        WHEN permissions.level = 'write' THEN true
        WHEN permissions.level = 'read' THEN false
        ELSE false
    END as can_toggle,
    -- Add sorting helper columns
    snapshots.last_updated as date_sort
  FROM snapshots 
  JOIN permissions ON permissions.object = snapshots.for_ref;

-- Create indexes to support efficient sorting
CREATE INDEX snapshots_date_sort_idx ON snapshots (last_updated DESC);

