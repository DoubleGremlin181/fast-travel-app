#!/bin/sh
# companion/scripts/build.sh — Cross-compile the Fast Travel companion daemon.
#
# Usage: build.sh [VERSION]
#   VERSION  Optional version string (e.g. "1.2.3"). Defaults to the output of
#            `git describe --tags --always`, or "dev" if git is unavailable.
#
# Outputs static binaries into companion/dist/:
#   fast-travel-companion-linux-amd64
#   fast-travel-companion-linux-arm64
#   fast-travel-companion-windows-amd64.exe
#
# Phase 4 follow-up: AppImage wrapping and the GitHub release workflow are not
# handled here; add them separately when Windows packaging is ready.
set -eu

# Resolve the directory containing this script, then find the companion root
# (one level up from scripts/).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPANION_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$COMPANION_DIR"

# Determine VERSION.
if [ -n "${1:-}" ]; then
    VERSION="$1"
elif git describe --tags --always >/dev/null 2>&1; then
    VERSION="$(git describe --tags --always)"
else
    VERSION="dev"
fi

echo "Building fast-travel-companion $VERSION ..."

mkdir -p dist

LDFLAGS="-s -w -X main.version=$VERSION"
PKG="./cmd/fast-travel-companion"

# linux/amd64
echo "  -> linux/amd64"
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "$LDFLAGS" -o dist/fast-travel-companion-linux-amd64 "$PKG"

# linux/arm64
echo "  -> linux/arm64"
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags "$LDFLAGS" -o dist/fast-travel-companion-linux-arm64 "$PKG"

# windows/amd64
echo "  -> windows/amd64"
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "$LDFLAGS" -o dist/fast-travel-companion-windows-amd64.exe "$PKG"

echo ""
echo "Built:"
ls -lh dist/
