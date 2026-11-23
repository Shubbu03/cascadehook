#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == --help ]]; then
  printf '%s\n' 'Usage: bash deploy/backend.sh' 'Deploy the committed backend using deploy/.env.backend and your gcloud login.'
  exit 0
fi
if (( $# != 0 )); then
  printf '%s\n' 'Usage: bash deploy/backend.sh' >&2
  exit 1
fi

repo=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
cd "$repo"
config="$repo/deploy/.env.backend"
if [[ ! -f "$config" ]]; then
  printf '%s\n' 'Copy deploy/.env.backend.example to deploy/.env.backend and fill in your deployment settings.' >&2
  exit 1
fi
# Parse plain assignments without executing the contents of the config file.
project=
instance=
ssh_user=
while IFS='=' read -r key value || [[ -n "$key" ]]; do
  [[ -z "$key" || "$key" == \#* ]] && continue
  case "$key" in
    GCP_PROJECT_ID) project=$value ;;
    GCP_VM_NAME) instance=$value ;;
    GCP_VM_USER) ssh_user=$value ;;
    *) printf 'Unknown setting in deploy/.env.backend: %s\n' "$key" >&2; exit 1 ;;
  esac
done < "$config"
if [[ -z "$project" || -z "$instance" || -z "$ssh_user" ]]; then
  printf '%s\n' 'Set GCP_PROJECT_ID, GCP_VM_NAME, and GCP_VM_USER in deploy/.env.backend.' >&2
  exit 1
fi
for command in gcloud go shasum; do
  command -v "$command" >/dev/null || { printf 'Missing command: %s\n' "$command" >&2; exit 1; }
done

# git archive ships exactly HEAD, including file deletions. Never silently omit
# a local backend edit or a newly added migration from the release.
changes=$(git status --porcelain --untracked-files=normal -- apps/server deploy)
if [[ -n "$changes" ]]; then
  printf 'Commit or stash your backend/deploy changes before deploying:\n%s\n' "$changes" >&2
  exit 1
fi
revision=$(git rev-parse HEAD)
git cat-file -e "$revision:deploy/backend-vm.sh"

umask 077
work=$(mktemp -d "${TMPDIR:-/tmp}/cascadehook-deploy.XXXXXXXX")
trap 'rm -rf -- "$work"' EXIT
release="$(date -u +%Y%m%dT%H%M%SZ)-${revision:0:12}-${work##*.}"
archive="backend-$release.tar.gz"
runner="backend-$release.sh"
git archive --format=tar.gz --output="$work/$archive" "$revision" apps/server deploy
git show "$revision:deploy/backend-vm.sh" > "$work/$runner"
checksum=$(shasum -a 256 "$work/$archive")
checksum=${checksum%% *}
mkdir "$work/check"
tar -xzf "$work/$archive" -C "$work/check"
printf 'Checking the Go backend at commit %s...\n' "$revision"
(cd "$work/check/apps/server" && go vet ./... && go test ./...)

remote="$ssh_user@$instance"
zone=$(gcloud compute instances list --project="$project" --filter="name=$instance" --format='value(zone.basename())')
if [[ -z "$zone" || "$zone" == *$'\n'* ]]; then
  printf 'Expected exactly one VM named %s in project %s.\n' "$instance" "$project" >&2
  exit 1
fi

printf 'Uploading commit %s to %s (%s)...\n' "$revision" "$instance" "$zone"
gcloud compute scp "$work/$archive" "$work/$runner" "$remote:~/" --project="$project" --zone="$zone" --quiet

status=0
gcloud compute ssh "$remote" --project="$project" --zone="$zone" --quiet --ssh-flag=-oServerAliveInterval=30 --ssh-flag=-oServerAliveCountMax=10 --command="sudo -n bash \"\$HOME/$runner\" \"\$HOME/$archive\" '$checksum' '$revision' '$release'" || status=$?

# Copy even after a failed migration: the pre-migration backup belongs off the
# VM as well. A failed copy makes the command fail without changing the release.
backup_root="$HOME/cascadehook-backups"
mkdir -p "$backup_root"
chmod 700 "$backup_root"
if gcloud compute scp --recurse "$remote:~/cascadehook-backups/$release" "$backup_root/" --project="$project" --zone="$zone" --quiet; then
  printf 'Local backup: %s/%s\n' "$backup_root" "$release"
else
  printf 'Backup copy failed. If created, the VM backup is at %s:~/cascadehook-backups/%s\n' "$remote" "$release" >&2
  status=1
fi
if (( status != 0 )); then
  printf '%s\n' 'Deployment command failed. Read the VM result above before retrying.' >&2
  exit "$status"
fi
printf 'Deployed %s. Verify a publish/delivery in the dashboard.\n' "$revision"
