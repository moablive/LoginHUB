# ===================================
# ESTÁGIO 1: BUILD (Node.js)
# ===================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copia dependências e instala
COPY package*.json ./
# Usamos 'npm install' pois seu package.json é recente
RUN npm install

# Copia todo o código fonte
COPY . .

# --- INJEÇÃO DE VARIÁVEIS (VITE) ---
# O Vite precisa dessas variáveis NA HORA DO BUILD para substituir no código
ARG VITE_API_URL
ARG VITE_MASTER_KEY

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_MASTER_KEY=$VITE_MASTER_KEY

# Gera a pasta /dist
RUN npm run build

# ===================================
# ESTÁGIO 2: SERVIDOR (Nginx)
# ===================================
FROM nginx:alpine

# Remove configurações padrão do Nginx
RUN rm -rf /etc/nginx/conf.d/*

# Cria configuração Inline do Nginx para suportar SPA (React Router)
# Isso redireciona qualquer rota (ex: /login) para o index.html
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

# Copia apenas os arquivos estáticos gerados no estágio anterior
COPY --from=builder /app/dist /usr/share/nginx/html

# Expõe porta 80 interna
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
