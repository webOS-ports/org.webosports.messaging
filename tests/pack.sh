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
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/.." && pwd)
WORK=${1:-${TMPDIR:-/tmp}/messaging-pack}

if [ -z "${ENYO_DEV:-}" ]; then
	for candidate in \
		/media/herrie/LuneOS/wrynose/webos-ports/tmp/sysroots-components/x86_64/nodejs-enyo-dev-native/opt/enyo-dev \
		"$HOME"/wrynose-*/tmp*/sysroots-components/x86_64/nodejs-enyo-dev-native/opt/enyo-dev
	do
		[ -f "$candidate/bin/enyo.js" ] && ENYO_DEV=$candidate && break
	done
fi
if [ -z "${ENYO_DEV:-}" ] || [ ! -f "$ENYO_DEV/bin/enyo.js" ]; then
	echo "pack.sh: no enyo-dev found. Set ENYO_DEV to a nodejs-enyo-dev-native staging dir" >&2
	exit 1
fi

# enyo-dev ships the node it was built against; the host node is far too new for it.
NODE=$ENYO_DEV/node_binaries/$(uname -m)/node
[ -x "$NODE" ] || { echo "pack.sh: no bundled node at $NODE" >&2; exit 1; }

# The libraries are a one-time fetch over the network. Skip it when they are already there, so
# the tests run offline.
if [ ! -d "$REPO/app/lib/enyo" ]; then
	echo "pack.sh: fetching enyo libraries (needs network, once)" >&2
	(cd "$REPO/app" && "$NODE" "$ENYO_DEV/bin/enyo.js" init) || exit 1
fi

OUT=$WORK/org.webosports.app.messaging
rm -rf "$OUT"
mkdir -p "$WORK"
(cd "$REPO/app" && "$NODE" "$ENYO_DEV/bin/enyo.js" pack --production --clean -d "$OUT") || exit 1
[ -f "$OUT/index.html" ] || { echo "pack.sh: enyo pack produced no index.html" >&2; exit 1; }

echo "$OUT"
