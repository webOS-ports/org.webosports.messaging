# Tests

Three layers, each answering a different question.

| | What it checks | Needs |
|---|---|---|
| `unit/` | the pure logic in `app/src/util`, and the service (`service-*.test.js`) | node 22 |
| `build/` | the app **after** `enyo pack --production` | node, enyo-dev |
| `device/` | the app running on a phone | node, enyo-dev, adb |

```sh
tests/run.sh                 # unit + static analysis + build
tests/run.sh --devices       # ... then deploy to every attached LuneOS device and test there
tests/run.sh --devices SERIAL
tests/device/run.sh SERIAL   # devices only
```

Set `MESSAGING_WORK` to choose where the packed build goes, and `ENYO_DEV` to
point at a `nodejs-enyo-dev-native` staging directory if the ones `pack.sh`
knows about are not there.

## The service tests

`unit/service-*.test.js` run `service/` - the chat threader - on a stand-in
palmbus with an in-memory db8 behind it (`unit/service/`: `fakedb.js` does
kind inheritance, index defaults, revSets, soft deletes and refuses a merge
with a stale `_rev`, as db8 does). It also refuses what db8 would refuse the
service: a query no index of the real kind files serves, and - for calls the
service makes over the bus - anything its kind permissions do not grant, read
from `service/configuration/db/permissions` and copies of the other components'
files (`service-fakedb.test.js` pins those rules to what the device answered).
Nothing in them needs a device.

`service-volume.test.js` builds a mailbox from a fixed seed
(`unit/service/volume.js`): 300 contacts, 60 strangers, channels, group chats
and 800 messages over four transports, with the address forms each transport
really writes, history back-filled out of order, and contacts that only sync
halfway. Every message is tagged with the conversation it was generated for, and
the threads are held to those tags after delivery, after reads and after
deletes. `VOLUME_SEEDS=4,5,6` runs other mailboxes; a failure names the seed, so
it can be run again exactly.

The tests were mutation-checked: each rule in `service/lib` was broken in turn
(threading by "to", channels under the speaker, WhatsApp without its "+", the
trunk-0 match, the lookup caches, the migration's joins, ...) and some test had
to fail for each.

## Why the build layer exists

`enyo pack --production` inlines every module and stylesheet into one
`index.html`. That step has already shipped a blank app: a string literal
holding a bare script-end sequence closed the inline `<script>` early and
everything after it was parsed as markup. Nothing in `app/src` was wrong, and
no test of the sources could have seen it. `build/packaged.test.js` compiles the
inlined bundle and checks the stylesheet that comes out the other side.

## Why the device layer exists

Two of the bugs these tests were written around are only visible on a real
screen:

- the thread list and the conversation pane laid out side by side on a phone,
  leaving the conversation a 130px sliver off the right edge;
- the first-run screen's Add An Account button pushed under the footer on a
  720x720 panel.

Both are facts about the live DOM, so `device/` goes through WAM's inspector
(`--remote-debugging-port=9998`, on by default) rather than taking a screenshot
nothing can assert on. `device/cdp.js` is a small CDP client over node's own
WebSocket - nothing from npm.

The layout assertions branch on the viewport: at 800px or less the thread list
takes the screen and the conversation waits off the right edge, above that the
Mojo arrangement of a 320px list beside the conversation. Running on a phone
*and* on a tablet in landscape covers both.

`device/run.sh` also deploys, which replaces the app directory outright and
pushes `service/configuration/db/kinds` so the queries the tests make can be
answered. The app directory it replaces is kept on the device under
`/media/internal/org.webosports.app.messaging-<stamp>.tar.gz`.

A device with no messaging account opens on the first-run screen. The tests
check that screen, then tap Done to reach the thread list, and put
`firstUseMode` back afterwards so the device is left as it was found.

## What is not run here, and why

The C/C++ bar used for the native services - gtest, `-fanalyzer`, clang-tidy,
cppcheck, ASan/UBSan/TSan, valgrind, sparse, Coccinelle, and the six
cross-compiles - has nothing to act on: this repo is JavaScript, an Enyo 2 app
and a node service. The equivalents are `static-analysis.sh` (jshint against the
repo's own `app/.jshintrc` for the app and `service/.jshintrc` for the service,
plus a parse of every module) and the unit tests.
jshint is not vendored, so it is skipped with a note when it is not installed.
