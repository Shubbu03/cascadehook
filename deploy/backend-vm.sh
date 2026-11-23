#!/usr/bin/env bash
set -euo pipefail
umask 077

die() { printf '%s\n' "$*" >&2; exit 1; }
[[ "$(id -u)" == 0 ]] || die 'Run this script through sudo from deploy/backend.sh.'
(( $# == 4 )) || die 'Expected archive, SHA-256, commit, and release ID.'
archive=$1
checksum=$2
revision=$3
release=$4
[[ "$checksum" =~ ^[a-f0-9]{64}$ && "$revision" =~ ^[a-f0-9]{40}$ ]] || die 'Invalid archive checksum or commit.'
[[ "$release" =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}-[a-zA-Z0-9]{8}$ ]] || die 'Invalid release ID.'

root=/opt/cascadehook
candidate="cascadehook-server:release-$release"
previous="cascadehook-server:backup-$release"
for command in docker curl timeout flock sha256sum systemctl getent; do
  command -v "$command" >/dev/null || die "Missing VM command: $command"
done
operator=${SUDO_USER:?Run this script through sudo from deploy/backend.sh.}
operator_home=$(getent passwd "$operator" | cut -d: -f6)
operator_group=$(id -gn "$operator")
[[ "$operator_home" == /* && -d "$operator_home" ]] || die 'Could not find the deployment user home directory.'
backup="$operator_home/cascadehook-backups/$release"
[[ -f "$root/deploy/.env" ]] || die 'Missing production deploy/.env.'
exec 9>"$root/.backend-deploy.lock"
flock -n 9 || die 'Another backend deployment is already running.'
printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --status || die 'Archive checksum mismatch.'

stage=$(mktemp -d "$root/.backend-release.XXXXXXXX")
timer_paused=0
apps_stopped=0
migration_started=0
success=0

compose_live() {
  CASCADEHOOK_SERVER_IMAGE=cascadehook-server:local docker compose --project-name cascadehook --env-file "$root/deploy/.env" -f "$root/deploy/compose.yaml" --profile production "$@"
}
compose_candidate() {
  CASCADEHOOK_SERVER_IMAGE="$candidate" docker compose --project-name cascadehook --env-file "$root/deploy/.env" -f "$stage/deploy/compose.yaml" --profile production "$@"
}
finish() {
  result=$?
  trap - EXIT
  if (( result != 0 )); then
    if (( migration_started )); then
      printf '%s\n' 'Deployment failed after migration began. No automatic schema/image rollback was attempted.' 'The janitor timer remains paused if it was paused by this deployment.' >&2
      compose_live ps -a >&2 || true
      compose_live logs --tail=40 api worker >&2 || true
    elif (( apps_stopped )); then
      printf '%s\n' 'Deployment stopped before migrations. Restarting the previous API and worker...' >&2
      if ! compose_live up -d --no-deps api worker; then
        printf '%s\n' 'Previous services could not restart; the janitor timer remains paused.' >&2
        migration_started=1
      fi
    fi
  fi
  if (( timer_paused && (success || !migration_started) )); then
    if ! systemctl start cascadehook-janitor.timer; then
      printf '%s\n' 'Could not resume cascadehook-janitor.timer; start it manually.' >&2
      result=1
    fi
  fi
  if [[ -d "$backup" ]]; then
    chown -R "$operator:$operator_group" "$backup" || result=1
    printf 'VM backup: %s\nPrevious image: %s\n' "$backup" "$previous"
  fi
  rm -rf -- "$stage"
  if (( success )); then
    rm -f -- "$archive" "$0"
  fi
  exit "$result"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

tar --no-same-owner -xzf "$archive" -C "$stage"
[[ -f "$stage/apps/server/Dockerfile" && -f "$stage/deploy/compose.yaml" ]] || die 'Incomplete backend archive.'
compose_live config --quiet
compose_candidate config --quiet
postgres=$(compose_live ps -q postgres)
api=$(compose_live ps -a -q api)
worker=$(compose_live ps -a -q worker)
[[ -n "$postgres" && -n "$api" && -n "$worker" ]] || die 'Expected existing PostgreSQL, API, and worker containers.'
old_image=$(docker inspect --format '{{.Image}}' "$api")
[[ "$(docker inspect --format '{{.Image}}' "$worker")" == "$old_image" ]] || die 'API and worker use different images; inspect the deployment first.'

mkdir -p "$backup"
printf '%s\n' "$revision" > "$backup/target-commit"
printf '%s\n' "$old_image" > "$backup/previous-image"
if systemctl is-active --quiet cascadehook-janitor.timer; then
  printf 'active\n' > "$backup/janitor-timer-before"
else
  printf 'inactive\n' > "$backup/janitor-timer-before"
fi
tar -czf "$backup/server-files.tar.gz" -C "$root" apps/server deploy
docker image tag "$old_image" "$previous"

printf '%s\n' 'Building the candidate image while the current services keep running...'
compose_candidate build api

if systemctl is-active --quiet cascadehook-janitor.timer; then
  timer_paused=1
  systemctl stop cascadehook-janitor.timer
fi
if systemctl is-active --quiet cascadehook-janitor.service; then
  systemctl stop cascadehook-janitor.service
fi
janitors=$(docker ps -q --filter label=com.docker.compose.project=cascadehook --filter label=com.docker.compose.service=janitor)
while IFS= read -r janitor; do
  [[ -z "$janitor" ]] || docker stop --time=60 "$janitor" >/dev/null
done <<< "$janitors"

printf '%s\n' 'Pausing the API and worker for backup and migration...'
apps_stopped=1
compose_live stop -t 60 api worker
timeout -k 5s 300s docker compose --project-name cascadehook --env-file "$root/deploy/.env" -f "$root/deploy/compose.yaml" --profile production exec -T --interactive=false -e PGCONNECT_TIMEOUT=10 postgres pg_dump -w --verbose --lock-wait-timeout=30s -U postgres -d cascadehook -Fc </dev/null > "$backup/database.dump"
[[ -s "$backup/database.dump" ]] || die 'The database backup is empty.'
# pg_restore needs archive input, so keep stdin enabled for this command only.
timeout -k 5s 60s docker compose --project-name cascadehook --env-file "$root/deploy/.env" -f "$root/deploy/compose.yaml" --profile production exec -T postgres pg_restore --list < "$backup/database.dump" > "$backup/database.contents"

printf '%s\n' 'Applying pending migrations with the candidate image...'
migration_started=1
compose_candidate run --rm --no-deps -T migrate </dev/null

# Replace source directories, rather than extracting over them: deleted Go files
# must not survive a release. Carry the production environment into the new tree.
cp -p "$root/deploy/.env" "$stage/deploy/.env"
mv "$root/apps/server" "$stage/previous-server"
mv "$stage/apps/server" "$root/apps/server"
mv "$root/deploy" "$stage/previous-deploy"
mv "$stage/deploy" "$root/deploy"
docker image tag "$candidate" cascadehook-server:local
compose_live up -d --no-deps --force-recreate api worker

printf '%s\n' 'Checking local and public readiness...'
curl --fail --silent --show-error --connect-timeout 3 --max-time 5 --retry 15 --retry-all-errors --retry-delay 2 --retry-max-time 90 http://127.0.0.1:8080/readyz
curl --fail --silent --show-error --connect-timeout 3 --max-time 10 --retry 10 --retry-all-errors --retry-delay 2 --retry-max-time 90 https://api.cascadehook.com/readyz
sleep 5
new_image=$(docker image inspect --format '{{.Id}}' "$candidate")
for service in api worker; do
  container=$(compose_live ps -q "$service")
  [[ -n "$container" ]] || die "$service is not running."
  [[ "$(docker inspect --format '{{.State.Running}} {{.State.Restarting}} {{.RestartCount}} {{.Image}}' "$container")" == "true false 0 $new_image" ]] || die "$service exited, restarted, or uses an unexpected image."
done
printf '%s\n' "$revision" > "$root/deploy/.backend-release"
compose_live ps -a
success=1
printf 'Backend deployed successfully: %s\n' "$revision"
