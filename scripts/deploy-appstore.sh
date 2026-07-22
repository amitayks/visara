#!/usr/bin/env bash
# ============================================================================
# Visara — build the iOS release archive and upload it to App Store Connect.
#
# The local twin of the `ios` job in .github/workflows/release.yml: archive
# with cloud-managed automatic signing (App Store Connect API key), then
# export with destination=upload. Requires Xcode 26+ (Podfile targets iOS 26).
#
# Credentials (flags win over env; env is auto-loaded from ./.env):
#   ASC_KEY_ID        App Store Connect API key ID            --key-id
#   ASC_ISSUER_ID     App Store Connect issuer ID             --issuer-id
#   ASC_API_KEY_PATH  path to the AuthKey_<ID>.p8 file        --key-path
#
# Usage:
#   scripts/deploy-appstore.sh [--dry-run] [--skip-pods]
#     --dry-run    archive + export a signed IPA to ios/build/export, upload nothing
#     --skip-pods  skip `pod install` (Pods already up to date)
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# .env is gitignored; load it for the ASC_* values (same file the Play script uses).
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DRY_RUN=false
SKIP_PODS=false
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    --skip-pods) SKIP_PODS=true ;;
    --key-id) ASC_KEY_ID="$2"; shift ;;
    --issuer-id) ASC_ISSUER_ID="$2"; shift ;;
    --key-path) ASC_API_KEY_PATH="$2"; shift ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown flag: $1 (see --help)" >&2; exit 1 ;;
  esac
  shift
done

: "${ASC_KEY_ID:?ASC_KEY_ID is not set — App Store Connect API key ID (see RELEASING.md §iOS one-time setup)}"
: "${ASC_ISSUER_ID:?ASC_ISSUER_ID is not set — App Store Connect issuer ID}"
: "${ASC_API_KEY_PATH:?ASC_API_KEY_PATH is not set — path to the AuthKey_<ID>.p8 file}"
[ -f "$ASC_API_KEY_PATH" ] || { echo "❌ API key file not found: $ASC_API_KEY_PATH" >&2; exit 1; }

VERSION="$(node -p "require('./package.json').version")"
ARCHIVE="ios/build/Visara.xcarchive"
EXPORT_DIR="ios/build/export"

echo "🍎 Visara $VERSION → App Store Connect  (dry-run: $DRY_RUN)"

if [ "$SKIP_PODS" = false ]; then
  echo "📦 pod install…"
  pod install --project-directory=ios
fi

echo "🏗  Archiving (this builds all native pods — expect several minutes)…"
xcodebuild archive \
  -workspace ios/Visara.xcworkspace \
  -scheme Visara \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$(cd "$(dirname "$ASC_API_KEY_PATH")" && pwd)/$(basename "$ASC_API_KEY_PATH")" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM=Q4V4V3KZ9P \
  -quiet

PLIST=ios/ExportOptions.plist
if [ "$DRY_RUN" = true ]; then
  PLIST="$(mktemp -t ExportOptions).plist"
  sed 's|<string>upload</string>|<string>export</string>|' ios/ExportOptions.plist > "$PLIST"
  echo "🧪 Dry run — exporting signed IPA to $EXPORT_DIR (no upload)…"
else
  echo "⬆️  Exporting + uploading to App Store Connect…"
fi

xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$PLIST" \
  -exportPath "$EXPORT_DIR" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$(cd "$(dirname "$ASC_API_KEY_PATH")" && pwd)/$(basename "$ASC_API_KEY_PATH")" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"

if [ "$DRY_RUN" = true ]; then
  echo "✅ Dry run complete — IPA in $EXPORT_DIR"
else
  echo "✅ Uploaded. Track processing in App Store Connect → TestFlight (10–30 min)."
fi
