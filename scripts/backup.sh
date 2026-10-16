#!/bin/sh
# Back up PostgreSQL, MongoDB and (local driver) uploaded files into
# $BACKUP_DIR/<UTC timestamp>/ with SHA-256 checksums, then prune old backups.
#
#   npm run backup                      # reads .env when present
#   BACKUP_S3_URI=s3://bucket/school npm run backup   # also copy off-site (aws cli)
#
# Needs pg_dump (same major version as the server or newer) and mongodump.
# Database URLs are passed on the command line; on shared hosts prefer ~/.pgpass
# and a mongodump --config file so passwords do not show in `ps`.
# Managed databases should ALSO have point-in-time recovery switched on;
# this script is the portable, provider-independent copy. See docs/OPERATIONS.md.
set -eu

if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${MONGO_URI:?MONGO_URI is required}"

BACKUP_DIR=${BACKUP_DIR:-./backups}
KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$BACKUP_DIR/$stamp"
umask 077
mkdir -p "$target"

echo "Backing up to $target"
pg_dump --format=custom --no-owner --no-privileges --file="$target/postgres.dump" "$DATABASE_URL"
mongodump --uri="$MONGO_URI" --archive="$target/mongo.archive.gz" --gzip --quiet

if [ "${STORAGE_DRIVER:-local}" = "local" ] && [ -d "${STORAGE_LOCAL_DIR:-./storage}" ]; then
  tar -czf "$target/storage.tar.gz" -C "${STORAGE_LOCAL_DIR:-./storage}" .
fi
# With STORAGE_DRIVER=s3, protect files with bucket versioning + replication instead.

(cd "$target" && shasum -a 256 -- * > SHA256SUMS)

if [ -n "${BACKUP_S3_URI:-}" ]; then
  aws s3 cp --recursive --only-show-errors "$target" "$BACKUP_S3_URI/$stamp"
fi

# Only folders this script created (named like 20261016T020000Z) are pruned
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '????????T??????Z' -mtime +"$KEEP_DAYS" -exec rm -rf {} +
echo "Backup complete: $target"
