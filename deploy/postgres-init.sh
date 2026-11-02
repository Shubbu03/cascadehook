#!/bin/sh
set -eu

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 --set=app_password="$POSTGRES_APP_PASSWORD" <<'SQL'
CREATE ROLE cascadehook LOGIN PASSWORD :'app_password';
ALTER DATABASE cascadehook OWNER TO cascadehook;
GRANT ALL ON SCHEMA public TO cascadehook;
SQL
