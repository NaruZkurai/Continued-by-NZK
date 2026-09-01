#!/usr/bin/env bash
# =============================================================================
# continue (naruzkurai fork) — VS Code extension build script
#
# Mirrors the official CI sequence in:
#   .github/actions/build-vscode-extension/action.yml
#
# Produces a packaged .vsix in extensions/vscode/ plus build artifacts in
# extensions/vscode/build.
#
# Usage:
#   ./build.sh                 # build for the current platform/arch (linux-x64)
#   TARGET=win32-x64 ./build.sh
#   ./build.sh darwin-arm64
#
# Environment:
#   TARGET   <platform>-<arch>   target override (default: auto-detect)
#   NODE_OPTIONS                 passed through to GUI build (default 4GB heap)
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

log()  { printf '\033[1;34m[build]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[build:error]\033[0m %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

# -----------------------------------------------------------------------------
# 0. Node version guard — repo pins v20.20.1 (.nvmrc). The build breaks on
#    newer major versions, so refuse unless the right major is active.
# -----------------------------------------------------------------------------
REQUIRED_NODE_MAJOR="20"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo "none")"
if [ "$NODE_MAJOR" != "$REQUIRED_NODE_MAJOR" ]; then
  die "Node v${REQUIRED_NODE_MAJOR} is required (.nvmrc = v20.20.1), but node v${NODE_MAJOR} is active. Use: nvm use"
fi
log "node $(node -v) OK (repo pins v20.20.1)"

# -----------------------------------------------------------------------------
# 1. Target platform / arch (defaults: linux-x64)
# -----------------------------------------------------------------------------
TARGET="${TARGET:-${1:-}}"
if [ -z "$TARGET" ]; then
  PLATFORM="${PLATFORM:-$(node -p 'process.platform' 2>/dev/null || echo linux)}"
  ARCH="${ARCH:-$(node -p 'process.arch === "x64" ? "x64" : process.arch' 2>/dev/null || echo x64)}"
  TARGET="${PLATFORM}-${ARCH}"
fi
log "target: ${TARGET}"
export CONTINUE_VSCODE_TARGET="$TARGET"

NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
export NODE_OPTIONS

# -----------------------------------------------------------------------------
# 2. Install workspace packages (naruzkurai-adapters, config-types, fetch, ...)
# -----------------------------------------------------------------------------
log "building workspace packages ..."
node ./scripts/build-packages.js

# -----------------------------------------------------------------------------
# 3. Install dependencies for each workspace
# -----------------------------------------------------------------------------
log "installing core deps ..."
( cd core && npm ci && npm i vectordb )

log "installing gui deps ..."
( cd gui && npm ci )

log "installing vscode extension deps ..."
( cd extensions/vscode && npm ci )

# -----------------------------------------------------------------------------
# 4. Build the GUI
# -----------------------------------------------------------------------------
log "building gui ..."
( cd gui && npm run build )

# -----------------------------------------------------------------------------
# 5. Prepackage the extension (native deps, ripgrep, etc.)
# -----------------------------------------------------------------------------
log "prepackaging extension (${TARGET}) ..."
( cd extensions/vscode && npm run prepackage -- --target "$TARGET" )

log "re-installing esbuild for target ..."
( cd extensions/vscode && npm install -f esbuild )

# -----------------------------------------------------------------------------
# 6. Build the extension bundle + .vsix
# -----------------------------------------------------------------------------
log "packaging extension (${TARGET}) ..."
( cd extensions/vscode && npm run package -- --target "$TARGET" )

log "creating .vsix ..."
( cd extensions/vscode && npx vsce package --no-dependencies --target "$TARGET" )

echo
log "done."
echo "  artifacts:  extensions/vscode/build"
echo "  vsix:       extensions/vscode/$(ls -1 extensions/vscode/*.vsix 2>/dev/null | xargs -n1 basename | head -1)"
