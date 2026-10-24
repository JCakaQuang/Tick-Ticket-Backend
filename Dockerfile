FROM node:22-bookworm-slim AS build
WORKDIR /app/backend
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=4000
WORKDIR /app/backend
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/backend/dist ./dist
COPY scripts ./scripts
RUN mkdir -p /app/exports && chown node:node /app/exports
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
