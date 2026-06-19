FROM node:20-alpine

WORKDIR /usr/src/app

# Copia dependências
COPY package*.json ./

# Instalação limpa (CI)
RUN npm ci

# Copia configurações TS e código fonte
COPY tsconfig.json ./
COPY src ./src

# Compila
RUN npm run build

# Expõe a porta interna
EXPOSE 3000

# Inicia
CMD ["npm", "start"]
