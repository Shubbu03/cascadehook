#!/bin/sh
set -eu

cd "$(dirname "$0")"
if [ -e .env ]; then
  printf '%s\n' '.env already exists; existing keys and passwords were preserved.'
  exit 0
fi

command -v openssl >/dev/null
umask 077
admin_password=$(openssl rand -hex 32)
app_password=$(openssl rand -hex 32)
signing_key=$(openssl rand -base64 32)

# Refuse to overwrite a file if another invocation created it in the meantime.
set -C
sed \
  -e "s/^POSTGRES_ADMIN_PASSWORD=.*/POSTGRES_ADMIN_PASSWORD=$admin_password/" \
  -e "s/^POSTGRES_APP_PASSWORD=.*/POSTGRES_APP_PASSWORD=$app_password/" \
  -e "s|^SIGNING_ENCRYPTION_KEY=.*|SIGNING_ENCRYPTION_KEY=$signing_key|" \
  .env.example > .env
printf '%s\n' 'Created private .env with database passwords and a signing encryption key.'
