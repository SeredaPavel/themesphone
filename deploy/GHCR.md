# ThemesPhone image publishing

Workflow: Build and publish ThemesPhone images (.github/workflows/images.yml).

Pushes to main, infra/docker-local and infra/ghcr-hosting build linux/amd64 images.
The workflow builds both images, checks startup with a disposable PostgreSQL database,
then publishes both images with the same full commit SHA:

- ghcr.io/seredapavel/themesphone/backend:<40-character SHA>
- ghcr.io/seredapavel/themesphone/frontend:<40-character SHA>

No latest tag is used. No SSH or VPS deployment step is present.
No additional repository secret is needed: publication uses GitHub's automatic GITHUB_TOKEN
with packages:write and contents:read. Package visibility and installation access are separate
from repository visibility; do not make images public merely to work around permission errors.

Public build URLs are https://cms.themesphone.ru for both frontend and Strapi admin.
Actual secrets are runtime settings only, excluded by .dockerignore. Local .env files,
user data, database dumps and uploads are neither read nor uploaded by the workflow.
The ci-only-* strings in smoke-images.sh are disposable test credentials, never VPS credentials.

Startup checks verify database readiness, Strapi /_health, frontend /auth/login, and internal
frontend-to-Strapi connectivity. They do not validate registration, OAuth, payment,
user content or full catalogue behavior. The catalogue and filters were checked manually
against the restored local data. The test database has no public catalogue permissions.

When either build or startup check fails, neither image is pushed. A registry failure during
push can leave one image uploaded; this workflow does not deploy anything in that case.
A future deploy must depend on success of the complete publishing job.

First run: commit these files and push the current infra/docker-local branch, then open
GitHub Actions and inspect the new workflow run. Image names appear in its job summary.
If publication is denied, inspect the package ownership and Actions access settings;
never paste tokens into chat.

Further work: protected Caddy access, VPS Compose with persistent data, restore on VPS,
restricted SSH deploy command, health checks and tested rollback strategy.
