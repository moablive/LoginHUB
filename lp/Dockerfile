# syntax=docker/dockerfile:1.7
#
# LoginHUB — página de venda (home do hub). Autocontida: não faz parte dos workspaces npm do
# monorepo (package-lock e Dockerfile do hub não a enxergam) e não consome a API em build.
# Contexto: esta pasta (lp/).
FROM node:20-alpine AS build
WORKDIR /lp
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npx vite build

FROM nginx:alpine AS runtime
COPY --from=build /lp/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx.security-headers.conf /etc/nginx/security-headers.conf
EXPOSE 80
