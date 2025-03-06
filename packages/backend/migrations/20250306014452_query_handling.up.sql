-- query handling
SELECT * FROM snapshots
WHERE fts_tsvector @@ plainto_tsquery('simple', :searchTerm)
  AND last_updated >= :createdAfter
LIMIT :limit OFFSET :offset;
