ssh catcolab@backend-next.catcolab.org "pg_dump --clean" > "dumps/staging_$(date +%Y%m%d_%H%M%S).sql"


psql --user catcolab --dbname=catcolab -f dumps/staging_20260119_103224.sql

update permissions set subject = null where object = '019a97f9-0780-7463-818c-126de5c01c04';
