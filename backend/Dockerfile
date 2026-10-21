FROM node:22-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV STRAPI_TELEMETRY_DISABLED=true
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG STRAPI_ADMIN_BACKEND_URL=http://localhost:1338
ENV STRAPI_ADMIN_BACKEND_URL=$STRAPI_ADMIN_BACKEND_URL
ENV NODE_ENV=production
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production STRAPI_TELEMETRY_DISABLED=true HOST=0.0.0.0 PORT=1337
COPY --from=builder --chown=node:node /app ./
USER node
EXPOSE 1337
CMD ["npm", "run", "start"]
