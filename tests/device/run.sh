#!/bin/sh
# Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
#
# SPDX-License-Identifier: Apache-2.0
#
# run.sh [serial...]
#
# Packs the app, deploys it to each device and runs tests/device/device.test.js against it.
# With no serials, every LuneOS device adb can see is used - a build that is right on one screen
# can be wrong on another, which is the whole reason this runs per device rather than once.
#
# Set MESSAGING_WORK to keep the packed build somewhere other than the default work directory.
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
WORK=${MESSAGING_WORK:-${TMPDIR:-/tmp}/messaging-tests}

serials=$*
if [ -z "$serials" ]; then
	serials=$(adb devices | awk '/\tdevice$/ {print $1}')
	# Only the ones running LuneOS: the host may well have Android phones plugged in too.
	luneos=""
	for s in $serials; do
		if adb -s "$s" shell 'test -d /usr/palm/applications' >/dev/null 2>&1; then
			luneos="$luneos $s"
		fi
	done
	serials=$luneos
fi
[ -n "$serials" ] || { echo "run.sh: no LuneOS device found" >&2; exit 1; }

PACK=$("$REPO/tests/pack.sh" "$WORK") || exit 1
echo "packed: $PACK"

fail=0
for serial in $serials; do
	name=$(adb -s "$serial" shell 'cat /etc/hostname' | tr -d '\r\n')
	echo
	echo "== $name ($serial)"
	if ! "$HERE/deploy.sh" "$serial" "$PACK"; then
		echo "FAIL deploy $name"; fail=1; continue
	fi
	if MESSAGING_DEVICE="$serial" MESSAGING_PACK_DIR="$PACK" \
		node --test "$HERE/device.test.js"; then
		echo "PASS device $name"
	else
		echo "FAIL device $name"; fail=1
	fi
done

exit $fail
