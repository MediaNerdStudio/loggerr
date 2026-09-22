# syntax=docker/dockerfile:1
FROM node:24-slim AS builder
WORKDIR /app
COPY package*.json ./
COPY ui/package*.json ./ui/
RUN npm ci && npm --prefix ui ci
COPY ui ./ui
RUN npm run build

FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg tini ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data MEDIA_DIR=/app/media
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY --from=builder /app/ui/dist ./ui/dist
RUN mkdir -p /app/data /app/media && chown -R node:node /app
USER node
VOLUME ["/app/data", "/app/media"]
EXPOSE 3000 9090 9100-9199
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/index.js"]
