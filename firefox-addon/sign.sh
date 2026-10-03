#!/usr/bin/env bash
#
# Signs the add-on through AMO's unlisted (self-distributed) channel, so Zen and
# Firefox accept a permanent install with signature checks left on. See Spec 023.
#
# Requires AMO API credentials (https://addons.mozilla.org/developers/addon/api/key/)
# in the environment; web-ext reads them directly so they never appear in argv:
#   WEB_EXT_API_KEY     (JWT issuer)
#   WEB_EXT_API_SECRET  (JWT secret)
#
# AMO never signs the same version twice: bump "version" in manifest.json first.

set -euo pipefail
cd "$(dirname "$0")"

: "${WEB_EXT_API_KEY:?Set WEB_EXT_API_KEY to your AMO JWT issuer}"
: "${WEB_EXT_API_SECRET:?Set WEB_EXT_API_SECRET to your AMO JWT secret}"

WEB_EXT="web-ext@10.7.0"

npm run build

# Stage only what ships in the .xpi, matching `npm run package`.
rm -rf sign-src
mkdir sign-src
cp -R manifest.json dist icons sign-src/

# dist/background.js is minified by webpack, so AMO's policy asks for the
# human-readable source alongside it.
rm -f sign-source.zip
zip -qr sign-source.zip README.md build.sh manifest.json package.json \
  package-lock.json tsconfig.json webpack.config.js icons src -x '*.DS_Store'

npx --yes "$WEB_EXT" lint --source-dir sign-src
npx --yes "$WEB_EXT" sign \
  --source-dir sign-src \
  --artifacts-dir web-ext-artifacts \
  --channel unlisted \
  --upload-source-code sign-source.zip

echo "Signed .xpi written to firefox-addon/web-ext-artifacts/"
