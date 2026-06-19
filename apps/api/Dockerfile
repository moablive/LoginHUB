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
