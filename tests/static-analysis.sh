#!/bin/sh
# Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
#
# SPDX-License-Identifier: Apache-2.0
#
# jshint over the app (app/.jshintrc: ES3, as the app runs in enyo on the old WebKit too) and
# over the service and its tests (service/.jshintrc, tests/unit/.jshintrc: Node 22).
#
# jshint is not vendored, so this reports what it could not run rather than failing the suite
# over a missing tool. With no jshint anywhere, the syntax check below still runs: node parses
# every module, which catches the class of mistake that would otherwise only show up as a blank
# app on a device.
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/.." && pwd)
fail=0

if command -v jshint >/dev/null 2>&1; then
	JSHINT=jshint
elif [ -x "$REPO/app/node_modules/.bin/jshint" ]; then
	JSHINT=$REPO/app/node_modules/.bin/jshint
else
	JSHINT=
fi

if [ -n "$JSHINT" ]; then
	jfail=0
	"$JSHINT" --config "$REPO/app/.jshintrc" --exclude-path "$REPO/app/.jshintignore" \
		"$REPO/app/src" "$REPO/app/index.js" || jfail=1
	"$JSHINT" --config "$REPO/service/.jshintrc" "$REPO/service/service.js" "$REPO/service/lib" || jfail=1
	"$JSHINT" --config "$REPO/tests/unit/.jshintrc" "$REPO/tests/unit/service" "$REPO"/tests/unit/service-*.test.js || jfail=1
	if [ $jfail -eq 0 ]; then echo "PASS jshint"; else echo "FAIL jshint"; fail=1; fi
else
	echo "SKIP jshint (not installed; npm i -g jshint)"
fi

# Every module parses. node --check only parses, so nothing in them runs.
for f in $(find "$REPO/app/src" "$REPO/service" -name '*.js'); do
	node --check "$f" || { echo "FAIL parse $f"; fail=1; }
done
echo "PASS parse ($(find "$REPO/app/src" "$REPO/service" -name '*.js' | wc -l) modules)"

exit $fail
