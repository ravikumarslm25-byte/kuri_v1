# Kuri — one image: API + admin panel (/admin) + kiosk app (/).
# Build:  docker build -t kuri .        Run: see docker-compose.yml

# 1) Build the two web apps
FROM node:22-alpine AS web
WORKDIR /build
COPY kiosk/package.json kiosk/package-lock.json kiosk/
RUN npm --prefix kiosk ci --no-audit --no-fund
COPY admin/package.json admin/package-lock.json admin/
RUN npm --prefix admin ci --no-audit --no-fund
COPY kiosk kiosk
COPY admin admin
RUN npm --prefix kiosk run build && npm --prefix admin run build

# 2) Runtime: the server, which also serves both builds
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=5010 \
    UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN npm --prefix server ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server/src server/src
COPY --from=web /build/kiosk/dist kiosk/dist
COPY --from=web /build/admin/dist admin/dist
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
WORKDIR /app/server
EXPOSE 5010
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5010/api/health || exit 1
CMD ["node", "src/index.js"]
