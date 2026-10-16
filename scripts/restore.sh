#!/bin/sh
# Restore a backup made by scripts/backup.sh. DESTRUCTIVE: replaces the data of the
# databases restored. Stop the API and workers first.
#
#   npm run restore -- ./backups/20261016T020000Z          # platform + every school in the backup
#   npm run restore -- ./backups/20261016T020000Z GVS      # one school only
#
# Each school is restored into the databases the platform registry names for it.
#
# Then run `npm run db:migrate` (a backup older than the code needs newer migrations).
set -eu

if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${MONGO_URI:?MONGO_URI is required}"

source_dir=${1:?usage: restore.sh <backup directory> [SCHOOL_CODE]}
only=${2:-}
[ -f "$source_dir/SHA256SUMS" ] || { echo "No SHA256SUMS in $source_dir" >&2; exit 1; }
(cd "$source_dir" && shasum -a 256 -c SHA256SUMS) || { echo "Checksum mismatch: backup is damaged" >&2; exit 1; }

if [ "${RESTORE_CONFIRM:-}" != "yes" ]; then
  printf 'This replaces ALL data in the configured databases. Type "restore" to continue: '
  read -r answer
  [ "$answer" = "restore" ] || { echo "Cancelled"; exit 1; }
fi

node scripts/list-databases.js | while IFS="$(printf '\t')" read -r name pg_url mongo_url; do
  [ -n "$name" ] || continue
  [ -z "$only" ] || [ "$name" = "$only" ] || continue
  [ -f "$source_dir/$name.postgres.dump" ] || { echo "  $name: not in this backup, skipped"; continue; }
  echo "  $name"
  pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --dbname="$pg_url" "$source_dir/$name.postgres.dump"
  if [ -n "$mongo_url" ] && [ -f "$source_dir/$name.mongo.archive.gz" ]; then
    mongorestore --uri="$mongo_url" --archive="$source_dir/$name.mongo.archive.gz" --gzip --drop --quiet
  fi
done

if [ -f "$source_dir/storage.tar.gz" ]; then
  mkdir -p "${STORAGE_LOCAL_DIR:-./storage}"
  tar -xzf "$source_dir/storage.tar.gz" -C "${STORAGE_LOCAL_DIR:-./storage}"
fi
echo "Restore complete from $source_dir. Now run: npm run db:migrate"
