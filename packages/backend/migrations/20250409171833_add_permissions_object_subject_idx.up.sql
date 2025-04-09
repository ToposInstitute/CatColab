-- Allow the sorting to be treated as a scan for the `effective_permissions` CTE in document.rs
CREATE INDEX CONCURRENTLY IF NOT EXISTS permissions_object_subject_idx
    ON permissions (object, subject);
