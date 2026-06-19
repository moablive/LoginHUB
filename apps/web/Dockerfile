# ===================================
# ESTÁGIO 1: BUILD (Node.js)
# ===================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copia arquivos base do monorepo
COPY package*.json ./
COPY packages ./packages
COPY apps/web ./apps/web

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
RUN npm run build -w apps/web

# ===================================
# ESTÁGIO 2: SERVIDOR (Nginx)
# ===================================
FROM nginx:alpine

# Remove configurações padrão do Nginx
RUN rm -rf /etc/nginx/conf.d/*

# Cria configuração Inline do Nginx para suportar SPA (React Router)
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    gzip on; \
    gzip_types text/plain text/css application/json application/javascript; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location ~* \.(?:ico|css|js|gif|jpe?g|png|woff2?|eot|ttf|svg)$ { \
        expires 1y; \
        access_log off; \
        add_header Cache-Control "public"; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Copia apenas os arquivos estáticos gerados no app web
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Expõe porta 80 interna
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
