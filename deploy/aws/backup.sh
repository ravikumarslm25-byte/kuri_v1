#!/usr/bin/env bash
# Daily backup of Kuri: MongoDB dump + uploaded files (guest photos, cards, template artwork).
# Run from the project folder (where docker-compose.yml is):   bash deploy/aws/backup.sh
# Cron (03:30 every day):  30 3 * * * cd /opt/kuri && bash deploy/aws/backup.sh >> backups/backup.log 2>&1
# Optional off-server copy: set S3_BUCKET=s3://your-bucket/kuri (needs the AWS CLI + an instance role).
set -euo pipefail
cd "$(dirname "$0")/../.."
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M)"
mkdir -p backups

docker compose exec -T mongo mongodump --db kuri --archive --gzip > "backups/db-$STAMP.archive.gz"
docker compose exec -T app tar -czf - -C /data uploads > "backups/uploads-$STAMP.tar.gz"
echo "$(date -Is) backup ok: db-$STAMP.archive.gz uploads-$STAMP.tar.gz"

if [ -n "${S3_BUCKET:-}" ]; then
  aws s3 cp "backups/db-$STAMP.archive.gz" "$S3_BUCKET/"
  aws s3 cp "backups/uploads-$STAMP.tar.gz" "$S3_BUCKET/"
fi

find backups -name 'db-*.archive.gz' -mtime +"$KEEP_DAYS" -delete
find backups -name 'uploads-*.tar.gz' -mtime +"$KEEP_DAYS" -delete

# Restore (careful: replaces the current data):
#   docker compose exec -T mongo mongorestore --drop --archive --gzip < backups/db-XXXX.archive.gz
#   docker compose exec -T app sh -c 'rm -rf /data/uploads/* && tar -xzf - -C /data' < backups/uploads-XXXX.tar.gz
