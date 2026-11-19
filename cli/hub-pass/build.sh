#!/usr/bin/env bash
# Gera cli/hub-pass/dist/hub-pass.mjs: um arquivo só, roda com `node` (>= 20) em qualquer máquina.
# A cripto vem de apps/ui/src/features/cofre/cripto.ts (a MESMA da tela), com @noble embutido.
# As @noble ficam em cli/hub-pass/node_modules (ignorado pelo git): no host o node_modules do monorepo
# não as tem (moram no volume do container da ui).
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d node_modules/@noble/hashes ] || [ ! -d node_modules/@noble/ciphers ]; then
  npm install --no-save --no-package-lock --no-audit --no-fund --prefix . @noble/hashes@2.4.0 @noble/ciphers@2.4.0 @types/node@24.10.1 >/dev/null
fi
NODE_PATH="$PWD/node_modules" npx --yes -p typescript@5.9.3 tsc -p tsconfig.json
NODE_PATH="$PWD/node_modules" npx --yes esbuild@0.28.2 src/hub-pass.ts --bundle --platform=node --format=esm --target=node20 \
  --external:@loginhub/schema --outfile=dist/hub-pass.mjs --banner:js='#!/usr/bin/env node' --log-level=warning
chmod +x dist/hub-pass.mjs
echo "ok: $(pwd)/dist/hub-pass.mjs ($(wc -c < dist/hub-pass.mjs) bytes)"
