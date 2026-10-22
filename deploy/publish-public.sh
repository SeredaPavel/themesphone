#!/usr/bin/env bash
# Promote the already deployed catalogue release. Does not build or migrate data.
set -Eeuo pipefail
umask 077
[[ $(id -u) == 0 ]] || { echo 'Run as root.' >&2; exit 1; }
source_dir=$(cd -- "$(dirname -- "$0")" && pwd)
deployment_dir=/opt/hosting/themesphone
edge_conf=/opt/hosting/edge/conf
preview_compose=/opt/hosting/themesphone-preview/compose.yaml
installed_deploy=/usr/local/sbin/deploy-themesphone
changed=false
preview_stopped=false
backup=
candidate="$edge_conf/Caddyfile.public-check"

exec 9>/run/lock/themesphone-deploy.lock
flock -n 9 || { echo 'An update is running; try again after it completes.' >&2; exit 75; }
compose() {
    docker compose --project-directory "$deployment_dir" -f "$deployment_dir/compose.yaml" "$@"
}
probe() {
    local expected=$1 host=$2 path=$3 port=$4 actual
    actual=$(curl --silent --show-error --connect-timeout 4 --max-time 15 \
        --connect-to "$host:443:127.0.0.1:$port" --output /dev/null --write-out '%{http_code}' "https://$host$path")
    [[ "$actual" == "$expected" ]] || { echo "Expected $expected for $host$path on $port; received $actual." >&2; return 1; }
}
rollback() {
    local status=$1
    trap - ERR INT TERM HUP
    if [[ "$changed" == true ]]; then
        echo "Restoring public placeholder. Backup: $backup" >&2
        cp -a "$backup/Caddyfile" "$edge_conf/Caddyfile" || true
        if [[ -f "$backup/access-mode" ]]; then
            cp -a "$backup/access-mode" "$deployment_dir/access-mode" || true
        else
            rm -f "$deployment_dir/access-mode"
        fi
        docker exec hosting-edge-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile </dev/null || true
        if [[ "$preview_stopped" == true ]]; then
            docker compose -f "$preview_compose" up -d </dev/null || true
        fi
    fi
    rm -f "$candidate"
    exit "$status"
}
trap 'rollback $?' ERR
trap 'rollback 130' INT
trap 'rollback 143' TERM
trap 'rollback 129' HUP

test -f "$source_dir/themesphone-public.caddy"
test -f "$preview_compose"
if [[ -f "$deployment_dir/access-mode" ]]; then
    [[ $(cat "$deployment_dir/access-mode") == preview ]] || { echo 'Already public or unexpected mode; stop.' >&2; exit 1; }
fi
# Require the NEW installed checker (the old checker cannot validate public access).
grep -q 'public-proxy-ready images' "$installed_deploy"
for service in frontend; do
    task_id=$(compose ps -q "themesphone-$service" </dev/null)
    test -n "$task_id"
    task_image=$(docker inspect --format '{{.Config.Image}}' "$task_id" </dev/null)
    task_catalogue=$(docker image inspect --format '{{ index .Config.Labels "org.themesphone.public-proxy-ready" }}' "$task_image" </dev/null)
    [[ "$task_catalogue" == 1 ]] || { echo "Deploy the public-proxy-ready $service image first." >&2; exit 1; }
done
probe 200 themesphone.ru / 9443
probe 200 cms.themesphone.ru /admin 9443
probe 503 themesphone.ru / 443
probe 503 cms.themesphone.ru / 443

install -d -m 0700 /opt/hosting/backups
backup=$(mktemp -d /opt/hosting/backups/themesphone-public-$(date -u +%Y%m%dT%H%M%S)-XXXXXX)
cp -a "$edge_conf/Caddyfile" "$backup/Caddyfile"
if [[ -f "$deployment_dir/access-mode" ]]; then cp -a "$deployment_dir/access-mode" "$backup/access-mode"; fi
python3 - "$edge_conf/Caddyfile" "$source_dir/themesphone-public.caddy" "$candidate" <<'PY'
from pathlib import Path
import re, sys
live, snippet, candidate = map(Path, sys.argv[1:])
text = live.read_text()
pattern = r'^themesphone\.ru, www\.themesphone\.ru, themesphone\.com, www\.themesphone\.com, cms\.themesphone\.ru\s*\{[^{}]*\}'
found = list(re.finditer(pattern, text, re.M))
if len(found) != 1 or 'ThemesPhone: сайт восстанавливается.' not in found[0].group():
    raise SystemExit('Public Caddyfile differs from the expected placeholder. No live changes made.')
m = found[0]
candidate.write_text(text[:m.start()] + snippet.read_text().rstrip() + text[m.end():])
PY
docker exec hosting-edge-caddy-1 caddy validate --config /etc/caddy/Caddyfile.public-check --adapter caddyfile </dev/null
changed=true
mv "$candidate" "$edge_conf/Caddyfile"
docker exec hosting-edge-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile </dev/null
printf 'public\n' > "$deployment_dir/access-mode.next"
mv "$deployment_dir/access-mode.next" "$deployment_dir/access-mode"
SSH_ORIGINAL_COMMAND=check "$installed_deploy" </dev/null

# Remove the temporary internal CMS alias and loopback listener.
preview_stopped=true
docker compose -f "$preview_compose" down </dev/null
SSH_ORIGINAL_COMMAND=check "$installed_deploy" </dev/null
trap - ERR INT TERM HUP
printf 'PUBLIC: ThemesPhone catalogue is live. Backup: %s\n' "$backup"
printf 'Remove the marked ThemesPhone SSH preview block from Windows hosts and close the SSH tunnel.\n'
