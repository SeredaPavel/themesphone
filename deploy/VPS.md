# ThemesPhone VPS staging

This Compose file pulls images only. It has no build definitions or published host ports.
It is a first-run staging configuration, not a complete automated deployment system.
The Caddy placeholder must remain until restricted public access is configured.

Install as /opt/hosting/themesphone/compose.yaml, beside:
- .env: private copy of backend/.env, with IMAGE_TAG=<40-character commit SHA> appended.
- frontend.env: private copy of frontend/.env (includes the existing runtime API token).

Both environment files must stay out of Git and be mode 600 under a mode 700 directory.
Never print docker compose config without --quiet, or docker inspect .Config.Env.
The service environment overrides local database hosts and public addresses. Initial
migration preserves the existing application salts, keys and API token from local settings;
changing them during this step can invalidate restored API tokens or sessions.

Persistent bind paths (must exist before Compose starts):
- /opt/hosting-data/themesphone/postgres
- /opt/hosting-data/themesphone/uploads (owned by UID/GID 1000:1000 for the Node runner)

Restore the verified database dump into themesphone-db BEFORE starting Strapi.
Extract uploads from the matching saved backup, then set upload ownership.
Use pg_restore --no-owner --no-privileges --exit-on-error. No --clean against existing data.
A database health check does not verify that the expected catalogue was restored.
Compare wallpapers/categories/users/files counts (18/14/1/9 for the verified original dump).

Networking:
- database: private Docker network, only PostgreSQL and Strapi attached.
- hosting_themesphone_edge: existing external network shared with Caddy.
- Caddy upstreams: themesphone-backend:1337 and themesphone-frontend:3000.
- Next.js retains /api routes; Strapi has public origin https://cms.themesphone.ru.

Memory caps: PostgreSQL 256 MiB, Strapi 640 MiB (V8 old-space 384), Next.js 256 MiB
(V8 old-space 192). These are ceilings, not reservations or guaranteed working-set sizes.
Validate actual startup, OOM state and memory on the VPS. Logs rotate at 3 x 10 MiB per service.
The PostgreSQL image matches the tested local major/minor for this first migration;
base image and application upgrades are separate work.

Do not treat a future image rollback as a database rollback. Strapi startup can change
schema, and uploads/database need separate recovery procedures. The initial dump was
restore-tested locally. Future deployment automation and rollback checks are still pending.

Public exposure is a separate step. Authorization, mock payment and download handling
are incomplete; no Caddy public routing or SSH Actions key is installed by this file.

Deployment automation is described in CICD.md. Installed server scripts must be updated
explicitly; pushing application code changes only the selected image SHA.
