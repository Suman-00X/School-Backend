#!/bin/sh
# Restore a backup made by scripts/backup.sh. DESTRUCTIVE: replaces the data in
# DATABASE_URL and MONGO_URI. Stop the API and workers first.
#
#   npm run restore -- ./backups/20261016T020000Z
#
# Then run `npm run db:migrate` (a backup older than the code needs newer migrations).
set -eu

if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${MONGO_URI:?MONGO_URI is required}"

source_dir=${1:?usage: restore.sh <backup directory>}
[ -f "$source_dir/SHA256SUMS" ] || { echo "No SHA256SUMS in $source_dir" >&2; exit 1; }
(cd "$source_dir" && shasum -a 256 -c SHA256SUMS) || { echo "Checksum mismatch: backup is damaged" >&2; exit 1; }

if [ "${RESTORE_CONFIRM:-}" != "yes" ]; then
  printf 'This replaces ALL data in the configured databases. Type "restore" to continue: '
  read -r answer
  [ "$answer" = "restore" ] || { echo "Cancelled"; exit 1; }
fi

pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --dbname="$DATABASE_URL" "$source_dir/postgres.dump"
mongorestore --uri="$MONGO_URI" --archive="$source_dir/mongo.archive.gz" --gzip --drop --quiet

if [ -f "$source_dir/storage.tar.gz" ]; then
  mkdir -p "${STORAGE_LOCAL_DIR:-./storage}"
  tar -xzf "$source_dir/storage.tar.gz" -C "${STORAGE_LOCAL_DIR:-./storage}"
fi
echo "Restore complete from $source_dir. Now run: npm run db:migrate"
