#!/usr/bin/env bash
# =============================================================================
# install.sh — build the current source (installed toolchain, NO postinstall
# scripts) and install it into VS Code automatically.
#
# Purpose: you shouldn't need to remember build steps. Just run this.
#
#   ./install.sh                     # build + install (default, all-in-one)
#   ./install.sh --bundle-only       # skip rebuilds, repackage + reinstall
#   VSIX=/path/x.vsix ./install.sh   # install a prebuilt .vsix instead
#
# What it produces: a full, registered VS Code extension. It builds the
# workspace packages, builds the GUI webview, copies the webview into the
# extension (gui/), builds the esbuild bundle, packages a .vsix, and installs
# it with the VS Code CLI. Packaging a .vsix (rather than hand-copying a
# bundle) guarantees a complete extension shell (package.json, media/, gui/,
# ...) that VS Code registers under the current publisher/name, so renamed
# extension IDs work cleanly.
#
# Security: npm 12 blocks install/postinstall scripts by default. This script
# NEVER approves or runs them. esbuild's native binary ships as an optional
# dependency, so the bundle builds fine without running any install script.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

VSCODE_DIR="${ROOT}/extensions/vscode"
GUI_DIR="${ROOT}/gui"
VSIX_OUT="${VSCODE_DIR}/continued.vsix"

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
# 1. Build the workspace packages (naruzkurai-adapters, config-types, fetch, ...)
# -----------------------------------------------------------------------------
if [ "$MODE" != "--bundle-only" ]; then
  log "building workspace packages ..."
  node ./scripts/build-packages.js || die "package build failed."

  # ---------------------------------------------------------------------------
  # 2. Build the GUI webview (tsc + vite -> gui/dist). The VSCode webview is
  #    served from this build, so it MUST be fresh or the chat UI is stale.
  # ---------------------------------------------------------------------------
  log "building GUI webview (gui/dist) ..."
  ( cd "${GUI_DIR}" && npm run build ) || die "GUI build failed."

  # ---------------------------------------------------------------------------
  # 3. Copy the built webview (gui/dist) into the extension. The VSCode webview
  #    is served from extensions/vscode/gui (see ContinueGUIWebviewViewProvider),
  #    so this is what ships the fixed chat UI. We copy directly instead of
  #    running scripts/prepackage.js, which also wipes out/ and runs heavy npm
  #    installs that this script deliberately avoids.
  # ---------------------------------------------------------------------------
  log "copying GUI webview into the extension (extensions/vscode/gui/) ..."
  rm -rf "${VSCODE_DIR}/gui"
  mkdir -p "${VSCODE_DIR}/gui"
  cp -a "${GUI_DIR}/dist/." "${VSCODE_DIR}/gui/"
  [ -f "${VSCODE_DIR}/gui/assets/index.js" ] \
    || die "GUI build missing ${VSCODE_DIR}/gui/assets/index.js"

  # ---------------------------------------------------------------------------
  # 4. Build the extension bundle (esbuild, minified).
  # ---------------------------------------------------------------------------
  log "building extension bundle (esbuild, minified) ..."
  mkdir -p "${VSCODE_DIR}/build"
  ( cd "${VSCODE_DIR}" && node scripts/esbuild.js --minify ) \
    || die "esbuild bundle failed."
fi

# ---------------------------------------------------------------------------
# 5. Sanity: the bundle must contain the naruzkurai provider
# ---------------------------------------------------------------------------
BUILD_BUNDLE="${VSCODE_DIR}/out/extension.js"
[ -f "$BUILD_BUNDLE" ] || die "no bundle at ${BUILD_BUNDLE} — run ./install.sh (full) first."
if ! grep -q "naruzkurai" "$BUILD_BUNDLE"; then
  die "built bundle has no 'naruzkurai' provider. Did the source get built?"
fi
ok "bundle contains naruzkurai provider ($(grep -c "naruzkurai" "$BUILD_BUNDLE") hits)."

