#!/usr/bin/env bash
# Gera cli/hub-pass/dist/hub-pass.mjs: um arquivo só, roda com `node` (>= 20) em qualquer máquina.
# A cripto vem de apps/ui/src/features/cofre/cripto.ts (a MESMA da tela), com @noble embutido.
set -euo pipefail
cd "$(dirname "$0")"
npx --yes -p typescript@5.9.3 tsc -p tsconfig.json
npx --yes esbuild@0.28.2 src/hub-pass.ts --bundle --platform=node --format=esm --target=node20 \
  --external:@loginhub/schema --outfile=dist/hub-pass.mjs --banner:js='#!/usr/bin/env node' --log-level=warning
chmod +x dist/hub-pass.mjs
echo "ok: $(pwd)/dist/hub-pass.mjs ($(wc -c < dist/hub-pass.mjs) bytes)"
