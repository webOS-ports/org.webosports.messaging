#!/bin/sh
# Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
#
# SPDX-License-Identifier: Apache-2.0
#
# libs.sh
#
# Fetches the enyo libraries into app/lib with enyo-dev's "enyo init", once: the unit tests load
# moment and webos-lib from there, and pack.sh packs against them. Skipped when they are already
# there, so the tests run offline. Prints nothing on stdout - pack.sh's stdout is the pack path
# run.sh reads - so init's clone log goes to stderr.
#
# Sets ENYO_DEV and NODE for a caller that sources it ( . libs.sh ). So a failure is
# "return 1 2>/dev/null || exit 1": return when sourced, exit when run.
# shellcheck disable=SC2317  # the exit after that return is reached when run, not sourced
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/.." && pwd)

if [ -z "${ENYO_DEV:-}" ]; then
	for candidate in \
		/media/herrie/LuneOS/wrynose/webos-ports/tmp/sysroots-components/x86_64/nodejs-enyo-dev-native/opt/enyo-dev \
		"$HOME"/wrynose-*/tmp*/sysroots-components/x86_64/nodejs-enyo-dev-native/opt/enyo-dev
	do
		[ -f "$candidate/bin/enyo.js" ] && ENYO_DEV=$candidate && break
	done
fi
if [ -z "${ENYO_DEV:-}" ] || [ ! -f "$ENYO_DEV/bin/enyo.js" ]; then
	echo "libs.sh: no enyo-dev found. Set ENYO_DEV to a nodejs-enyo-dev-native staging dir" >&2
	return 1 2>/dev/null || exit 1
fi

# enyo-dev ships the node it was built against; the host node is far too new for it.
NODE=$ENYO_DEV/node_binaries/$(uname -m)/node
if [ ! -x "$NODE" ]; then
	echo "libs.sh: no bundled node at $NODE" >&2
	return 1 2>/dev/null || exit 1
fi

# webos-lib is the last library init fetches, so a run cut short leaves it missing.
if [ ! -d "$REPO/app/lib/enyo" ] || [ ! -d "$REPO/app/lib/webos-lib" ]; then
	echo "libs.sh: fetching enyo libraries (needs network, once)" >&2
	# init also rewrites .enyoconfig and package.json in its own key order and adds a .gitignore
	# the repo's already covers; put them back, so a fetch leaves the checkout clean.
	saved=$(mktemp -d) || { return 1 2>/dev/null || exit 1; }
	for f in .enyoconfig package.json .gitignore; do
		[ -f "$REPO/app/$f" ] && cp -p "$REPO/app/$f" "$saved/$f"
	done
	(cd "$REPO/app" && "$NODE" "$ENYO_DEV/bin/enyo.js" init) >&2
	status=$?
	for f in .enyoconfig package.json .gitignore; do
		if [ -f "$saved/$f" ]; then
			cp -p "$saved/$f" "$REPO/app/$f"
		else
			rm -f "$REPO/app/$f"
		fi
	done
	rm -rf "$saved"
	if [ $status -ne 0 ]; then
		return 1 2>/dev/null || exit 1
	fi
fi
