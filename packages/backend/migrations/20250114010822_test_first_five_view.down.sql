-- Add down migration script here
SELECT *
FROM users
LIMIT 2;

SELECT * 
FROM permission_level
LIMIT 2; 

SELECT * 
FROM permissions
LIMIT 2; 