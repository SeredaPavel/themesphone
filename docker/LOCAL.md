# Local Docker production check

This configuration is for Windows/local testing only. VPS/GHCR deployment is a separate step.

The existing backend/.env and frontend/.env are used at runtime, excluded from image contexts and Git. No secrets are passed as build arguments. Keep their local backups.

Ports bound only to loopback:
- Frontend: http://localhost:3001
- Strapi/admin: http://localhost:1338/admin
- PostgreSQL: localhost:5433

The existing data_db directory and container_wallpaper_shop container are not mounted or managed by this project. The new database lives in the themesphone-local_postgres_data Docker volume. Media files use .local/uploads, which is ignored by Git.

Run commands from the repository root. Always include --env-file backend/.env; it supplies the DATABASE_* variables to Compose without changing existing files.

1. Validate without printing resolved secrets:

    docker compose --env-file backend/.env -f compose.local.yaml config --quiet

2. Build locally (only local builds; the future VPS configuration must pull GHCR images):

    docker compose --env-file backend/.env -f compose.local.yaml build

3. Start only db:

    docker compose --env-file backend/.env -f compose.local.yaml up -d --wait db

4. Before starting Strapi: restore the verified custom-format pg_dump into the NEW database, and copy the saved uploads to .local/uploads. Use docker compose cp and pg_restore --no-owner --no-privileges --exit-on-error. Do not use --clean or overwrite the original database. Exact restore commands depend on the local database username and backup filename.

5. Start applications after data restore:

    docker compose --env-file backend/.env -f compose.local.yaml up -d --wait backend frontend
    docker compose --env-file backend/.env -f compose.local.yaml ps

Stop without deleting database volumes:

    docker compose --env-file backend/.env -f compose.local.yaml down

Never run down -v if the database must be kept. Local runtime env files must not be printed using config without --quiet.

Frontend build uses standalone output only when DOCKER_BUILD=1, so normal native Windows builds can still use npm run start. NEXT_PUBLIC_STRAPI_URL and the admin backend URL are public build-time settings; rebuild images when changing these public addresses. STRAPI_API_URL is server-only and resolves to http://backend:1337 inside Docker.

These files do not complete authorization, checkout or download implementation. The mock payment endpoint, unrestricted download proxy and client-side API-token reference remain known blockers for unrestricted public exposure. Keep the local instance on loopback; prepare protected VPS access separately.

Validation in the preparation environment: diff checks and static configuration checks only. Docker builds, runtime health checks and data restore must be verified on the Windows Docker engine.
