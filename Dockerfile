# Banca Victoria — imagen para Render / Docker
FROM node:22-bookworm-slim

WORKDIR /app

# Dependencias básicas del sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Instalar las dependencias fijadas por package-lock.json
COPY package.json package-lock.json ./
RUN npm ci

# Instalar Playwright fuera del proyecto para evitar modificar
# el árbol de dependencias y package-lock.json de la aplicación.
RUN mkdir -p /opt/playwright \
    && cd /opt/playwright \
    && npm init -y \
    && npm install --no-audit --no-fund playwright@1.64.1 \
    && npx playwright install --with-deps chromium \
    && ln -s /opt/playwright/node_modules/playwright /app/node_modules/playwright

# Código fuente
COPY . .

# Build frontend + bundle del backend
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# db:push + seed + servidor (el start del package.json)
CMD ["npm", "start"]
