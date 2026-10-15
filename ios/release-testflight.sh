#!/bin/zsh
# iOS-Build bauen, signieren und direkt nach TestFlight hochladen.
# Aufruf: ASC_ISSUER_ID=<uuid> ios/release-testflight.sh [build-nummer]
# Schlüssel: ~/.appstoreconnect/private_keys/AuthKey_62KH7HW8ZA.p8 (nie ins Repo)
set -euo pipefail
cd "$(dirname "$0")/.."
KEY_ID=${ASC_KEY_ID:-62KH7HW8ZA}
ISSUER=${ASC_ISSUER_ID:?ASC_ISSUER_ID fehlt}
KEY=~/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8
[ -f "$KEY" ] || { echo "Schlüssel fehlt: $KEY"; exit 1; }
BUILD=${1:-$(date +%Y%m%d%H%M)}
AUTH=(-allowProvisioningUpdates -authenticationKeyPath "$KEY" -authenticationKeyID "$KEY_ID" -authenticationKeyIssuerID "$ISSUER")

npm run build
npx cap sync ios
rm -rf build/ios && mkdir -p build/ios
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/ios/App.xcarchive \
  MARKETING_VERSION=1.0 CURRENT_PROJECT_VERSION="$BUILD" "${AUTH[@]}" archive
xcodebuild -exportArchive -archivePath build/ios/App.xcarchive \
  -exportOptionsPlist ios/ExportOptions.plist -exportPath build/ios/export "${AUTH[@]}"
echo "Hochgeladen: 1.0 ($BUILD) — erscheint nach 5–30 Min. in TestFlight"
