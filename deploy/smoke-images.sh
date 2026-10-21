#!/usr/bin/env bash
# Isolated startup checks only; never connects to user data or the VPS.
set -euo pipefail

backend_image=${1:?Supply backend image}
frontend_image=${2:?Supply frontend image}
task_prefix="themesphone-ci-$$"
task_network="${task_prefix}-network"
task_db="${task_prefix}-db"
task_backend="${task_prefix}-backend"
task_frontend="${task_prefix}-frontend"

cleanup() {
  task_status=$?
  trap - EXIT
  if (( task_status != 0 )); then
    for task_container in "$task_db" "$task_backend" "$task_frontend"; do
      docker logs --tail 80 "$task_container" 2>/dev/null || true
    done
  fi
  docker rm -fv "$task_frontend" "$task_backend" "$task_db" >/dev/null 2>&1 || true
  docker network rm "$task_network" >/dev/null 2>&1 || true
  exit "$task_status"
}
trap cleanup EXIT

wait_db() {
  for ((task_attempt=0; task_attempt<60; task_attempt++)); do
    if docker exec "$task_db" pg_isready -h 127.0.0.1 -U smoke -d themesphone_ci >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo 'PostgreSQL did not become ready.' >&2
  return 1
}

wait_http() {
  local task_container=$1 task_url=$2 task_expected=$3
  for ((task_attempt=0; task_attempt<120; task_attempt++)); do
    if [[ $(docker inspect --format '{{.State.Running}}' "$task_container") != true ]]; then
      echo "Container stopped: $task_container" >&2
      return 1
    fi
    if docker exec "$task_container" node -e \
      "fetch(process.argv[1], {signal: AbortSignal.timeout(3000)}).then(r => process.exit(r.status === Number(process.argv[2]) ? 0 : 1)).catch(() => process.exit(1))" \
      "$task_url" "$task_expected" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "HTTP check failed: $task_url" >&2
  return 1
}

docker network create "$task_network" >/dev/null
docker run -d --name "$task_db" --network "$task_network" --network-alias db \
  -e POSTGRES_USER=smoke -e POSTGRES_PASSWORD=ci-only-not-a-production-password \
  -e POSTGRES_DB=themesphone_ci postgres:17-bookworm >/dev/null
wait_db

docker run -d --name "$task_backend" --network "$task_network" --network-alias backend \
  -e NODE_ENV=production -e HOST=0.0.0.0 -e PORT=1337 \
  -e DATABASE_CLIENT=postgres -e DATABASE_HOST=db -e DATABASE_PORT=5432 \
  -e DATABASE_NAME=themesphone_ci -e DATABASE_USERNAME=smoke \
  -e DATABASE_PASSWORD=ci-only-not-a-production-password -e DATABASE_SSL=false \
  -e APP_KEYS=ci-only-key-one,ci-only-key-two \
  -e API_TOKEN_SALT=ci-only-api-token-salt -e ADMIN_JWT_SECRET=ci-only-admin-secret \
  -e TRANSFER_TOKEN_SALT=ci-only-transfer-salt -e JWT_SECRET=ci-only-jwt-secret \
  -e ENCRYPTION_KEY=0123456789abcdef0123456789abcdef \
  -e STRAPI_ADMIN_BACKEND_URL=https://cms.themesphone.ru \
  -e STRAPI_TELEMETRY_DISABLED=true \
  -e SMTP_HOST=127.0.0.1 -e SMTP_PORT=2525 -e SMTP_SECURE=false \
  -e SMTP_USER=ci-only -e SMTP_PASS=ci-only \
  "$backend_image" >/dev/null
wait_http "$task_backend" http://127.0.0.1:1337/_health 204

docker run -d --name "$task_frontend" --network "$task_network" \
  -e NODE_ENV=production -e HOSTNAME=0.0.0.0 -e PORT=3000 \
  -e STRAPI_API_URL=http://backend:1337 -e NEXT_PUBLIC_STRAPI_URL=https://cms.themesphone.ru \
  "$frontend_image" >/dev/null
# The fresh CI database has no public catalogue permissions or real user content.
# Use a static page to check standalone startup without bypassing those permissions.
wait_http "$task_frontend" http://127.0.0.1:3000/auth/login 200
# Verify that the frontend container can resolve and reach Strapi internally.
docker exec "$task_frontend" node -e \
  "fetch('http://backend:1337/_health', {signal: AbortSignal.timeout(5000)}).then(r => process.exit(r.status === 204 ? 0 : 1)).catch(() => process.exit(1))"
echo 'PASS: PostgreSQL readiness, Strapi health, frontend startup and internal connectivity.'
