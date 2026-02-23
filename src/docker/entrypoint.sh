#!/bin/sh
set -e

if [ "${MIGRATE_ON_START:-true}" = "true" ]; then
  echo "[entrypoint] Running migrations..."
  node src/scripts/migrate.mjs
fi

echo "[entrypoint] Starting Raven server..."
exec node .output/server/index.mjs
