#!/bin/sh
# Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
#
# SPDX-License-Identifier: Apache-2.0
#
# pack.sh [workdir]
#
# Packs app/ exactly the way the recipe does - enyo-dev, --production --clean - and prints the
# directory the packed app landed in. The packed form is what the build tests look at, because
# --production is what inlines every module into index.html, and that inlining is where a bug
# can appear that no amount of testing the source would find.
#
# enyo-dev is not on anyone's PATH: it comes from nodejs-enyo-dev-native, so take it out of a
# bitbake native sysroot. Set ENYO_DEV to point somewhere else.
#
# stdout is only that directory: run.sh reads it. Everything else goes to stderr.
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/.." && pwd)
WORK=${1:-${TMPDIR:-/tmp}/messaging-pack}

# Finds enyo-dev, sets ENYO_DEV and NODE, and fetches the libraries the first time.
# shellcheck source=tests/libs.sh
. "$HERE/libs.sh" || exit 1

OUT=$WORK/org.webosports.app.messaging
rm -rf "$OUT"
mkdir -p "$WORK"
(cd "$REPO/app" && "$NODE" "$ENYO_DEV/bin/enyo.js" pack --production --clean -d "$OUT") >&2 || exit 1
[ -f "$OUT/index.html" ] || { echo "pack.sh: enyo pack produced no index.html" >&2; exit 1; }

echo "$OUT"
