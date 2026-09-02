# =============================================================================
# Build de PRODUÇÃO da UI — bundle estático servido por nginx.
#
# POR QUE ELE VOLTOU A IMPORTAR
#
# O docker-compose.yml da raiz sobe a UI com `vite dev` atrás do túnel
# Cloudflare. O dev server injeta `/@vite/client` (179 kB) em toda página, e
# esse cliente tem um comportamento que é correto no laptop e destrutivo no
# celular: quando o WebSocket de HMR cai, ele fica pingando o servidor e chama
# `location.reload()` assim que ele responde.
#
# No celular o WebSocket cai o tempo todo — tela bloqueia, o app vai para
# segundo plano, o aparelho troca de Wi-Fi para 4G. O resultado é a página
# recarregando sozinha no meio do preenchimento: o convite pela metade some, a
# modal fecha, o QR de 2FA é descartado. É o "cliquei num campo e fechou".
#
# Servindo o bundle estático não existe WebSocket, não existe reload
# espontâneo, o React não roda em modo de desenvolvimento (sem efeito duplo do
# StrictMode) e o celular baixa ~260 kB comprimidos em vez de ~4,4 MB
# espalhados em 60+ requisições pelo túnel.
#
# Uso (o compose padrão continua sendo o de hot reload):
#
#     docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build login-hub-ui
# =============================================================================

# ===================================
# ESTÁGIO 1: BUILD (Node.js)
# ===================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copia arquivos base do monorepo
COPY package*.json ./
COPY packages ./packages
COPY apps/ui ./apps/ui

# Instala todas as dependências do monorepo
RUN npm install

# --- INJEÇÃO DE VARIÁVEIS (VITE) ---
#
# Chegam como build args, NUNCA por `COPY .env`.
#
# O `.env` está no .dockerignore de propósito: copiá-lo faria o arquivo virar
# uma camada da imagem — `docker history` devolve o conteúdo, e ali dentro
# estão DB_PASSWORD, JWT_SECRET, MASTER_API_KEY e as credenciais de SMTP. Só o
# punhado de variáveis abaixo é necessário para o bundle, e todas elas já são
# públicas por natureza: o prefixo VITE_ significa exatamente "isto vai para
# dentro do JavaScript que o navegador baixa".
#
# Pelo mesmo motivo não existe mais `ARG VITE_MASTER_KEY` aqui. Ele era o
# vazamento corrigido em 29/08/2026 — a chave mestra ia inteira para o bundle,
# legível por qualquer visitante. O código já não a lê; o ARG ficou para trás e
# teria reintroduzido o problema em quem usasse este Dockerfile.
ARG VITE_API_URL
ARG VITE_SUL_ALIMENTOS_API_URL
ARG VITE_ASTRALWAVE_API_URL
ARG VITE_APP_VERSION
ARG VITE_APP_BUILD_DATE
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SUL_ALIMENTOS_API_URL=$VITE_SUL_ALIMENTOS_API_URL
ENV VITE_ASTRALWAVE_API_URL=$VITE_ASTRALWAVE_API_URL
ENV VITE_APP_VERSION=$VITE_APP_VERSION
ENV VITE_APP_BUILD_DATE=$VITE_APP_BUILD_DATE

# Builda as dependências locais na ordem correta
RUN npm run build -w @loginhub/schema
RUN npm run build -w @loginhub/api-client

# Gera o build da web
RUN npm run build -w ui

# ===================================
# ESTÁGIO 2: SERVIDOR (Nginx)
# ===================================
FROM nginx:alpine

# Remove as configurações padrão do Nginx
RUN rm -rf /etc/nginx/conf.d/*

# Configuração do Nginx: SPA (React Router) + proxy /api para o backend.
COPY apps/ui/nginx.conf /etc/nginx/conf.d/default.conf

# Copia apenas os arquivos estáticos gerados no app web
COPY --from=builder /app/apps/ui/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
