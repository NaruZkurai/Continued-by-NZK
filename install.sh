#!/usr/bin/env bash
# =============================================================================
# install.sh — install the built Continue extension into VS Code.
#
# Prefers the .vsix produced by build.sh and installs it with the locally
# installed `code` CLI (no Node toolchain needed here).
#
# Usage:
#   ./install.sh                                   # use the newest built .vsix
#   ./install.sh /path/to/continue-2.0.0.vsix        # install a specific file
#   BUILD=1 ./install.sh                            # build.sh first, then install
#
# Environment:
#   VSIX   path to an explicit .vsix (same as passing it as $1)
#   BUILD  set to 1 to run build.sh before installing
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

log() { printf '\033[1;34m[install]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[install:error]\033[0m %s\n' "$*" >&2; }
die() { err "$*"; exit 1; }

# -----------------------------------------------------------------------------
# 0. The `code` CLI must be available (installed versions only)
# -----------------------------------------------------------------------------
if ! command -v code >/dev/null 2>&1; then
  die "the 'code' CLI was not found on PATH. Install/launch VS Code first."
fi
log "using code CLI: $(command -v code)"

# -----------------------------------------------------------------------------
# 1. Optionally build first
# -----------------------------------------------------------------------------
if [ "${BUILD:-}" = "1" ]; then
  log "running build.sh first ..."
  "${ROOT}/build.sh"
fi

# -----------------------------------------------------------------------------
# 2. Pick the .vsix to install
# -----------------------------------------------------------------------------
VSIX="${VSIX:-${1:-}}"
if [ -z "$VSIX" ]; then
  # Prefer the root vsix (build.sh), else the build/ dir (vsce package --out)
  VSIX="$(
    ls -1t extensions/vscode/*.vsix extensions/vscode/build/*.vsix 2>/dev/null \
      | head -1
  )" || true
fi

PICKED_FROM_BUILD_DIR=""
if [ -n "$VSIX" ] && [ ! -f "$VSIX" ]; then
  die "vsix not found: $VSIX"
fi

# -----------------------------------------------------------------------------
# 3. Unpacked-build fallback (no .vsix available)
# -----------------------------------------------------------------------------
if [ -z "$VSIX" ] && [ -d extensions/vscode/build ]; then
  log "no .vsix found — falling back to unpacked build dir: extensions/vscode/build"
  VSIX="extensions/vscode/build"
  PICKED_FROM_BUILD_DIR=1
fi

if [ -z "$VSIX" ]; then
  die "no .vsix or build dir found. Run ./build.sh first (or BUILD=1 ./install.sh)."
fi

# -----------------------------------------------------------------------------
# 4. Install
# -----------------------------------------------------------------------------
if [ -n "$PICKED_FROM_BUILD_DIR" ]; then
  log "installing unpacked build dir ..."
  code --install-extension "$VSIX" --force
else
  log "installing vsix: $VSIX"
  code --install-extension "$(pwd)/$VSIX" --force
fi

echo
log "done."
echo "  Reload VS Code (Ctrl+Shift+P -> \"Developer: Reload Window\") to activate."
echo "  Verify: code --list-extensions --show-versions | grep continue"
