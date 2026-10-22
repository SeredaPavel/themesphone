# ThemesPhone image publishing

Workflow: Build and publish ThemesPhone images (`.github/workflows/images.yml`).

Pushes to main, infra/docker-local and infra/ghcr-hosting build linux/amd64 images after
checking deployment scripts. Both images must pass disposable-PostgreSQL startup checks
before publishing with the same full commit SHA:

- ghcr.io/seredapavel/themesphone/backend:<40-character SHA>
- ghcr.io/seredapavel/themesphone/frontend:<40-character SHA>

No latest tag is used. Builds use GitHub's automatic GITHUB_TOKEN with packages:write,
not a user-provided registry token. Source/revision OCI labels associate packages with the repo.
Application secrets are runtime settings excluded by .dockerignore. Public build-time origin
is https://cms.themesphone.ru. The ci-only-* values are disposable test credentials.

Startup checks cover PostgreSQL readiness, Strapi health, frontend /auth/login and internal
connectivity. They do not cover the restored catalogue, full authentication or payment.
The catalogue/filters and admin were checked manually using restored data locally and on VPS.

Working branches never deploy. Main can deploy only after the complete image job succeeds;
see CICD.md for the restricted SSH setup, secrets, snapshots and rollback limits.
Registry failures can leave one image published, but a failed image job never triggers deploy.
