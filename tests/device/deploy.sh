#!/bin/sh
# Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
#
# SPDX-License-Identifier: Apache-2.0
#
# deploy.sh <serial> <packdir>
#
# Replaces /usr/palm/applications/org.webosports.app.messaging on the device with a packed build
# and restarts sam so it re-reads the app list.
#
# The directory is removed rather than pushed over: a file the new build no longer has would
# otherwise stay behind and keep being served. The packaged app ships an enyo-luneos/ directory
# the rewrite no longer references, which is exactly that case.
#
# The previous contents are kept on the device at
# /media/internal/org.webosports.app.messaging-<stamp>.tar.gz, so a bad build can be undone
# without a reflash.
set -u

SERIAL=${1:?usage: deploy.sh <serial> <packdir>}
PACK=${2:?usage: deploy.sh <serial> <packdir>}
APPDIR=/usr/palm/applications/org.webosports.app.messaging
REPO=$(cd "$(dirname "$0")/../.." && pwd)

[ -f "$PACK/index.html" ] || { echo "deploy.sh: $PACK holds no packed app" >&2; exit 1; }

adb -s "$SERIAL" shell "test -d $APPDIR" || { echo "deploy.sh: $APPDIR missing on $SERIAL" >&2; exit 1; }

STAMP=$(date +%Y%m%d%H%M%S)
adb -s "$SERIAL" shell "tar czf /media/internal/org.webosports.app.messaging-$STAMP.tar.gz \
	-C /usr/palm/applications org.webosports.app.messaging" || exit 1
echo "backed up to /media/internal/org.webosports.app.messaging-$STAMP.tar.gz"

adb -s "$SERIAL" shell "rm -rf $APPDIR" || exit 1
adb -s "$SERIAL" push "$PACK" /usr/palm/applications/ >/dev/null || exit 1
adb -s "$SERIAL" shell "systemctl restart sam" || exit 1

# The db8 kinds are part of the same repo and the app's queries depend on them - the unread watch
# needs the unreadbyfolder index on com.palm.message. Push them and let the configurator re-put
# them, which is what installing the service package would have done.
for kind in "$REPO"/service/configuration/db/kinds/*; do
	adb -s "$SERIAL" push "$kind" "/etc/palm/db/kinds/$(basename "$kind")" >/dev/null || exit 1
done
adb -s "$SERIAL" shell "systemctl restart configurator-db8" || exit 1

# sam re-reads the app list on start; the tests launch the app, so wait for it to be up.
i=0
while [ $i -lt 30 ]; do
	[ "$(adb -s "$SERIAL" shell 'systemctl is-active sam' | tr -d '\r\n')" = "active" ] && break
	i=$((i + 1))
	sleep 1
done
[ $i -lt 30 ] || { echo "deploy.sh: sam did not come back on $SERIAL" >&2; exit 1; }

echo "deployed to $SERIAL"
