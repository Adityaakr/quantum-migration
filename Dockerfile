# Build the Lattice frontend (Vite SPA in app/) and serve it statically.
FROM node:20-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
# Copy the whole repo: the app aliases the SDK to ../src at build time.
COPY . .
# Root deps (ethers, @noble/*) so the aliased ../src files resolve their imports.
RUN pnpm install --no-frozen-lockfile
WORKDIR /repo/app
RUN pnpm install --no-frozen-lockfile
RUN pnpm build

FROM node:20-slim AS run
WORKDIR /app
COPY --from=build /repo/app/dist ./dist
COPY --from=build /repo/app/serve.mjs ./serve.mjs
ENV PORT=8080
EXPOSE 8080
CMD ["node", "serve.mjs"]
