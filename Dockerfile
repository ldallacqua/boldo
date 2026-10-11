# syntax=docker/dockerfile:1

# 1) Compila o front-end (dist/) e o servidor (dist-server/).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# 2) Só as dependências que o servidor usa em produção (hono, web-push).
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# 3) Imagem final.
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3210 \
    DATA_DIR=/data \
    TZ=America/Sao_Paulo
WORKDIR /app
RUN mkdir /data && chown node:node /data
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY package.json ./
USER node
VOLUME /data
EXPOSE 3210
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" || exit 1
CMD ["node", "dist-server/index.js"]
