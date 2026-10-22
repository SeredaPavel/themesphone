#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
unset IMAGE_TAG

deployment_dir=/opt/hosting/themesphone
backup_root=/opt/hosting/backups/themesphone/releases
uploads_dir=/opt/hosting-data/themesphone/uploads
request=${SSH_ORIGINAL_COMMAND:-}
candidate=
snapshot=
previous=
stopped=false
switched=false

compose() {
    docker compose --project-directory "$deployment_dir" --env-file "$deployment_dir/.env" \
        -f "$deployment_dir/compose.yaml" "$@"
}
compose_next() {
    docker compose --project-directory "$deployment_dir" --env-file "$candidate" \
        -f "$deployment_dir/compose.yaml" "$@"
}
check_files() {
    test -f "$deployment_dir/compose.yaml"
    test -f "$deployment_dir/.env"
    test -f "$deployment_dir/frontend.env"
    test -d "$uploads_dir"
    docker info >/dev/null </dev/null
    compose config --quiet </dev/null
}

if [[ "$request" == check ]]; then
    check_files
    echo 'READY: ThemesPhone deployment access works.'
    exit 0
fi
if [[ ! "$request" =~ ^deploy\ ([a-f0-9]{40})$ ]]; then
    echo "Denied: expected 'check' or 'deploy <40-character commit SHA>'." >&2
    exit 64
fi
release_sha=${BASH_REMATCH[1]}
exec 9>/run/lock/themesphone-deploy.lock
flock -n 9 || { echo 'Another ThemesPhone deployment is running.' >&2; exit 75; }

http_status() {
    local expected=$1 host=$2 path=$3 mode=$4 actual
    local -a routing
    if [[ "$mode" == preview ]]; then
        routing=(--connect-to "$host:443:127.0.0.1:9443")
    else
        routing=(--resolve "$host:443:127.0.0.1")
    fi
    actual=$(curl --silent --show-error --connect-timeout 4 --max-time 15 \
        "${routing[@]}" --output /dev/null --write-out '%{http_code}' "https://$host$path") || return 1
    if [[ "$actual" != "$expected" ]]; then
        echo "HTTP check failed: $mode $host$path expected $expected, got $actual." >&2
        return 1
    fi
}
verify_routes() {
    local host
    for host in themesphone.ru www.themesphone.ru themesphone.com www.themesphone.com; do
        http_status 200 "$host" / preview || return 1
        http_status 503 "$host" / public || return 1
    done
    http_status 200 cms.themesphone.ru /admin preview || return 1
    http_status 204 cms.themesphone.ru /_health preview || return 1
    http_status 503 cms.themesphone.ru / public || return 1
    http_status 200 geoconverter.ru / public || return 1
    http_status 200 profitsite.ru / public || return 1
}
cleanup() {
    [[ -z "$candidate" ]] || rm -f -- "$candidate"
}
restore_images() {
    if [[ "$switched" == true ]]; then
        install -m 0600 "$previous" "$deployment_dir/.env-restore" || return 1
        mv -- "$deployment_dir/.env-restore" "$deployment_dir/.env" || return 1
    fi
    compose up -d --no-build --pull never --wait --wait-timeout 240 \
        themesphone-backend themesphone-frontend </dev/null || return 1
    verify_routes || return 1
}
fail() {
    local status=$1
    trap - ERR INT TERM HUP
    echo "ThemesPhone deployment failed (exit $status)." >&2
    if [[ "$stopped" == true ]]; then
        if restore_images; then
            echo 'Previous application images and checked HTTPS routes restored.' >&2
        else
            echo 'ROLLBACK FAILED: inspect ThemesPhone manually.' >&2
        fi
        echo "Data snapshot: $snapshot" >&2
        echo 'Database/uploads were NOT automatically restored. Schema changes may require manual recovery.' >&2
    else
        echo 'Active release and running applications were not changed.' >&2
    fi
    exit "$status"
}
trap cleanup EXIT
trap 'fail $?' ERR
trap 'fail 130' INT
trap 'fail 143' TERM
trap 'fail 129' HUP

