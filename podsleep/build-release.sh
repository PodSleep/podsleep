#!/bin/bash
# Builds the PodSleep release bundle: podsleep/release/podsleep-<version>.zip (+ .tgz and SHA-256 sums).
# Run from the repo root or this folder. Needs Node (npm ci done in app/ and server/).
set -e
cd "$(dirname "$0")/.."
ROOT="$PWD"
VERSION="$(cat podsleep/VERSION)"
OUT="$ROOT/podsleep/release"
STAGE="$OUT/podsleep-$VERSION"
rm -rf "$OUT"; mkdir -p "$STAGE/server/dist/routes/boost"

# 1. The screens.
(cd app && VITE_ENV=prod npx vite build --emptyOutDir --outDir "$STAGE/public")
rm -f "$STAGE/public/mockServiceWorker.js"   # demo-only

# 2. The boost add-on, compiled the way Free Sleep's own server is.
node -e "
const ts = require('$ROOT/server/node_modules/typescript');
const fs = require('fs');
const src = fs.readFileSync('$ROOT/server/src/routes/boost/boost.ts', 'utf8');
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
fs.writeFileSync('$STAGE/server/dist/routes/boost/boost.js', out.outputText);
"

# 3. Scripts and docs.
cp podsleep/install.sh podsleep/uninstall.sh podsleep/install-from-computer.sh podsleep/install-from-windows.ps1 podsleep/VERSION "$STAGE/"
cp podsleep/INSTALL.txt "$STAGE/"
cp LICENSE.md "$STAGE/LICENSE.md"
chmod +x "$STAGE"/*.sh

# 4. Archives and checksums.
cd "$OUT"
zip -qr "podsleep-$VERSION.zip" "podsleep-$VERSION"
tar czf "podsleep-$VERSION.tgz" "podsleep-$VERSION"
sha256sum "podsleep-$VERSION.zip" "podsleep-$VERSION.tgz" > SHA256SUMS.txt
echo "Built $OUT/podsleep-$VERSION.zip"
cat SHA256SUMS.txt
