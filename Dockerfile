FROM node:24.22.2-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS web
WORKDIR /source
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY shared ./shared
COPY web ./web
COPY tsconfig.json ./
ARG VITE_ONION_URL=""
ENV VITE_ONION_URL=$VITE_ONION_URL
ARG VITE_I2P_URL=""
ENV VITE_I2P_URL=$VITE_I2P_URL
RUN pnpm build

FROM rust:1.99.1-bookworm@sha256:c9155318d07341301a78b45ecdd81af2e43b8b297d64e8fd4c5e80d7735607c3 AS server
WORKDIR /source/server
COPY server ./
RUN cargo build --release --locked

FROM debian:bookworm-slim@sha256:99c0b25c46d0214d5a2091092e7908907dcaecd6a962cde0ac700acee222b6f3
WORKDIR /app
COPY --from=server /source/server/target/release/erase-server /app/erase-server
COPY --from=web /source/web/dist /app/web
COPY LICENSE THIRD_PARTY.md /app/
COPY docs/licenses /app/docs/licenses
ENV BIND=0.0.0.0:3001 STATIC_DIR=/app/web
USER 10001:10001
EXPOSE 3001
ENTRYPOINT ["/app/erase-server"]
