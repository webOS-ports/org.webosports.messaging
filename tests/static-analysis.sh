#!/bin/sh
# Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
#
# SPDX-License-Identifier: Apache-2.0
#
# jshint over the app and the service, against the repo's own app/.jshintrc.
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
	"$JSHINT" --config "$REPO/app/.jshintrc" --exclude-path "$REPO/app/.jshintignore" \
		"$REPO/app/src" "$REPO/app/index.js" "$REPO/service/javascript" || fail=1
	echo "PASS jshint"
else
	echo "SKIP jshint (not installed; npm i -g jshint)"
fi

# Every module parses. node --check only parses, so nothing in them runs.
for f in $(find "$REPO/app/src" "$REPO/service/javascript" -name '*.js'); do
	node --check "$f" || { echo "FAIL parse $f"; fail=1; }
done
echo "PASS parse ($(find "$REPO/app/src" "$REPO/service/javascript" -name '*.js' | wc -l) modules)"

exit $fail
