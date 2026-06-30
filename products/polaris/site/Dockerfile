# Multi-stage build for the Next.js standalone web surface.
# Build context is the repo root (compose sets `context: .`); all COPY paths
# below are repo-root-relative so the `workspace:*` handler dep resolves.
FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN npm install -g bun@1.2
# Copy workspace root metadata first for layer caching.
COPY package.json bun.lock ./
COPY products/polaris/handlers ./products/polaris/handlers
COPY products/polaris/site ./products/polaris/site
RUN bun install --production=false
RUN cd products/polaris/site && bun run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/products/polaris/site/.next/standalone ./
COPY --from=builder /app/products/polaris/site/.next/static ./products/polaris/site/.next/static
COPY --from=builder /app/products/polaris/site/public ./products/polaris/site/public
EXPOSE 3000
CMD ["node", "products/polaris/site/server.js"]
