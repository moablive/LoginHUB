# ===================================
# ESTÁGIO 1: BUILD (Node.js)
# ===================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copia arquivos base do monorepo
COPY package*.json ./
COPY .env ./
COPY packages ./packages
COPY apps/ui ./apps/ui

# Instala todas as dependências do monorepo
RUN npm install

# --- INJEÇÃO DE VARIÁVEIS (VITE) ---
ARG VITE_API_URL
ARG VITE_MASTER_KEY

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_MASTER_KEY=$VITE_MASTER_KEY

# Builda as dependências locais na ordem correta
RUN npm run build -w @loginhub/schema
RUN npm run build -w @loginhub/api-client

# Gera o build da web
RUN npm run build -w ui

# ===================================
# ESTÁGIO 2: SERVIDOR (Nginx)
# ===================================
FROM nginx:alpine

# Remove configurações padrão do Nginx
RUN rm -rf /etc/nginx/conf.d/*

# Configuração do Nginx: SPA (React Router) + proxy /api para o backend.
# Era um `echo` inline; virou arquivo para poder ser auditado sem escapar shell.
COPY apps/ui/nginx.conf /etc/nginx/conf.d/default.conf

# Copia apenas os arquivos estáticos gerados no app web
COPY --from=builder /app/apps/ui/dist /usr/share/nginx/html

# Expõe porta 80 interna
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
