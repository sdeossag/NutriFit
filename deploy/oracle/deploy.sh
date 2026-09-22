#!/usr/bin/env bash
# Actualiza el backend en la VM: trae lo último de main, reconstruye y reinicia.
# Uso (en el servidor):  bash /opt/nutrifit/deploy/oracle/deploy.sh
set -euo pipefail

cd "$(dirname "$0")"
git -C ../.. pull --ff-only
docker compose up -d --build
docker image prune -f > /dev/null
docker compose ps
