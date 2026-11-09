/*
 * Copyright (c) 2026 Herman van Hazendonk <github.com@herrie.org>
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * tests/libs.sh and tests/pack.sh on a fresh checkout. run.sh takes pack.sh's stdout as the pack
 * directory, so nothing else may reach it, and the libraries the unit tests load from app/lib
 * have to be fetched by libs.sh before them. Run against a stand-in enyo-dev that is as noisy on
 * stdout as the real one, in a copy of the scripts with an empty app/. HARNESS_SH picks the shell
 * (default sh: dash on Debian/Ubuntu; bash should pass too).
 */

var { describe, it, beforeEach, afterEach } = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var os = require('node:os');
var path = require('node:path');
var cp = require('node:child_process');

var TESTS = path.resolve(__dirname, '..');

var STUB = [
    "var fs = require('fs'), path = require('path');",
    "fs.appendFileSync(process.env.STUB_LOG, process.argv[2] + '\\n');",
    "if (process.argv[2] === 'init') {",
    "    console.log(\"Cloning into 'lib/enyo'...\");",
    "    fs.writeFileSync('.enyoconfig', '{ \"rewritten\": true }');",
    "    fs.writeFileSync('package.json', '{ \"rewritten\": true }');",
    "    fs.writeFileSync('.gitignore', 'lib\\n');",
    "    if (process.env.STUB_INIT_FAIL) { process.exit(3); }",
    "    ['enyo', 'moment', 'webos-lib'].forEach(function (l) { fs.mkdirSync(path.join('lib', l), { recursive: true }); });",
    "} else if (process.argv[2] === 'pack') {",
    "    console.log('packing app...');",
    "    var out = process.argv[process.argv.indexOf('-d') + 1];",
    "    fs.mkdirSync(out, { recursive: true });",
    "    fs.writeFileSync(path.join(out, 'index.html'), '<html></html>');",
    "}"
].join('\n');

var root, enyoDev, log;

function run(script, args, env) {
    return cp.spawnSync(process.env.HARNESS_SH || "sh", [path.join(root, 'tests', script)].concat(args || []), {
        encoding: 'utf8',
        env: Object.assign({}, process.env, { ENYO_DEV: enyoDev, STUB_LOG: log }, env || {})
    });
}

function calls() {
    return fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
}

beforeEach(function () {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'messaging-harness-'));
    fs.mkdirSync(path.join(root, 'tests'));
    fs.mkdirSync(path.join(root, 'app'));
    fs.writeFileSync(path.join(root, 'app', '.enyoconfig'), '{ "title": "Messaging" }\n');
    fs.writeFileSync(path.join(root, 'app', 'package.json'), '{ "name": "Messaging" }\n');
    ['libs.sh', 'pack.sh'].forEach(function (s) {
        fs.copyFileSync(path.join(TESTS, s), path.join(root, 'tests', s));
    });
    enyoDev = path.join(root, 'enyo-dev');
    fs.mkdirSync(path.join(enyoDev, 'bin'), { recursive: true });
    var bin = path.join(enyoDev, 'node_binaries', cp.execSync('uname -m').toString().trim());
    fs.mkdirSync(bin, { recursive: true });
    fs.symlinkSync(process.execPath, path.join(bin, 'node'));
    fs.writeFileSync(path.join(enyoDev, 'bin', 'enyo.js'), STUB);
    log = path.join(root, 'calls.log');
});

afterEach(function () {
    fs.rmSync(root, { recursive: true, force: true });
});

describe('libs.sh', function () {
    it('fetches app/lib on a fresh checkout, and says nothing on stdout', function () {
        var r = run('libs.sh');
        assert.equal(r.status, 0, r.stderr);
        assert.equal(r.stdout, '');
        assert.match(r.stderr, /Cloning into/);
        assert.ok(fs.existsSync(path.join(root, 'app', 'lib', 'webos-lib')));
        assert.deepEqual(calls(), ['init']);
    });

    it('leaves the app files init rewrites as they were', function () {
        assert.equal(run('libs.sh').status, 0);
        assert.equal(fs.readFileSync(path.join(root, 'app', '.enyoconfig'), 'utf8'), '{ "title": "Messaging" }\n');
        assert.equal(fs.readFileSync(path.join(root, 'app', 'package.json'), 'utf8'), '{ "name": "Messaging" }\n');
        assert.equal(fs.existsSync(path.join(root, 'app', '.gitignore')), false);
    });

    it('keeps an app .gitignore that was there', function () {
        fs.writeFileSync(path.join(root, 'app', '.gitignore'), 'mine\n');
        assert.equal(run('libs.sh').status, 0);
        assert.equal(fs.readFileSync(path.join(root, 'app', '.gitignore'), 'utf8'), 'mine\n');
    });

    it('restores them when the fetch fails too', function () {
        assert.notEqual(run('libs.sh', [], { STUB_INIT_FAIL: '1' }).status, 0);
        assert.equal(fs.readFileSync(path.join(root, 'app', 'package.json'), 'utf8'), '{ "name": "Messaging" }\n');
        assert.equal(fs.existsSync(path.join(root, 'app', '.gitignore')), false);
    });

    it('does not fetch again once the libraries are there', function () {
        run('libs.sh');
        var r = run('libs.sh');
        assert.equal(r.status, 0, r.stderr);
        assert.deepEqual(calls(), ['init']);
    });

    it('fetches again when webos-lib, the last one, is missing', function () {
        fs.mkdirSync(path.join(root, 'app', 'lib', 'enyo'), { recursive: true });
        assert.equal(run('libs.sh').status, 0);
        assert.deepEqual(calls(), ['init']);
    });

    it('fetches again when enyo is missing', function () {
        fs.mkdirSync(path.join(root, 'app', 'lib', 'webos-lib'), { recursive: true });
        assert.equal(run('libs.sh').status, 0);
        assert.deepEqual(calls(), ['init']);
    });

    it('fails when the fetch fails, or there is no enyo-dev', function () {
        assert.notEqual(run('libs.sh', [], { STUB_INIT_FAIL: '1' }).status, 0);
        var r = run('libs.sh', [], { ENYO_DEV: path.join(root, 'nowhere') });
        assert.notEqual(r.status, 0);
        assert.match(r.stderr, /no enyo-dev found/);
        assert.equal(r.stdout, '');
    });
});

describe('pack.sh', function () {
    it('prints only the pack directory, on a fresh checkout too', function () {
        var work = path.join(root, 'work');
        var r = run('pack.sh', [work]);
        assert.equal(r.status, 0, r.stderr);
        assert.equal(r.stdout, path.join(work, 'org.webosports.app.messaging') + '\n');
        assert.match(r.stderr, /packing app/);
        assert.deepEqual(calls(), ['init', 'pack']);
    });

    it('stops, with nothing on stdout, when the fetch fails', function () {
        var r = run('pack.sh', [path.join(root, 'work')], { STUB_INIT_FAIL: '1' });
        assert.notEqual(r.status, 0);
        assert.equal(r.stdout, '');
        assert.deepEqual(calls(), ['init']);
    });
});

describe('run.sh', function () {
    it('fetches the libraries before the unit tests', function () {
        var text = fs.readFileSync(path.join(TESTS, 'run.sh'), 'utf8');
        var libs = text.indexOf('libs.sh"');
        assert.ok(libs > 0, 'run.sh calls libs.sh');
        assert.ok(libs < text.indexOf('node --test "$HERE"/unit/'), 'before the unit tests');
    });
});
