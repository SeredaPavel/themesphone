#!/usr/bin/env bash
# Temporary loopback-only HTTPS entry for SSH forwarding. Run as root on the VPS.
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run as root.' >&2; exit 1; }

task_target=/opt/hosting/themesphone-preview
task_cert_root=/opt/hosting/edge/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory
task_public_config=/opt/hosting/edge/conf/Caddyfile
task_hosts=(themesphone.ru www.themesphone.ru themesphone.com www.themesphone.com cms.themesphone.ru)
[[ ! -e "$task_target" ]] || { echo "$task_target already exists; stop and inspect it." >&2; exit 1; }
docker network inspect hosting_themesphone_edge >/dev/null
if ss -H -ltn 'sport = :9443' | grep -q .; then
  echo 'Port 9443 is already occupied.' >&2
  exit 1
fi
for task_host in "${task_hosts[@]}"; do
  test -s "$task_cert_root/$task_host/$task_host.crt"
  test -s "$task_cert_root/$task_host/$task_host.key"
  openssl x509 -in "$task_cert_root/$task_host/$task_host.crt" -noout -checkend 3600 >/dev/null
  openssl x509 -in "$task_cert_root/$task_host/$task_host.crt" -noout -checkhost "$task_host" >/dev/null
  task_status=$(curl --silent --show-error --connect-timeout 3 --max-time 10 \
    --resolve "$task_host:443:127.0.0.1" --output /dev/null --write-out '%{http_code}' "https://$task_host/")
  [[ "$task_status" == 503 ]] || { echo "Expected public placeholder 503 for $task_host, got $task_status." >&2; exit 1; }
done
task_config_hash=$(sha256sum "$task_public_config" | cut -d ' ' -f 1)

task_staging=$(mktemp -d /opt/hosting/themesphone-preview-stage.XXXXXX)
install -d -m 700 "$task_staging/conf" "$task_staging/data" "$task_staging/state"
cat > "$task_staging/conf/Caddyfile" <<'CADDY'
{
    admin off
    auto_https off
    persist_config off
    servers {
        protocols h1 h2
    }
}
CADDY
for task_host in "${task_hosts[@]}"; do
  task_upstream=themesphone-frontend:3000
  if [[ "$task_host" == cms.themesphone.ru ]]; then
    task_upstream=themesphone-backend:1337
  fi
  cat >> "$task_staging/conf/Caddyfile" <<CADDY

https://$task_host {
    tls /tls/$task_host/$task_host.crt /tls/$task_host/$task_host.key
    encode zstd gzip
    header X-Robots-Tag "noindex, nofollow"
    handle /healthz {
        respond "PREVIEW OK" 200
    }
    handle {
        reverse_proxy $task_upstream
    }
}
CADDY
done
cat > "$task_staging/compose.yaml" <<'COMPOSE'
name: themesphone-preview
services:
  preview:
    image: caddy:2.11.7-alpine
    restart: unless-stopped
    mem_limit: 128m
    ports:
      - "127.0.0.1:9443:443/tcp"
    volumes:
      - ./conf:/etc/caddy:ro
      - ./data:/data
      - ./state:/config
COMPOSE
for task_host in "${task_hosts[@]}"; do
  printf '      - %s/%s:/tls/%s:ro\n' "$task_cert_root" "$task_host" "$task_host" >> "$task_staging/compose.yaml"
done
cat >> "$task_staging/compose.yaml" <<'COMPOSE'
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    networks:
      edge:
        aliases:
          - cms.themesphone.ru
networks:
  edge:
    external: true
    name: hosting_themesphone_edge
COMPOSE
chmod 600 "$task_staging/compose.yaml" "$task_staging/conf/Caddyfile"

docker compose -f "$task_staging/compose.yaml" config --quiet </dev/null
docker compose -f "$task_staging/compose.yaml" run --rm --no-deps -T \
  --entrypoint caddy preview validate --config /etc/caddy/Caddyfile --adapter caddyfile </dev/null
mv "$task_staging" "$task_target"
docker compose -f "$task_target/compose.yaml" up -d </dev/null

for task_host in "${task_hosts[@]}"; do
  task_response=$(curl --fail --silent --show-error --retry 5 --retry-delay 2 --retry-all-errors \
    --connect-timeout 3 --max-time 5 --connect-to "$task_host:443:127.0.0.1:9443" "https://$task_host/healthz")
  [[ "$task_response" == 'PREVIEW OK' ]]
  printf 'Private HTTPS: %s OK\n' "$task_host"
  task_status=$(curl --silent --show-error --connect-timeout 3 --max-time 10 \
    --resolve "$task_host:443:127.0.0.1" --output /dev/null --write-out '%{http_code}' "https://$task_host/")
  [[ "$task_status" == 503 ]] || { echo "Public placeholder changed for $task_host: $task_status" >&2; exit 1; }
done
curl --fail --silent --show-error --max-time 15 \
  --connect-to themesphone.ru:443:127.0.0.1:9443 --output /dev/null \
  --write-out 'Private frontend: HTTP %{http_code}\n' https://themesphone.ru/
curl --fail --silent --show-error --max-time 15 \
  --connect-to cms.themesphone.ru:443:127.0.0.1:9443 --output /dev/null \
  --write-out 'Private Strapi admin: HTTP %{http_code}\n' https://cms.themesphone.ru/admin
[[ "$task_config_hash" == "$(sha256sum "$task_public_config" | cut -d ' ' -f 1)" ]]
for task_host in geoconverter.ru profitsite.ru; do
  curl --fail --silent --show-error --connect-timeout 3 --max-time 15 \
    --resolve "$task_host:443:127.0.0.1" --output /dev/null \
    --write-out "$task_host: HTTP %{http_code}\n" "https://$task_host/"
done
docker compose -f "$task_target/compose.yaml" ps
printf '\nReady for SSH forwarding: local 127.0.0.1:443 -> VPS 127.0.0.1:9443.\n'
