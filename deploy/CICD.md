# ThemesPhone deployment to the private VPS preview

Workflow: `.github/workflows/images.yml`.

- Working branches `infra/docker-local` and `infra/ghcr-hosting`: validate scripts, build,
  check startup, publish SHA-tagged images; no deployment.
- Push to main: the same checks and publication, then restricted SSH deployment.
- Manual main run: deploy only if the `deploy` input is enabled.
- Deployment uses the installed server script, never an unrestricted root shell or uploaded code.

Images: `ghcr.io/seredapavel/themesphone/{backend,frontend}:<full SHA>`.
The VPS only downloads images. Base-image/Compose/script changes require a separate reviewed
server installation; application pushes do not automatically install new deployment scripts.

## Setup

Copy `compose.yaml`, `deploy-themesphone.sh` and `install-actions-key.sh` into a private
server setup folder (for example `/root/themesphone-deploy-setup`). Create a dedicated
Ed25519 pair `/root/.ssh/themesphone_actions` without overwriting existing keys.
Run `bash install-actions-key.sh /root/.ssh/themesphone_actions.pub` as root.
The installer backs up configuration, aligns IMAGE_TAG with both running images, installs
`/usr/local/sbin/deploy-themesphone`, and adds ONLY that key to authorized_keys with
`restrict,command=...`. Other administration/GeoConverter/ProfitSite keys are preserved.
Containers are not restarted by installation. Test the actual SSH command `check`.

Create repository Actions secrets:

- THEMESPHONE_VPS_HOST: server address.
- THEMESPHONE_VPS_SSH_KEY: the complete dedicated private key, entered directly in GitHub.
- THEMESPHONE_VPS_KNOWN_HOSTS: verified SSH host-key entries, never an unverified keyscan.

Do not put private keys, env files, tokens or data backups in Git or chat. Validate builds
and setup on the working branch before merging into main. First push to main deploys.

## Update sequence

1. Reject every SSH command except exact `check` or `deploy <40 lowercase hex characters>`.
2. Lock concurrent updates, check current HTTPS preview and existing sites.
3. Validate candidate settings and download both application images before stopping anything.
   Verify each OCI revision label matches the requested SHA. PostgreSQL is not updated.
4. Stop frontend and backend writes. Save current env files and Compose, a PostgreSQL custom
   dump, uploads archive, and SHA256SUMS under `/opt/hosting/backups/themesphone/releases/`.
   Read the dump TOC. Resume previous apps if snapshot creation fails.
5. Atomically select the new IMAGE_TAG, start apps without builds or pulls, wait for health.
6. Check HTTPS through 127.0.0.1:9443 with certificate verification; also assert public
   ThemesPhone endpoints still return 503 and GeoConverter/ProfitSite return 200.
7. On failure attempt to restore previous env/images and verify routes. Report failure even
   if image rollback succeeds. Keep the data snapshot for manual recovery.

This has short downtime for the snapshot and restart. These snapshots have no automatic
retention/deletion or off-server replication; a general backup policy remains separate work.
Previous image settings are also saved as `previous.env` and in `releases/`.

## Recovery limits

Restoring previous images does NOT reverse Strapi schema changes. The script never
silently replaces the database or uploads: that could erase writes made after the snapshot.
If old images cannot work with the new schema, the deploy reports ROLLBACK FAILED and
requires manual database/media recovery from the snapshot. Stop applications before recovery.
The original migration dump was restore-tested; new snapshots are checked for readable TOC,
not fully restored automatically on the resource-limited VPS.

Tests simulate Docker/HTTP to exercise rejected commands, locks, preflight/pull/label failures,
backup failures, successful snapshots, image/HTTP failures, rollback failure and preservation
of other SSH keys. Actual Actions SSH/deployment and VPS rollback still need real verification.

## Private preview

SSH forwards Windows 127.0.0.1:443 to VPS 127.0.0.1:9443. Windows hosts maps the four site
names and cms.themesphone.ru to 127.0.0.1. The preview Caddy also provides the internal
cms.themesphone.ru Docker DNS alias. Keep preview running for deployment HTTPS checks.
When changing networks reconnect the tunnel; the GitHub deploy itself needs no client tunnel.
Preview TLS uses the five certificate directories managed by edge Caddy. After certificate
renewal, restart only the preview Caddy to reload static certificates if needed. Public routing
is still a placeholder. Before a future public launch, update the deployment route checks,
remove the internal preview alias/container when appropriate, and remove the marked Windows
hosts block (preserve other hosts entries). Do not open the known unfinished endpoints first.
