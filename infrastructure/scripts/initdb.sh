password=$(echo "$1" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
psql -c "create database catcolab;"
psql -c "create user catcolab with encrypted password '$password';"
psql -c "grant all privileges on database catcolab to catcolab;"
psql -c "alter database catcolab owner to catcolab;"
psql -d catcolab -c "grant all on schema public to catcolab;"
