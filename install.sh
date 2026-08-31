#!/usr/bin/env bash
# =============================================================================
# install.sh — build the current source (installed toolchain, NO postinstall
# scripts) and install it into VS Code automatically.
#
# Purpose: you shouldn't need to remember build steps. Just run this.
#
#   ./install.sh                     # build + install (default, all-in-one)
#   ./install.sh --bundle-only       # skip rebuild, just reinstall current bundle
#   VSIX=/path/x.vsix ./install.sh   # install a prebuilt .vsix instead
#
# Security: npm 12 blocks install/postinstall scripts by default. This script
# NEVER approves or runs them. esbuild's native binary ships as an optional
# dependency, so the bundle builds fine without running any install script.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# The installed Continue extension dir (VS Code loads packed extensions here).
EXT_DIR="${HOME}/.vscode/extensions/continue.continue-2.0.0-linux-x64"
MAIN_BUNDLE="${EXT_DIR}/out/extension.js"
BUILD_BUNDLE="${ROOT}/extensions/vscode/out/extension.js"

log() { printf '\033[1;34m[install]\033[0m %s\n' "$*"; }
ok()  { printf '\033[1;32m[install]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[install:error]\033[0m %s\n' "$*" >&2; }
die() { err "$*"; exit 1; }

MODE="${1:-}"

# -----------------------------------------------------------------------------
# 0. Environment checks (installed versions only, no new toolchain)
# -----------------------------------------------------------------------------
command -v node  >/dev/null 2>&1 || die "node not found on PATH."
command -v npm   >/dev/null 2>&1 || die "npm not found on PATH."
command -v code  >/dev/null 2>&1 || die "the 'code' CLI not found (launch VS Code once)."

# -----------------------------------------------------------------------------
# Prebuilt .vsix path
# -----------------------------------------------------------------------------
if [ -n "${VSIX:-}" ]; then
  log "installing prebuilt vsix: ${VSIX}"
  code --install-extension "$VSIX" --force
  ok "installed ${VSIX}. Reload VS Code to activate."
  exit 0
fi

# -----------------------------------------------------------------------------
# 1. Build workspace packages (openai-adapters, config-types, fetch, ...)
#    -- uses installed Node; no postinstall scripts run.
# -----------------------------------------------------------------------------
if [ "$MODE" != "--bundle-only" ]; then
  log "building workspace packages ..."
  node ./scripts/build-packages.js

  log "building extension bundle (esbuild, minified) ..."
  mkdir -p extensions/vscode/build
  ( cd extensions/vscode && node scripts/esbuild.js --minify ) \
    || die "esbuild bundle failed."
fi

[ -f "$BUILD_BUNDLE" ] || die "no bundle at ${BUILD_BUNDLE} — run ./install.sh (build) first."

# -----------------------------------------------------------------------------
# 2. Sanity: the built bundle must contain the naruzkurai provider
# -----------------------------------------------------------------------------
if ! grep -q "naruzkurai" "$BUILD_BUNDLE"; then
  die "built bundle has no 'naruzkurai' provider. Did the source get built?"
fi
ok "bundle contains naruzkurai provider ($(grep -c "naruzkurai" "$BUILD_BUNDLE") hits)."

# -----------------------------------------------------------------------------
# 3. Install: replace the live extension's main bundle
# -----------------------------------------------------------------------------
if [ ! -d "$EXT_DIR" ]; then
  log "live extension dir missing (${EXT_DIR}) — creating shell ..."
  mkdir -p "${EXT_DIR}/out"
fi

log "backing up current live bundle ..."
cp -f "$MAIN_BUNDLE" /tmp/continue-extension.bak 2>/dev/null || true

log "installing bundle -> ${MAIN_BUNDLE}"
cp -f "$BUILD_BUNDLE" "$MAIN_BUNDLE"

ok "installed. Reload VS Code (Ctrl+Shift+P -> \"Developer: Reload Window\")."
echo "  verify: code --list-extensions --show-versions | grep continue"
