#!/bin/sh
# Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
#
# SPDX-License-Identifier: Apache-2.0
#
# run.sh [--devices [serial...]]
#
# The host suite: the unit tests over the pure logic in app/src/util and over the service, then
# the packed-artifact tests, which need enyo-dev but no device. With --devices it goes on to
# deploy to each attached LuneOS device and test there.
#
# Not run here, and why: there is no C or C++ in this repo, so the sanitizer, valgrind, sparse
# and cross-compiler passes the native services get have nothing to act on. The JS equivalent is
# jshint, which the repo is already configured for (app/.jshintrc) - tests/static-analysis.sh
# runs it when it is installed.
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
WORK=${MESSAGING_WORK:-${TMPDIR:-/tmp}/messaging-tests}
fail=0

echo "== unit"
node --test "$HERE"/unit/*.test.js || fail=1

echo
echo "== static analysis"
"$HERE/static-analysis.sh" || fail=1

echo
echo "== artwork"
# The artwork ships as SVG and the app loads it as SVG, so there is nothing to rebuild - but a
# file that does not rasterise would not draw on the device either, and nothing else would say so.
if python3 "$HERE/../graphics/render.py" >/dev/null 2>&1; then
	echo "PASS artwork ($(ls "$HERE/../app/assets"/*.svg | wc -l) svg assets rasterise)"
else
	echo "SKIP artwork (needs python3 and rsvg-convert or chromium)"
fi

echo
echo "== build"
if PACK=$("$HERE/pack.sh" "$WORK"); then
	MESSAGING_PACK_DIR="$PACK" node --test "$HERE"/build/*.test.js || fail=1
else
	echo "FAIL pack"; fail=1
fi

if [ "${1:-}" = "--devices" ]; then
	shift
	echo
	echo "== devices"
	MESSAGING_WORK="$WORK" "$HERE/device/run.sh" "$@" || fail=1
fi

exit $fail
