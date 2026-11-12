FROM node:24-bookworm-slim AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app ./app
COPY lib ./lib
COPY public ./public
COPY selfhost ./selfhost
COPY scripts/build-selfhost.mjs ./scripts/build-selfhost.mjs
RUN node scripts/build-selfhost.mjs
FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
WORKDIR /app
COPY --from=build /build/selfhost-build ./selfhost-build
COPY selfhost/*.mjs ./selfhost/
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "selfhost/server.mjs"]
