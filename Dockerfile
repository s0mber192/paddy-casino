# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_API_URL="/"
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM node:20-bookworm-slim AS backend
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build
RUN npm prune --omit=dev

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 NODE_ENV=production HOME=/root TZ=Europe/Moscow HOST=0.0.0.0 PORT=3000 GIFT_SERVICE_URL=http://127.0.0.1:8000 DATA_DIR=/data DB_PATH=/data/casino.db GIFT_APP=main:app BACKEND_ENTRY=dist/index.js

RUN apt-get update && apt-get install -y --no-install-recommends supervisor ca-certificates \
    && rm -rf /var/lib/apt/lists/* && mkdir -p /data

COPY --from=backend /usr/local/bin/node /usr/local/bin/node
WORKDIR /app

COPY gift-service/requirements.txt gift-service/requirements.txt
RUN pip install -r gift-service/requirements.txt
COPY gift-service/ gift-service/
RUN cd gift-service && python -c "from TelegramGifts import TelegramGifts; TelegramGifts()" || echo "WARN"

COPY --from=backend /build/backend/dist backend/dist
COPY --from=backend /build/backend/node_modules backend/node_modules
COPY --from=backend /build/backend/package.json backend/package.json
COPY --from=frontend /build/frontend/dist frontend/dist

COPY supervisord.conf /etc/supervisord.conf
VOLUME ["/data"]
EXPOSE 3000
CMD ["supervisord", "-n", "-c", "/etc/supervisord.conf"]