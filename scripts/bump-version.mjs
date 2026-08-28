#!/usr/bin/env node

/**
 * Incrementa a versao de build do LoginHUB e propaga para o ambiente Docker.
 *
 * A versao vive no arquivo `VERSION` (fonte da verdade, versionado no git) e e
 * espelhada no `.env` como APP_VERSION, de onde o docker-compose a injeta nos
 * containers:
 *   - login-hub-api -> APP_VERSION       (health check publico em GET /api)
 *   - login-hub-ui  -> VITE_APP_VERSION  (badge no canto + aviso de update)
 *
 * O `.env` e o unico arquivo de ambiente do hub (nao ha `.env.docker`): tanto o
 * `env_file:` dos servicos quanto o `envDir` do vite apontam para ele.
 *
 * Uso:
 *   node scripts/bump-version.mjs           # 1.0.0 -> 1.0.1  (patch, padrao)
 *   node scripts/bump-version.mjs --minor   # 1.0.9 -> 1.1.0
 *   node scripts/bump-version.mjs --major   # 1.1.4 -> 2.0.0
 *   node scripts/bump-version.mjs --set 2.5.0
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const versionFile = resolve(root, 'VERSION');
const envFiles = ['.env'].map((f) => resolve(root, f));

const args = process.argv.slice(2);
const setIdx = args.indexOf('--set');
const current = existsSync(versionFile) ? readFileSync(versionFile, 'utf8').trim() : '0.0.0';

const parse = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new Error(`Versao invalida em VERSION: "${v}" (esperado MAJOR.MINOR.PATCH)`);
  return m.slice(1).map(Number);
};

let next;
if (setIdx !== -1) {
  next = args[setIdx + 1];
  parse(next); // valida
} else {
  const [major, minor, patch] = parse(current);
  if (args.includes('--major')) next = `${major + 1}.0.0`;
  else if (args.includes('--minor')) next = `${major}.${minor + 1}.0`;
  else next = `${major}.${minor}.${patch + 1}`;
}

const buildDate = new Date().toISOString();
writeFileSync(versionFile, `${next}\n`);

// Espelha no .env. Reescreve a chave se ja existir, senao anexa o bloco.
for (const file of envFiles) {
  if (!existsSync(file)) {
    console.warn(`⚠️  ${file} nao existe — pulei. O container vai cair no APP_VERSION=0.0.0.`);
    continue;
  }
  let content = readFileSync(file, 'utf8');

  const upsert = (key, value) => {
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(content)) content = content.replace(re, `${key}=${value}`);
    else content = `${content.replace(/\n*$/, '\n')}${key}=${value}\n`;
  };

  if (!/# 🏷️ VERSAO DO BUILD/.test(content)) {
    content = `${content.replace(/\n*$/, '\n')}
# ==========================================
# 🏷️ VERSAO DO BUILD (gerado por scripts/bump-version.mjs — nao editar a mao)
# ==========================================
`;
  }
  upsert('APP_VERSION', next);
  upsert('APP_BUILD_DATE', buildDate);
  writeFileSync(file, content);
}

console.log(`🏷️  v${current} → v${next}  (build ${buildDate})`);