# ---------------------------------------------------------------------------
# 5b. Bump the extension version before packaging so every install gets a
#     unique, increasing version (helps sidestep stale/cached installs).
#
#     Version format: 2.0.2-<yyyymmddhhmmss> (a semver PRERELEASE build,
#     e.g. 2.0.2-20260831153045). VS Code requires valid semver;
#     "2.0.2.20260831153045" (a 4th dot-segment) is NOT valid and vsce will
#     refuse to package it, so the timestamp lives in the prerelease slot.
#     A timestamped build is unique and monotonic without any persisted
#     counter state.
# ---------------------------------------------------------------------------
VERSION_BASE="2.0.2"
VSCODE_PKG="${VSCODE_DIR}/package.json"

next_version() {
  printf '%s-%s\n' "$VERSION_BASE" "$(date +%Y%m%d%H%M%S)"
}

log "bumping extension version ..."
NEW_VERSION="$(next_version)"
node -e "
  const fs = require('fs');
  const p = '${VSCODE_PKG}';
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  j.version = '${NEW_VERSION}';
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
"
ok "version bumped to ${NEW_VERSION}"

# ---------------------------------------------------------------------------
# 6. Package a .vsix (vsce runs vscode:prepublish -> esbuild; that is fine).
# ---------------------------------------------------------------------------
log "packaging .vsix ..."
rm -f "$VSIX_OUT"
( cd "${VSCODE_DIR}" && npx vsce package --no-dependencies --skip-license -o "$VSIX_OUT" ) \
  || die "vsce package failed."

[ -f "$VSIX_OUT" ] || die "packaging produced no .vsix at ${VSIX_OUT}"

# ---------------------------------------------------------------------------
# 7. Remove any pre-existing Continue / continued extensions first.
#
#    Multiple copies of the extension (e.g. a leftover `continue.continue`
#    plus `naruzkurai.continued`, or stale versioned dirs) all register the
#    same `continue.*` command IDs, which makes VS Code throw
#    "command 'continue.focusContinueInput' already registered". Deleting
#    every on-disk copy up front guarantees a single clean install.
# ---------------------------------------------------------------------------
remove_existing_continue_extensions() {
  local ext_dir ids removed
  ext_dir="$HOME/.vscode/extensions"

  log "removing existing continue/continued extensions ..."

  # 7a. Uninstall via the VS Code CLI (updates extensions.json state).
  for id in "continue.continue" "naruzkurai.continued" "naruzkurai.contiunued"; do
    if code --list-extensions 2>/dev/null | grep -q "^${id}\$"; then
      code --uninstall-extension "$id" >/dev/null 2>&1 \
        && log "  uninstalled ${id}" \
        || log "  (${id} reported uninstalled)"
    fi
  done

  # 7b. Hard-delete any on-disk continue/continued extension folders
  #     (covers stale left-overs that the CLI no longer tracks, e.g.
  #     ".stale-*" copies and old `continue.continue-*` dirs). We only delete
  #     under $HOME/.vscode/extensions, so nothing outside user extensions is
  #     touched.
  removed=0
  while IFS= read -r d; do
    [ -n "$d" ] || continue
    name="$(basename "$d")"
    case "$name" in
      continue.continue-*|naruzkurai.continued-*|continue.contiunued-*|naruzkurai.contiunued-*|.stale-continue.*|.stale-naruzkurai.*)
        rm -rf "$d" && log "  deleted ${d}" && removed=1
        ;;
    esac
  done < <(find "$ext_dir" -maxdepth 1 \( -iname "*continue*" -o -iname "*contiunue*" -o -iname "*naruzkurai*" \) 2>/dev/null)

  if [ "$removed" -eq 0 ]; then
    log "  none found"
  fi
}

remove_existing_continue_extensions

# ---------------------------------------------------------------------------
# 8. Install via the VS Code CLI (registers under the current publisher/name).
# ---------------------------------------------------------------------------
log "installing ${VSIX_OUT} ..."
code --install-extension "$VSIX_OUT" --force

ok "installed. Reload VS Code (Ctrl+Shift+P -> \"Developer: Reload Window\")."
echo "  verify: code --list-extensions --show-versions | grep continue"
pkill vscode