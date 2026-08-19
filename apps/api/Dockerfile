# =============================================================================
# Build de PRODUÇÃO da API (imagem compilada, `node dist/server.js`).
#
# NÃO é usado pelo docker-compose.yml da raiz — o stack padrão hoje roda com hot
# reload a partir do Dockerfile da raiz. Este arquivo fica como caminho de volta
# para uma imagem imutável, sem bind mount.
# =============================================================================
FROM node:20-alpine

WORKDIR /usr/src/app

# Copia arquivos base do monorepo
COPY package*.json ./
COPY packages ./packages
COPY apps/api ./apps/api

# Instala todas as dependências (resolvendo os pacotes locais)
RUN npm install

# Builda todos os workspaces necessários na ordem correta
RUN npm run build -w @loginhub/schema
RUN npm run build -w @loginhub/database
RUN npm run build -w @loginhub/services
RUN npm run build -w @loginhub/middlewares
RUN npm run build -w apps/api

# Define o workdir para a API
WORKDIR /usr/src/app/apps/api

EXPOSE 3000

CMD ["npm", "start"]
