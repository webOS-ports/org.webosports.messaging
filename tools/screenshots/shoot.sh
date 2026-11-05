#!/bin/sh
# Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
#
# SPDX-License-Identifier: Apache-2.0
#
# tools/screenshots/shoot.sh [outdir]
#
# Makes the README screenshots (docs/screenshots by default): packs app/ for development, so the
# in-browser mock data (app/src/data/mockDb.js, app/mock) is in, serves it, and drives headless
# Chromium at a phone size (Pixel 3a card, 1080x2050) and a tablet size (TouchPad card, 1024x748).
# No device data is involved, so nothing personal can end up in a picture.
#
# Needs: enyo-dev (as tests/pack.sh finds it, or ENYO_DEV), python3, chromium or google-chrome,
# and the Prelude fonts and the service icons from the account templates - PRELUDE_DIR and
# ACCOUNTS_DIR (a copy of /usr/palm/public/accounts), or else both are copied off an attached
# LuneOS device. Neither is in this repo: the fonts are Palm's and the icons the connectors'.
# The mock timestamps are relative to now, so shoot in the afternoon for natural looking times.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
OUT=$(mkdir -p "${1:-$REPO/docs/screenshots}" && cd "${1:-$REPO/docs/screenshots}" && pwd)
WORK=${SHOTS_WORK:-$REPO/app/build/screenshots}
HTTP_PORT=${HTTP_PORT:-8731}
CDP_PORT=${CDP_PORT:-9333}

if [ -z "${ENYO_DEV:-}" ]; then
	for candidate in \
		/media/herrie/LuneOS/wrynose/webos-ports/tmp/sysroots-components/x86_64/nodejs-enyo-dev-native/opt/enyo-dev \
		"$HOME"/wrynose-*/tmp*/sysroots-components/x86_64/nodejs-enyo-dev-native/opt/enyo-dev
	do
		[ -f "$candidate/bin/enyo.js" ] && ENYO_DEV=$candidate && break
	done
fi
[ -f "${ENYO_DEV:-}/bin/enyo.js" ] || { echo "shoot.sh: no enyo-dev found, set ENYO_DEV" >&2; exit 1; }
NODE=$ENYO_DEV/node_binaries/$(uname -m)/node
CHROME=$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)
[ -n "$CHROME" ] || { echo "shoot.sh: no chromium found" >&2; exit 1; }

mkdir -p "$WORK"
DIST=$WORK/dist
if [ ! -d "$REPO/app/lib/enyo" ]; then
	(cd "$REPO/app" && "$NODE" "$ENYO_DEV/bin/enyo.js" init)
fi
(cd "$REPO/app" && "$NODE" "$ENYO_DEV/bin/enyo.js" pack --clean -d "$DIST") >/dev/null
[ -d "$DIST/mock/avatars" ] || { echo "shoot.sh: the pack has no mock/ - was it a production pack?" >&2; exit 1; }

mkdir -p "$DIST/shotfonts"
if [ -n "${PRELUDE_DIR:-}" ]; then
	cp "$PRELUDE_DIR"/Prelude-*.ttf "$DIST/shotfonts/"
else
	for f in Prelude-Medium Prelude-Bold Prelude-MediumOblique Prelude-BoldOblique; do
		adb pull "/usr/share/fonts/$f.ttf" "$DIST/shotfonts/" >/dev/null ||
			{ echo "shoot.sh: set PRELUDE_DIR, or attach a LuneOS device to copy Prelude from" >&2; exit 1; }
	done
fi

# The icons the mock accounts name (app/src/data/mockDb.js), from the real templates.
for t in com.palm.telegram/images/telegram com.palm.whatsapp/images/whatsapp \
		com.palm.signal/images/signal com.palm.discord/images/discord com.palm.palmprofile/images/sms; do
	mkdir -p "$DIST/mock/accounts/$(dirname "$t")"
	for size in 32x32 48x48; do
		if [ -n "${ACCOUNTS_DIR:-}" ]; then
			cp "$ACCOUNTS_DIR/$t-$size.png" "$DIST/mock/accounts/$t-$size.png"
		else
			adb pull "/usr/palm/public/accounts/$t-$size.png" "$DIST/mock/accounts/$t-$size.png" >/dev/null ||
				{ echo "shoot.sh: set ACCOUNTS_DIR, or attach a LuneOS device to copy the service icons from" >&2; exit 1; }
		fi
	done
done

python3 -m http.server "$HTTP_PORT" --bind 127.0.0.1 --directory "$DIST" >"$WORK/httpd.log" 2>&1 &
HTTPD=$!
"$CHROME" --headless=new --no-sandbox --hide-scrollbars --no-first-run \
	--remote-debugging-port="$CDP_PORT" --user-data-dir="$WORK/profile" about:blank \
	>"$WORK/chrome.log" 2>&1 &
CHROMEPID=$!
trap 'kill $HTTPD $CHROMEPID 2>/dev/null || true' EXIT INT TERM
i=0
until curl -sf "http://127.0.0.1:$CDP_PORT/json/version" >/dev/null; do
	i=$((i + 1)); [ $i -lt 50 ] || { echo "shoot.sh: chromium did not come up" >&2; exit 1; }
	sleep 0.2
done

URL=http://127.0.0.1:$HTTP_PORT/index.html
shoot() { # shoot SIZE NAME STEP...
	size=$1; name=$2; shift 2
	node "$HERE/cdp.mjs" "$CDP_PORT" "size:$size" "go:$URL" wait:5000 "$@" wait:2500 "shot:$OUT/$name.png"
}

PHONE=432,820,2.5
shoot $PHONE phone-conversations
shoot $PHONE phone-chat tapt:"Anna Kowalski"
shoot $PHONE phone-group tapt:Family
shoot $PHONE phone-photo tapt:"Marta Lindqvist"
shoot $PHONE phone-buddies xy:270,75
shoot $PHONE phone-favorites xy:378,75
shoot $PHONE phone-servers xy:54,75

TABLET=1024,748,1
shoot $TABLET tablet-chat tapt:"Anna Kowalski"
shoot $TABLET tablet-group tapt:Family
shoot $TABLET tablet-buddies tapt:"Marta Lindqvist" wait:2500 xy:200,75
