# =============================================================================
# Imagem base de desenvolvimento do monorepo LoginHUB.
#
# Uma única imagem serve os três serviços do docker-compose.yml
# (packages / api / ui). Ela carrega apenas as dependências instaladas: o
# código-fonte vem do host por bind mount, e é isso que permite o hot reload.
# =============================================================================
FROM node:20-alpine AS base

# Alguns binários nativos (esbuild/rollup) esperam a camada de compatibilidade.
RUN apk add --no-cache libc6-compat

WORKDIR /app

# O código completo entra na imagem só para o `npm install` resolver os
# workspaces locais (`@loginhub/*` são links). Em runtime tudo isso é coberto
# pelo bind mount `.:/app`.
COPY . .

# O package-lock.json é gerado no host (glibc/Manjaro) e não contém o binário
# nativo do rollup para Alpine/musl (@rollup/rollup-linux-x64-musl). Removê-lo
# força o npm a resolver as optionalDependencies da plataforma do container —
# sem isso o vite morre no boot. Ref: npm/cli#4828.
RUN rm -f package-lock.json && npm install

# 3000 = API (express) | 80 = UI (vite dev server, mesma porta que o nginx
# usava, para não mexer na rota do túnel Cloudflare).
EXPOSE 80 3000

# Sobrescrito por `command:` em cada serviço do compose.
CMD ["npm", "run", "dev"]