check_files
# Refuse stale settings: rollback must describe the images that are actually running.
previous_sha=$(python3 - "$deployment_dir/.env" <<'PYTAG'
from pathlib import Path
import re, sys
matches = re.findall(r'^IMAGE_TAG=([a-f0-9]{40})$', Path(sys.argv[1]).read_text(), re.M)
if len(matches) != 1:
    raise SystemExit('Expected one SHA-based IMAGE_TAG in active settings.')
print(matches[0])
PYTAG
)
for service in backend frontend; do
    container_id=$(compose ps -q "themesphone-$service" </dev/null)
    test -n "$container_id"
    active_image=$(docker inspect --format '{{.Config.Image}}' "$container_id" </dev/null)
    test "$active_image" = "ghcr.io/seredapavel/themesphone/$service:$previous_sha"
done
# Check the existing preview and neighbouring sites BEFORE any downtime.
verify_routes
candidate=$(mktemp "$deployment_dir/.env-next.XXXXXX")
cp -- "$deployment_dir/.env" "$candidate"
python3 - "$candidate" "$release_sha" <<'PY'
from pathlib import Path
import re, sys
p = Path(sys.argv[1])
lines = [line for line in p.read_text().splitlines()
         if not re.match(r'^\s*(?:export\s+)?IMAGE_TAG\s*=', line)]
lines.append('IMAGE_TAG=' + sys.argv[2])
p.write_text('\n'.join(lines) + '\n')
PY
compose_next config --quiet </dev/null
# Download application images only; PostgreSQL is not updated by this script.
compose_next pull --policy missing themesphone-backend themesphone-frontend </dev/null
for service in backend frontend; do
    image="ghcr.io/seredapavel/themesphone/$service:$release_sha"
    revision=$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image" </dev/null)
    [[ "$revision" == "$release_sha" ]]
done

install -d -m 0700 "$backup_root" "$deployment_dir/releases"
snapshot=$(mktemp -d "$backup_root/$(date -u +%Y%m%dT%H%M%S)-before-$release_sha-XXXXXX")
previous="$snapshot/.env"
install -m 0600 "$deployment_dir/.env" "$previous"
install -m 0600 "$deployment_dir/frontend.env" "$snapshot/frontend.env"
install -m 0600 "$deployment_dir/compose.yaml" "$snapshot/compose.yaml"
# Stop writes so that the database dump and media archive describe the same state.
stopped=true
compose stop --timeout 30 themesphone-frontend themesphone-backend </dev/null
compose exec -T themesphone-db sh -c \
    'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
    > "$snapshot/database.dump" </dev/null
# This command intentionally receives the binary dump as stdin.
compose exec -T themesphone-db pg_restore --list < "$snapshot/database.dump" >/dev/null
tar --numeric-owner -czf "$snapshot/uploads.tar.gz" -C "$uploads_dir" .
(cd "$snapshot" && sha256sum database.dump uploads.tar.gz .env frontend.env compose.yaml > SHA256SUMS)
printf '%s\n' "$release_sha" > "$snapshot/requested-sha"
echo "Pre-deploy snapshot created: $snapshot"

# Preserve previous settings separately; all files are private (umask 077).
install -m 0600 "$previous" "$deployment_dir/previous.env"
install -m 0600 "$previous" "$deployment_dir/releases/$(basename "$snapshot").env"
switched=true
mv -- "$candidate" "$deployment_dir/.env"
candidate=
compose up -d --no-build --pull never --wait --wait-timeout 240 \
    themesphone-backend themesphone-frontend </dev/null
verify_routes
compose ps </dev/null
echo "SUCCESS: ThemesPhone deployed from $release_sha."
echo "Data snapshot: $snapshot"
