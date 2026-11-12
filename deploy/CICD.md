# ThemesPhone deployment

Workflow: `.github/workflows/images.yml`.

- Working branches `dev` and `devcodex`: check frontend types and catalogue tests, validate scripts, build,
  check startup, publish SHA-tagged images; no deployment.
- Push to main: the same checks and publication, then restricted SSH deployment.
- Manual main run: deploy only if the `deploy` input is enabled.
- Pull requests targeting `main`, `dev` or `devcodex`: run the same checks and image startup tests,
  without GHCR login, image publication or deployment.
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
6. Check HTTPS with certificate verification using the configured `access-mode`:
   public routing or the private preview listener. Verify the expected API restrictions
   and GeoConverter/ProfitSite responses before declaring the release healthy.
7. On failure attempt to restore previous env/images and verify routes. Report failure even
   if image rollback succeeds. Keep the data snapshot for manual recovery.

This has short downtime for the snapshot and restart. These snapshots have no automatic
retention/deletion or off-server replication; a general backup policy remains separate work.
Previous image settings are also saved in `releases/`. After a different SHA has passed
all health/HTTPS checks, `previous.env` is atomically set to the release that was running
before the update. A failed deployment or redeploy of the same SHA preserves the existing
`previous.env`, so it continues to describe the previous stable release.

## Local image retention on the VPS

After a successful deploy, the installed script keeps the frontend/backend images for
the current and previous stable SHAs. It then removes older ThemesPhone images only.
Compose continues to replace the same application containers; the disk growth addressed
here is downloaded images from past releases.

Retention also preserves every image referenced by any container, including stopped
containers and containers belonging to other applications. An image must have the exact
ThemesPhone source/revision OCI labels and only recognised ThemesPhone SHA tags/digest
references to qualify. Mixed repository references and unrecognised metadata are preserved.
Owned untagged images can be removed if they are not current, previous or container-used.
The release metadata, references and ownership are checked again before each removal.

Removal uses exact image IDs with `docker image rm --no-prune`, without force, global
prune, container removal or volume operations. GeoConverter, ProfitSite, PostgreSQL, Caddy,
uploads, database data and release snapshots are outside this policy. Registry packages
in GHCR are not deleted. A retention error reports a warning and keeps the verified release
running; it never triggers application rollback. Missing/invalid rollback metadata skips
cleanup until a subsequent distinct successful deploy establishes a valid previous release.

To activate this change, install the reviewed `deploy-themesphone.sh` separately as
`/usr/local/sbin/deploy-themesphone`: read/back up the existing script, take the existing
ThemesPhone deploy lock, validate with `bash -n`, and replace only that file atomically.
No Compose, Caddy, environment or SSH-key update is needed. Run the normal `check` command
after installation; it is read-only and does not perform retention. The next successful
deploy performs rotation. An application push alone does not update the server script.

## Recovery limits

Restoring previous images does NOT reverse Strapi schema changes. The script never
silently replaces the database or uploads: that could erase writes made after the snapshot.
If old images cannot work with the new schema, the deploy reports ROLLBACK FAILED and
requires manual database/media recovery from the snapshot. Stop applications before recovery.
The original migration dump was restore-tested; new snapshots are checked for readable TOC,
not fully restored automatically on the resource-limited VPS.

Tests simulate Docker/HTTP to exercise rejected commands, locks, preflight/pull/label failures,
backup failures, successful snapshots, image/HTTP failures, rollback failure and preservation
of other SSH keys. They also cover previous-stable metadata, same-SHA redeploys, retention
failure, other repositories, mixed tags/digests, untagged images and stopped/concurrently
created containers. These fixtures do not replace verification of the installed VPS script.

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

## Public access

See [PUBLIC.md](PUBLIC.md) for the preserved baseline and every temporary restriction.
The installed deployment checker supports `access-mode`: absent/`preview` checks the
private listener and public 503; `public` checks the normal HTTPS listener, public
API restrictions, Strapi health and the other two sites. Publication switches this
file automatically. Future main pushes use public checks without the preview container.

Before publication install the updated `deploy-themesphone.sh` separately (back up
the installed file first), then deploy the checked release in preview mode. Run
`publish-public.sh` with the Caddy snippet beside it. It validates a candidate,
backs up the live Caddyfile and mode, replaces only the ThemesPhone placeholder,
checks HTTPS, removes the preview container/alias, then checks HTTPS again. Failure
restores the placeholder/mode and, if stopped, restarts the preview. It does not
change application data. Inspect stderr if a restoration command itself fails.

Public deployment requires the frontend image label
`org.themesphone.public-proxy-ready=1`; this marks the updated frontend baseline,
not application-level enforcement. Caddy supplies the restrictions. Do not expose
container ports or route another public hostname directly to the apps.
